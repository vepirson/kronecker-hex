// The hash router and the page shell.
//
// Hash grammar: "#/" + path segments + optional "?" + query (key=value pairs joined by "&", percent-encoded, "," kept
// as is). Routes come from routes.mjs. A page module exports mount(root, ctx) returning unmount(), with
// ctx = { store, navigate, params, query }. On every route change the previous page is unmounted and the <main>
// element is emptied before the next page is mounted. Before mounting, the layout of the route ("app" or "doc", see
// routes.mjs) is written as data-layout on <body> (the layout rules live in styles/base.css), and the document title
// is set to pageTitle of the route. An address of the old path of the Algorithm page (LAB_ALIAS) is replaced by the
// same address under its path (aliasRedirect).
//
// The focus rule of the site: the shell marks <html> with data-input="pointer" at every pointer press and
// data-input="keyboard" at every Tab or Shift+Tab (other keys leave it), and styles/base.css draws a focus ring only
// while the mark is not "pointer". A mouse user then never meets a ring after a click followed by Escape or an arrow
// key, a keyboard user always sees where the focus is.

import { ROUTES, layoutOf, pageTitle, EXPLORE_PATH, EDIT_PATH, LAB_PATH, LAB_ALIAS, homeQuery, HOME_REGION } from "./routes.mjs";
import { createStore, defaultState } from "./store.mjs";
import { h } from "./dom.mjs";
import { icon, setIconLabel, PAGE_ICONS } from "./widgets/icons.mjs";
import { CodedError } from "../core/bigint_utils.mjs";

// ---------- pure parts (also used by the tests) ----------

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// parseQuery("a=1&b=x%2Cy") returns { a: "1", b: "x,y" }. A "+" stays a "+". The last of repeated keys wins.
export function parseQuery(text) {
  const out = {};
  if (!text) return out;
  for (const part of text.split("&")) {
    if (part === "") continue;
    const k = part.indexOf("=");
    const key = safeDecode(k < 0 ? part : part.slice(0, k));
    const val = k < 0 ? "" : safeDecode(part.slice(k + 1));
    if (key !== "") out[key] = val;
  }
  return out;
}

// normalisePath("#/explore/") returns "#/explore": a leading "#/" is ensured, a trailing "/" dropped (except "#/").
export function normalisePath(path) {
  let p = String(path || "");
  if (p.startsWith("#")) p = p.slice(1);
  if (!p.startsWith("/")) p = "/" + p;
  while (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return "#" + p;
}

// parseHash(hash) splits a location hash into { path, query }: path normalised as above, query a plain object of
// strings. "" and "#" give the path "#/".
export function parseHash(hash) {
  const s = String(hash || "");
  const q = s.indexOf("?");
  const path = normalisePath(q < 0 ? s : s.slice(0, q));
  const query = parseQuery(q < 0 ? "" : s.slice(q + 1));
  return { path, query };
}

function segments(path) {
  const p = normalisePath(path).slice(2);
  return p === "" ? [] : p.split("/");
}

// matchPattern(pattern, path) returns the params object ({ name: decoded segment }) when the normalised path matches
// the pattern ("#/lab/w/:token"), else null. A ":name" segment matches one non-empty segment.
export function matchPattern(pattern, path) {
  const ps = segments(pattern);
  const xs = segments(path);
  if (ps.length !== xs.length) return null;
  const params = {};
  for (let k = 0; k < ps.length; k++) {
    if (ps[k].startsWith(":")) {
      const v = safeDecode(xs[k]);
      if (v === "") return null;
      params[ps[k].slice(1)] = v;
    } else if (ps[k] !== xs[k]) {
      return null;
    }
  }
  return params;
}

// matchRoute(hash, routes) returns { route, params, query, path } for the first matching route, or null.
export function matchRoute(hash, routes = ROUTES) {
  const { path, query } = parseHash(hash);
  for (const route of routes) {
    const params = matchPattern(route.pattern, path);
    if (params) return { route, params, query, path };
  }
  return null;
}

function encodePart(v) {
  return encodeURIComponent(String(v)).replace(/%2C/gi, ",");
}

// buildHash(path, query) returns the hash text navigate goes to: the normalised path, then "?" and the query pairs
// in key order (values converted with String, undefined and null values left out). Throws "bad_path" unless path
// starts with "#/".
export function buildHash(path, query) {
  if (typeof path !== "string" || !path.startsWith("#/")) throw new CodedError("bad_path", `a route path starts with "#/", got ${JSON.stringify(path)}`);
  const q = path.indexOf("?");
  const base = normalisePath(q < 0 ? path : path.slice(0, q));
  const pairs = [];
  const merged = q < 0 ? {} : parseQuery(path.slice(q + 1));
  if (query) for (const [k, v] of Object.entries(query)) merged[k] = v;
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null) continue;
    pairs.push(`${encodePart(k)}=${encodePart(v)}`);
  }
  return pairs.length ? `${base}?${pairs.join("&")}` : base;
}

// homeRedirect(hash) is the address that replaces an address without a page ("", "#", "#/", with or without a query):
// the Explorer at the home view (routes.mjs HOME_VIEW). null for any other address.
export function homeRedirect(hash) {
  return parseHash(hash).path === "#/" ? buildHash(EXPLORE_PATH, homeQuery()) : null;
}

// aliasRedirect(hash) is the address that replaces an address under the old path of the Algorithm page: "#/lab",
// "#/lab?preset=c100", "#/lab/w/<token>" become "#/algorithm", "#/algorithm?preset=c100", "#/algorithm/w/<token>" (the
// rest of the address kept as it is). null for any other address.
export function aliasRedirect(hash) {
  const s = String(hash || "");
  const q = s.indexOf("?");
  const { path } = parseHash(s);
  if (path !== LAB_ALIAS && !path.startsWith(`${LAB_ALIAS}/`)) return null;
  return LAB_PATH + path.slice(LAB_ALIAS.length) + (q < 0 ? "" : s.slice(q));
}

// pageOf(hash, routes) is the page (route.page) of an address, or null when no route matches.
export function pageOf(hash, routes = ROUTES) {
  const m = matchRoute(hash, routes);
  return m ? m.route.page || null : null;
}

// ---------- navigation ----------

let onRoute = null; // set by startApp: re-renders the current hash
// The hash the mounted page belongs to: the one rendered last, or written last by a silent navigate. null before the
// first render.
let shownHash = null;

// markShown() records the current address as the mounted page's. The shell calls it at every render.
export function markShown() {
  shownHash = location.hash;
}

// navigate(path, query, { replace, silent }) goes to the hash buildHash(path, query). replace: the history entry is
// replaced instead of added. silent: only the address bar changes, the current page stays mounted (for a
// page that mirrors its own state in the URL). Navigating to the current hash does nothing.
// A silent navigate is DROPPED when the address is no longer the mounted page's (somebody went elsewhere and the
// hashchange has not been handled yet): a page that mirrors its state late must not take the address back.
export function navigate(path, query, { replace = false, silent = false } = {}) {
  const target = buildHash(path, query);
  if (target === normaliseCurrent()) return;
  if (silent && shownHash !== null && location.hash !== shownHash) return;
  if (silent || replace) {
    history[replace ? "replaceState" : "pushState"](null, "", target);
    if (silent) shownHash = location.hash;
    else if (onRoute) onRoute();
    return;
  }
  location.hash = target;
}

function normaliseCurrent() {
  const { path, query } = parseHash(location.hash);
  return buildHash(path, query);
}

// ---------- the shell ----------

const PREFS_KEY = "kronecker-hex-prefs";
// The two themes of the theme button. Before the first click no theme is chosen and the page shows the light theme,
// whatever the system prefers.
const THEMES = ["light", "dark"];
const PALETTES = ["standard", "colourblind"];

// shownTheme(theme) is the theme the page shows: the chosen one ("light" or "dark"), else "light".
export function shownTheme(theme) {
  return THEMES.includes(theme) ? theme : "light";
}

// nextTheme(theme) is the theme a click on the theme button chooses: the other one of the theme shown.
export function nextTheme(theme) {
  return shownTheme(theme) === "dark" ? "light" : "dark";
}

function readPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    const out = {};
    if (THEMES.includes(p.theme)) out.theme = p.theme;
    if (PALETTES.includes(p.palette)) out.palette = p.palette;
    return out;
  } catch {
    return {};
  }
}

function writePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: prefs.theme, palette: prefs.palette }));
  } catch {
    // storage may be unavailable (private mode), the preference then lasts for this page only
  }
}

// applyPrefs(prefs) sets data-theme and data-palette on <html> (the hex views redraw by themselves).
export function applyPrefs(prefs) {
  const root = document.documentElement;
  if (prefs.theme === "light" || prefs.theme === "dark") root.dataset.theme = prefs.theme;
  else delete root.dataset.theme;
  if (prefs.palette === "colourblind") root.dataset.palette = "colourblind";
  else delete root.dataset.palette;
}

// The header's entries that open the selection of the site: their address and the name of the function of
// actions.mjs that opens their page (the same function as the region buttons of the pages).
export const NAV_OPENERS = Object.freeze({ [EDIT_PATH]: "openInEditor", [LAB_PATH]: "openInLab" });

// The labels of the two header switches (title and aria-label of the icon buttons): what a press does, the palette
// or the theme it switches to.
export function paletteLabel(palette) {
  return palette === "colourblind" ? "Standard colours" : "Colour-blind colours";
}
export function themeLabel(theme) {
  return nextTheme(theme) === "dark" ? "Dark theme" : "Light theme";
}

// inputKindOf(event) is the kind of input an event shows for the focus rule: "pointer" for a pointer press,
// "keyboard" for Tab or Shift+Tab, null for every other event (the mark stays).
export function inputKindOf(e) {
  if (!e) return null;
  if (e.type === "pointerdown") return "pointer";
  if (e.type === "keydown" && e.key === "Tab") return "keyboard";
  return null;
}

// homeHref() is the Explorer's address of the home view with the home cell selected (the view of its default state).
export function homeHref() {
  return buildHash(EXPLORE_PATH, { ...homeQuery(), sel: "0,0" });
}

// appState() is the first state of the site: defaultState of the store with the home cell as the selection (the
// record the Explorer's default state makes for it: HOME_REGION, home true, stamp 1, so that the Explorer finds it
// the same and keeps it) and, for the editor, the home view as the Explorer address that region came from (so that
// the eye on the unchanged home cell opens the Explorer there). A visit that starts on any page has the selection
// that a visit of the Explorer gives.
export function appState() {
  const st = defaultState();
  const shape = HOME_REGION.shape.map(([i, j]) => [i, j]);
  const seed = [HOME_REGION.seed[0], HOME_REGION.seed[1]];
  st.selection = { shape, seed, colour: HOME_REGION.colour, token: null, home: true, stamp: 1 };
  st.editor = { ...st.editor, origin: { href: homeHref(), cells: shape.map(([i, j]) => [i, j]), colour: HOME_REGION.colour, stamp: 1 } };
  return st;
}

// startApp({ root, routes, store }) starts the site: preferences, header switches, the focus rule, and the router on
// the <main> element. Returns { store, stop() }.
export function startApp({ root = document.getElementById("main"), routes = ROUTES, store = null } = {}) {
  const st = store || createStore(appState());
  st.set({ prefs: readPrefs() });
  applyPrefs(st.get().prefs);

  // the focus rule: the last kind of input, on <html> (read by styles/base.css)
  const onInput = (e) => {
    const kind = inputKindOf(e);
    if (kind && document.documentElement.dataset.input !== kind) document.documentElement.dataset.input = kind;
  };
  document.addEventListener("pointerdown", onInput, true);
  document.addEventListener("keydown", onInput, true);

  const themeBtn = document.getElementById("theme-switch");
  const paletteBtn = document.getElementById("palette-switch");
  if (themeBtn && !themeBtn.querySelector("svg")) themeBtn.replaceChildren(icon("theme"));
  if (paletteBtn && !paletteBtn.querySelector("svg")) paletteBtn.replaceChildren(icon("palette"));
  // each header entry: the icon of its page (PAGE_ICONS) before its label, the external icon before the label of the
  // entry that leaves the site (data-external: a plain link opened in a new tab, never handled here)
  for (const a of document.querySelectorAll(".site-nav a[data-nav], .site-nav a[data-external]")) {
    const name = a.dataset.nav ? PAGE_ICONS[pageOf(a.dataset.nav, routes)] : "external";
    if (name && !a.querySelector("svg")) a.prepend(icon(name));
  }
  // the header's entries Edit and Algorithm open the selection of the site by the functions of the region buttons of the
  // pages (named by NAV_OPENERS, actions.mjs is loaded at the first click); a click with a modifier key or another
  // button keeps the link's own behaviour
  const onPageEntry = (e) => {
    const nav = e.currentTarget.dataset.nav;
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    import("./actions.mjs").then(
      (m) => m[NAV_OPENERS[nav]]({ store: st, navigate }),
      (err) => (console.error(err), navigate(nav)),
    );
  };
  const pageEntries = [...document.querySelectorAll(".site-nav a[data-nav]")].filter((a) => NAV_OPENERS[a.dataset.nav]);
  for (const a of pageEntries) a.addEventListener("click", onPageEntry);
  const label = () => {
    const p = st.get().prefs;
    if (themeBtn) {
      setIconLabel(themeBtn, themeLabel(p.theme));
      themeBtn.dataset.value = shownTheme(p.theme);
    }
    if (paletteBtn) {
      setIconLabel(paletteBtn, paletteLabel(p.palette));
      paletteBtn.dataset.value = p.palette === "colourblind" ? "colourblind" : "standard";
    }
  };
  label();
  const onTheme = () => {
    st.set({ prefs: { theme: nextTheme(st.get().prefs.theme) } });
  };
  const onPalette = () => {
    st.set({ prefs: { palette: st.get().prefs.palette === "colourblind" ? "standard" : "colourblind" } });
  };
  if (themeBtn) themeBtn.addEventListener("click", onTheme);
  if (paletteBtn) paletteBtn.addEventListener("click", onPalette);
  const unsubPrefs = st.subscribe((s, patch) => {
    if (!patch.prefs) return;
    applyPrefs(s.prefs);
    writePrefs(s.prefs);
    label();
  });

  let unmount = null;
  let gen = 0;
  // the header's entry of the page of path is the current one (null: none)
  const markNav = (path) => {
    const page = path === null ? null : pageOf(path, routes);
    for (const a of document.querySelectorAll("[data-nav]")) {
      if (page !== null && pageOf(a.dataset.nav, routes) === page) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
  };
  const render = async () => {
    const my = ++gen;
    if (unmount) {
      const u = unmount;
      unmount = null;
      try {
        u();
      } catch (e) {
        console.error(e);
      }
    }
    root.replaceChildren();
    // the site has no page of its own at "#/": it always lands in the Explorer (the entry is replaced, so Back never
    // returns to "#/"), and an address of the old path of the Algorithm page lands at its new path
    const home = homeRedirect(location.hash) || aliasRedirect(location.hash);
    if (home) history.replaceState(null, "", home);
    markShown();
    const m = matchRoute(location.hash, routes);
    document.body.dataset.layout = layoutOf(m ? m.route : null);
    document.title = pageTitle(m ? m.route : null);
    if (!m) {
      markNav(null);
      root.replaceChildren(
        h("h1", { class: "page-title" }, "Page not found"),
        h("p", { class: "page-lead" }, "There is no page at this address. ", h("a", { href: "#/" }, "Go to the Explorer"), "."),
      );
      return;
    }
    markNav(m.path);
    let mod;
    try {
      mod = await m.route.load();
    } catch (e) {
      if (my !== gen) return;
      console.error(e);
      root.replaceChildren(h("p", { class: "page-error" }, "This page could not be loaded."));
      return;
    }
    if (my !== gen) return;
    try {
      const u = mod.mount(root, { store: st, navigate, params: m.params, query: m.query });
      unmount = typeof u === "function" ? u : null;
    } catch (e) {
      console.error(e);
      root.replaceChildren(h("p", { class: "page-error" }, "This page failed to start."));
    }
    window.scrollTo(0, 0);
  };
  onRoute = render;
  window.addEventListener("hashchange", render);
  render();
  return {
    store: st,
    stop() {
      window.removeEventListener("hashchange", render);
      if (themeBtn) themeBtn.removeEventListener("click", onTheme);
      if (paletteBtn) paletteBtn.removeEventListener("click", onPalette);
      for (const a of pageEntries) a.removeEventListener("click", onPageEntry);
      document.removeEventListener("pointerdown", onInput, true);
      document.removeEventListener("keydown", onInput, true);
      unsubPrefs();
      gen++;
      if (unmount) unmount();
      unmount = null;
      onRoute = null;
    },
  };
}
