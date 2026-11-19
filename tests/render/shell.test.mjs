// The shell: the layout of each route, the header's entries and their tooltips, a page without a footer, no question
// link in the Explorer's details, the labels of the two header switches, the input kinds of the focus rule, the icons,
// and the placement of a popover inside its host.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ROUTES, LAYOUTS, layoutOf, pageTitle, SITE_TITLE } from "../../src/ui/routes.mjs";
import { matchRoute, paletteLabel, themeLabel, shownTheme, nextTheme, inputKindOf, pageOf } from "../../src/ui/router.mjs";
import { ICONS, PAGE_ICONS, PAGE_ACTIONS } from "../../src/ui/widgets/icons.mjs";
import { popoverBox, POPOVER_MAX_WIDTH, POPOVER_GAP, POPOVER_EDGE } from "../../src/ui/widgets/popover.mjs";

test("layout per route: Explorer, shape editor and Algorithm page fill the page (app), the others are text pages (doc)", () => {
  assert.deepEqual(LAYOUTS, ["app", "doc"]);
  const want = {
    "#/explore": "app",
    "#/explore?w=blue_g003": "app",
    "#/w/AAAA": "app",
    "#/edit": "app",
    "#/edit?s=AAAA&colour=red": "app",
    "#/algorithm": "app",
    "#/algorithm?preset=c100": "app",
    "#/algorithm/w/AAAA": "app",
    "#/gallery": "doc",
  };
  for (const [hash, layout] of Object.entries(want)) {
    const m = matchRoute(hash, ROUTES);
    assert.ok(m, hash);
    assert.equal(layoutOf(m.route), layout, hash);
  }
  assert.equal(layoutOf(null), "doc", "a page that is not found");
  assert.equal(layoutOf({ pattern: "#/x" }), "doc", "no layout given");
  for (const r of ROUTES) assert.ok(LAYOUTS.includes(r.layout), r.pattern);
});

test("document title per route: the page's name and the site's, index.html holds the title of the site", () => {
  const want = {
    "#/explore": "Explore - Kronecker Hex",
    "#/explore?w=blue_g003": "Explore - Kronecker Hex",
    "#/w/AAAA": "Explore - Kronecker Hex",
    "#/edit": "Edit - Kronecker Hex",
    "#/algorithm": "Algorithm - Kronecker Hex",
    "#/algorithm?preset=c100": "Algorithm - Kronecker Hex",
    "#/algorithm/w/AAAA": "Algorithm - Kronecker Hex",
    "#/gallery": "Gallery - Kronecker Hex",
  };
  for (const [hash, title] of Object.entries(want)) assert.equal(pageTitle(matchRoute(hash, ROUTES).route), title, hash);
  assert.equal(pageTitle(null), "Page not found - Kronecker Hex");
  // the site has no Proof page: its old address is an unknown one
  assert.equal(matchRoute("#/proof", ROUTES), null);
  const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  assert.equal(/<title>([^<]*)<\/title>/.exec(html)[1], SITE_TITLE);
  // two pages never share a title unless they are the same page
  const byModule = new Map();
  for (const r of ROUTES) {
    const t = pageTitle(r);
    const key = String(r.load);
    if (byModule.has(t)) assert.equal(byModule.get(t), key, t);
    byModule.set(t, key);
  }
});

test("the header's entries: the page names, each tooltip says in a few words what its page is, the site name has a tooltip", () => {
  const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  // the label after the page icon is the page's name (its document title), the tooltip a short phrase of what it shows
  // (useful below 600 px, where the label is hidden): never the label again, at most four words, no full stop
  const entries = [...html.matchAll(/<a href="([^"]+)" data-nav="([^"]+)" title="([^"]+)"><span class="site-nav-label">([^<]+)<\/span><\/a>/g)];
  assert.deepEqual(entries.map((m) => m[4]), ["Explore", "Edit", "Algorithm", "Gallery"]);
  for (const [, href, nav, title, label] of entries) {
    assert.equal(href, nav, label);
    assert.equal(pageTitle(matchRoute(href, ROUTES).route), `${label} - Kronecker Hex`, label);
    assert.ok(!title.includes(label) && title.split(" ").length <= 4 && !title.endsWith(".") && /^[A-Z]/.test(title), title);
  }
  // every entry has the icon of its page (the page of its address)
  assert.deepEqual(entries.map((m) => PAGE_ICONS[pageOf(m[1])]), ["eye", "edit", "flask", "gallery"]);
  // the entry Proofs between Algorithm and Gallery: a plain link to the question, in a new tab, no address of the site
  const proofs = /<a href="([^"]+)" target="_blank" rel="noopener noreferrer" data-external="" title="([^"]+)"><span class="site-nav-label">Proofs<\/span><\/a>/.exec(html);
  assert.ok(proofs, "the entry Proofs");
  assert.deepEqual([proofs[1], proofs[2]], ["https://math.stackexchange.com/q/5145414/318073", "Proofs on Mathematics Stack Exchange"]);
  const order = [...html.matchAll(/<span class="site-nav-label">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(order, ["Explore", "Edit", "Algorithm", "Proofs", "Gallery"]);
  // the site name leads to the source code, a plain link in a new tab as the entry Proofs (no page of the site, never
  // marked current, no icon of its own beside the mark); it is an icon alone on a phone: its tooltip is its accessible
  // name
  const name = /<a class="site-name" href="([^"]+)" target="_blank" rel="noopener noreferrer" title="([^"]+)" aria-label="([^"]+)">/.exec(html);
  assert.ok(name, "the site name");
  assert.deepEqual([name[1], name[2], name[3]], ["https://github.com/vepirson/kronecker-hex", "Source code on GitHub", "Source code on GitHub"]);
  assert.ok(!/class="site-name"[^>]*data-(nav|external)/.test(html), "never handled by the router");
});

test("no footer: no element in index.html, no footer code in the router, no footer styles", () => {
  const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  assert.ok(!/<footer|site-footer/.test(html), "index.html");
  const router = fs.readFileSync(new URL("../../src/ui/router.mjs", import.meta.url), "utf8");
  assert.ok(!/footer/i.test(router), "router.mjs");
  const css = fs.readFileSync(new URL("../../styles/base.css", import.meta.url), "utf8");
  assert.ok(!/footer/i.test(css), "styles/base.css");
});

test("the Explorer's details have no question link: the page does not read the credits file", () => {
  const page = fs.readFileSync(new URL("../../src/ui/pages/explore.mjs", import.meta.url), "utf8");
  assert.ok(!/credits\.json|questionOf|explore-question-link/.test(page));
});

test("header switches: each label names what a press does, the palette or theme it switches to", () => {
  assert.equal(paletteLabel("standard"), "Colour-blind colours");
  assert.equal(paletteLabel("colourblind"), "Standard colours");
  // two states: before the first click the light theme is shown, a click chooses the dark one
  assert.equal(themeLabel(null), "Dark theme");
  assert.equal(themeLabel("light"), "Dark theme");
  assert.equal(themeLabel("dark"), "Light theme");
  assert.equal(themeLabel("system"), "Dark theme", "an old stored value counts as no choice: light");
});

test("theme button: two states, light before any choice, the first click picks dark, then light and dark alternate", () => {
  assert.equal(shownTheme(null), "light");
  assert.equal(shownTheme(undefined), "light");
  assert.equal(shownTheme("system"), "light");
  assert.equal(shownTheme("dark"), "dark");
  assert.equal(shownTheme("light"), "light");
  let t = null;
  const seen = [];
  for (let k = 0; k < 4; k++) {
    t = nextTheme(t);
    seen.push(t);
  }
  assert.deepEqual(seen, ["dark", "light", "dark", "light"]);
  assert.ok(seen.every((x) => x === "light" || x === "dark"), "no third state");
  // the router never reads the system's colour scheme
  const src = fs.readFileSync(new URL("../../src/ui/router.mjs", import.meta.url), "utf8");
  assert.equal(/prefers-color-scheme|matchMedia/.test(src), false);
});

test("the focus rule: a pointer press marks pointer, Tab and Shift+Tab mark keyboard, every other key leaves the mark", () => {
  assert.equal(inputKindOf({ type: "pointerdown", pointerType: "mouse" }), "pointer");
  assert.equal(inputKindOf({ type: "pointerdown", pointerType: "touch" }), "pointer");
  assert.equal(inputKindOf({ type: "keydown", key: "Tab" }), "keyboard");
  assert.equal(inputKindOf({ type: "keydown", key: "Tab", shiftKey: true }), "keyboard");
  for (const key of ["Escape", "ArrowLeft", "Enter", " ", "+", "f"]) assert.equal(inputKindOf({ type: "keydown", key }), null, key);
  assert.equal(inputKindOf(null), null);
  // the one rule of styles/base.css: a ring for every control unless the last input was a pointer (a text field keeps
  // it), a thin neutral frame inside a hex canvas, and no other ring rule in the shared styles
  const css = fs.readFileSync(new URL("../../styles/base.css", import.meta.url), "utf8");
  assert.ok(css.includes(':focus-visible { outline: 2px solid var(--select); outline-offset: 1px; }'));
  assert.ok(css.includes(':root[data-input="pointer"] :focus-visible:not(input, textarea) { outline: none; }'));
  assert.ok(css.includes(".hexview canvas:focus-visible { outline: 1px solid var(--muted); outline-offset: -1px; }"));
  assert.equal((css.match(/:focus-visible/g) || []).length, 3, "no other focus ring rule in base.css");
});

test("icons: every icon used by the shell, the Explorer and the editor exists, ASCII paths", () => {
  for (const n of ["palette", "theme", "go", "open", "edit", "plus", "minus", "fit", "gear", "stop", "details", "close", "copy", "draw", "move", "undo", "redo", "gallery", "download", "eye", "flask", "home", "clear", "external"]) {
    assert.ok(Array.isArray(ICONS[n]) && ICONS[n].length > 0, n);
  }
  // one draw tool, no seed tool, no done button, no start-shapes menu, no link button, no Proof page: their icons are
  // gone
  for (const n of ["paint", "erase", "seed", "done", "presets", "link", "page"]) assert.equal(ICONS[n], undefined, n);
  // Clear has its own icon, not the close X
  assert.notDeepEqual(ICONS.clear, ICONS.close);
  assert.ok(/^[\x20-\x7e]*$/.test(JSON.stringify(ICONS)));
});

test("page icons: one icon per page of the header, four different icons, each used for its page only", () => {
  assert.deepEqual(Object.keys(PAGE_ICONS), ["explore", "edit", "lab", "gallery"]);
  assert.deepEqual(PAGE_ICONS, { explore: "eye", edit: "edit", lab: "flask", gallery: "gallery" });
  assert.equal(new Set(Object.values(PAGE_ICONS)).size, 4);
  for (const n of Object.values(PAGE_ICONS)) assert.ok(Array.isArray(ICONS[n]), n);
  assert.deepEqual(PAGE_ACTIONS, { explore: "Show in Explorer", edit: "Edit shape", lab: "Show algorithm" });
  // every page of the routes has its icon
  for (const r of ROUTES) assert.ok(PAGE_ICONS[r.page], r.pattern);
  // no other control of the site draws a page icon: the icon names of the page icons appear in the page code only
  // through the page-icon helpers (pageIconButton, pageIconLink) or the header
  const root = new URL("../../src/ui/", import.meta.url);
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = new URL(e.name + (e.isDirectory() ? "/" : ""), dir);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".mjs")) files.push(p);
    }
  };
  walk(root);
  const bad = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    for (const n of Object.values(PAGE_ICONS)) {
      if (new RegExp(`(?:iconButton|icon)\\("${n}"`).test(text)) bad.push(`${f.pathname.split("/src/")[1]}: ${n}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("popover placement: below or above the anchor, inside the host, at most 360 px wide, the rest scrolls inside", () => {
  const host = { left: 0, top: 40, right: 1440, bottom: 900 };
  const below = popoverBox({ anchor: { left: 300, top: 48, right: 328, bottom: 76 }, host, placement: "below", align: "start", width: 320 });
  assert.equal(below.left, 300);
  assert.equal(below.top, 76 - 40 + POPOVER_GAP);
  assert.equal(below.maxHeight, 860 - (76 - 40) - POPOVER_GAP - POPOVER_EDGE);
  assert.equal(below.maxWidth, POPOVER_MAX_WIDTH);
  const above = popoverBox({ anchor: { left: 1380, top: 860, right: 1408, bottom: 888 }, host, placement: "above", align: "end", width: 340 });
  assert.equal(above.left, 1408 - 340);
  assert.equal(above.bottom, 900 - 860 + POPOVER_GAP);
  assert.equal(above.maxHeight, 860 - 40 - POPOVER_GAP - POPOVER_EDGE);
  // a narrow host (phone): the popover is clamped to the host width less the edges
  const phone = popoverBox({ anchor: { left: 300, top: 48, right: 328, bottom: 76 }, host: { left: 0, top: 40, right: 375, bottom: 740 }, placement: "below", align: "start", width: 360 });
  assert.equal(phone.maxWidth, 375 - 2 * POPOVER_EDGE);
  assert.ok(phone.left >= POPOVER_EDGE && phone.left + phone.maxWidth <= 375 - POPOVER_EDGE + 1);
});
