// The Gallery page: the title with a row of buttons, one per section (a press scrolls to the section and moves the
// focus to its heading), pinned at the top, then the sections of SECTIONS (src/ui/gallery/model.mjs) in order, each
// with its title and a grid of square cards. A card section shows cards of data/gallery.json, a family section the
// members of one page (PAGE_SIZE cards, page buttons of widgets/pager.mjs): the first page built in the browser in the
// construct worker, the others opened from their stored tokens in the same worker (FAMILY_TOKENS_FILE, loadFamilyCard
// of gallery/memory.mjs).
// A section with two or three region types has a switch (+1, -1, 0). Only the cards of the present page and type exist
// in the document, and only they are prepared. The page and the type of each section are kept in the store (key
// gallery) for the visit, so that coming back from another page shows the same cards, and what a card found (its
// check and its picture) is kept in the page's memory (gallery/memory.mjs): a card met again in the visit is shown at
// once, with no check and no drawing (another size, theme or palette draws its picture again).
// Each card draws a region (every cell soft, the region at full strength with its outline) and verifies it: a family
// card's witness (built or stored), a token or a witness file is checked by verifyWitness in the region worker, a
// region found in the grid is flood filled in the worker (its symmetry recomputed when the card states one). The caption numbers come
// from that check. Cards are drawn only when near the viewport, one after the other. Nothing changes size while
// loading: every card has its square and its caption line from the first paint, and a grid keeps the places of the
// most cards its section shows. Once its region is known a card shows the action icons at its top right
// (regionActions of src/ui/actions.mjs, the same actions and conditions as the Explorer's chip): the eye (the card's
// own target), the pencil (its shape in the editor, in the card's region type), the flask (the algorithm), disabled
// with its reason alone when the algorithm does not take the shape. The pencil and the flask first make the card's
// region the selection of the site, which the header's Edit and Algorithm then open too.

import { h, useStyles, loadJson } from "../dom.mjs";
import { mathText } from "../widgets/math.mjs";
import { kroneckerSource, resolveColours } from "../../render/hex_canvas.mjs";
import { parseBigIntStrict, CodedError } from "../../core/bigint_utils.mjs";
import { openToken } from "../../formats/token.mjs";
import { makeWitness } from "../../formats/witness.mjs";
import {
  SECTIONS, sectionCards, sectionSlots, sectionPages, pageName, familyKey, statedOf, cardHref, captionParts,
  typeText, symmetryOrder, NATURAL_CAP, FAMILY_TOKENS_FILE,
} from "../gallery/model.mjs";
import { createCardElement, createSlot, typeSwitch, drawRegion, createRegionWorker, createConstructWorker, watchTheme } from "../gallery/cards.mjs";
import { loadFamilyCard, keepChecked, checkedOf, pictureKey, keepPicture, showPicture, hasPicture, memoryStats } from "../gallery/memory.mjs";
import { createPager, clampPage } from "../widgets/pager.mjs";
import { pageIconButton, pageIconLink, PAGE_ACTIONS } from "../widgets/icons.mjs";
import { regionActions, openInEditor, openInLab } from "../actions.mjs";

const url = (p) => new URL(p, import.meta.url);

let current = null;

// testHandles() returns live handles of the mounted page for automated browser checks, or null when the page is not
// mounted: { ready, error, total, done, failed, tMount, tLast, firstHeight, redraws (completed redraws after a theme
// or palette change), sections ([{ id, kind, title, page, pages, colour, colours, cards }]), setPage(id, k),
// setColour(id, c), builds (the constructions run by this mount: [{ key, ms }]), cards (summaries of the cards in the
// document, in document order, each with its stated genus, member (the member of its family, null for another kind),
// from ("stored", "visit" or "built" for a family card), known (its check came from the memory) and pictureKept (its
// picture came from the memory)), card(k) (the internal record of card k),
// worker (stats of the region worker), construct (stats of the construct worker), memory (memoryStats of
// gallery/memory.mjs) }.
export function testHandles() {
  return current ? current.handles() : null;
}

// facts of a verifyWitness record: { pass, reasons, genus, area, digits }
function witnessFacts(v) {
  const f = (v.info && v.info.flood) || {};
  return { pass: v.pass === true, reasons: v.reasons || [], genus: f.genus, area: f.area, digits: v.info && v.info.digits ? v.info.digits.x0 : null };
}

// openedWitness(o, id) is { x0, d0, witness } of an opened token o (the value of openToken)
function openedWitness(o, id) {
  return { x0: o.x0, d0: o.d0, witness: makeWitness({ id, colour: o.data.colour, x0: o.x0, d0: o.d0, seed: o.data.seed, shape: o.data.shape }) };
}

// tokenWitness(text, id) opens a token on the main thread (openToken: structure, rebuild, tag, shape and genus) and
// returns { x0, d0, witness } (for the tokens of data/tokens.json, whose x has about 10000 digits at most)
function tokenWitness(text, id) {
  return openedWitness(openToken(text), id);
}

// the device pixel ratio the pictures are drawn at (as renderWindow takes it)
const pixelRatio = () => (typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1);

// mount(root, ctx) shows the Gallery in root and returns unmount(). ctx: { store, navigate } of the router (the
// pencil and the flask of a card hand its region over through them, the store keeps the pages and types).
export function mount(root, ctx = {}) {
  const tMount = performance.now();
  const st = {
    destroyed: false, ready: false, error: null, sections: [], cards: [], queue: [], running: false, tLast: null,
    firstHeight: null, tokens: null, familyTokens: null, gallery: null, builds: [], redraws: 0,
  };
  const worker = createRegionWorker(url("../../workers/floodfill.worker.mjs"));
  const builder = createConstructWorker(url("../../workers/construct.worker.mjs"));
  let observer = null;
  let stopTheme = null;

  // ---------- preparing a card: x0, d0, region cells, the check, the link ----------
  async function prepare(c, signal) {
    const card = c.card;
    if (card.kind === "family") {
      // a stored token (opened in the construct worker: its x has up to about 130000 digits), else this visit's
      // construction, else a live construction in the construct worker
      const r = await loadFamilyCard(card, {
        stored: st.familyTokens,
        open: async (token) => openedWitness(await builder.open(token, signal), null),
        build: async (input) => {
          const t0 = performance.now();
          const result = await builder.build(input, signal);
          st.builds.push({ key: familyKey(card), ms: Math.round(performance.now() - t0) });
          return result;
        },
      });
      return {
        colour: card.colour, x0: r.x0, d0: r.d0, cells: r.witness.shape, href: cardHref(card, r.token), from: r.from,
        subject: { kind: "witness", complete: true, cells: r.witness.shape, seed: r.witness.seed, colour: card.colour, token: r.token },
        check: async () => witnessFacts(await worker.verify(r.witness)),
      };
    }
    if (card.kind === "token") {
      const text = st.tokens[card.label];
      const { x0, d0, witness } = tokenWitness(text, card.label);
      return {
        colour: witness.colour, x0, d0, cells: witness.shape, href: cardHref(card, text),
        subject: { kind: "witness", complete: true, cells: witness.shape, seed: witness.seed, colour: witness.colour, token: text },
        check: async () => witnessFacts(await worker.verify(witness)),
      };
    }
    if (card.kind === "witness") {
      const w = await loadJson(url(`../../../data/witnesses/${card.file}.json`));
      const x0 = parseBigIntStrict(w.x0);
      const d0 = parseBigIntStrict(w.d0);
      if (x0 === null || d0 === null) throw new CodedError("bad_format", "The x or d of the region is not an integer.");
      return {
        colour: w.colour, x0, d0, cells: w.shape, href: cardHref(card),
        subject: { kind: "witness", complete: true, cells: w.shape, seed: w.seed, colour: w.colour, token: null },
        check: async () => witnessFacts(await worker.verify(w)),
      };
    }
    // natural: the region comes from the flood fill itself
    const x = parseBigIntStrict(card.x);
    const d = parseBigIntStrict(card.d);
    const r = await worker.fill(card.x, card.d, NATURAL_CAP);
    const res = r.result;
    const reasons = [];
    if (!res.complete) reasons.push(`at least ${res.area} cells (cap ${NATURAL_CAP})`);
    if (res.colour !== card.colour) reasons.push(`type ${typeText(res.colour)}, stated ${typeText(card.colour)}`);
    const facts = { pass: reasons.length === 0, reasons, genus: res.genus, area: res.area, digits: null };
    if (card.symmetry !== undefined && res.complete) {
      facts.symmetry = symmetryOrder(r.cells);
      if (facts.symmetry !== card.symmetry) reasons.push(`symmetry ${facts.symmetry}, stated ${card.symmetry}`);
      facts.pass = reasons.length === 0;
    }
    // the cells are offsets from (x, d), the clicked cell of the Explorer's address (sel=0,0), which is the seed
    return {
      colour: res.colour, x0: x, d0: d, cells: r.cells, href: cardHref(card),
      subject: { kind: "region", complete: res.complete === true, cells: r.cells, seed: [0, 0], colour: res.colour, token: null },
      check: async () => facts,
    };
  }

  // ---------- the action icons of a card: eye, pencil and flask, each enabled or disabled with its reason ----------
  // (a disabled flask has the reason alone as its tooltip, its accessible name is "<action>: <reason>")
  function cardActions(p) {
    const acts = regionActions(p.subject);
    const nav = { store: ctx.store, navigate: ctx.navigate };
    const canHand = !!(ctx.store && ctx.navigate);
    const why = acts.labWhy || "not available";
    const lab = acts.lab && canHand
      ? pageIconButton("lab", undefined, { class: "gal-act", dataset: { act: "lab" }, onclick: () => openInLab(nav, p.subject) })
      : pageIconButton("lab", why.charAt(0).toUpperCase() + why.slice(1), { class: "gal-act", dataset: { act: "lab" }, "aria-label": `${PAGE_ACTIONS.lab}: ${why}`, disabled: true });
    return [
      p.href ? pageIconLink("explore", p.href, undefined, { class: "gal-act", dataset: { act: "explore" } }) : null,
      acts.edit && canHand ? pageIconButton("edit", undefined, { class: "gal-act", dataset: { act: "edit" }, onclick: () => openInEditor(nav, p.subject) }) : null,
      lab,
    ];
  }

  // ---------- one card, start to mark ----------
  // the key of a card's picture now: its square's side (the drawing covers the whole square: its window is at least
  // this many pixels wide and high), the pixel ratio and the page's colours
  const sideOf = (c) => Math.ceil(c.ui.pic.getBoundingClientRect().width);
  const pictureKeyOf = (c, side) => pictureKey(c.card, { side, dpr: pixelRatio(), colours: resolveColours() });

  // drawCard(c, p, side, signal): the card's picture, the kept one when the memory has it for this size and these
  // colours, else drawn (and kept). Resolves with { source, fit, meta, kept }.
  async function drawCard(c, p, side, signal) {
    const key = pictureKeyOf(c, side);
    const source = kroneckerSource(p.x0, p.d0);
    const about = showPicture(key, c.ui.canvas);
    if (about) return { source, fit: about.fit, meta: about.meta, kept: true };
    const drawn = await drawRegion(c.ui.canvas, { source, cells: p.cells, side, signal });
    keepPicture(key, c.ui.canvas, { fit: drawn.fit, meta: drawn.meta });
    return { source, fit: drawn.fit, meta: drawn.meta, kept: false };
  }

  // failCard(c, reason): the card's check failed (its caption "not verified", the cross with the tooltip "Not
  // verified: <reason>")
  function failCard(c, reason) {
    c.reason = reason;
    c.caption = "not verified";
    const tip = reason ? `Not verified: ${reason}` : "Not verified";
    c.ui.setCaption(["not verified"], tip);
    c.ui.setMark("fail", tip);
    c.state = "fail";
  }

  async function runCard(c) {
    const gen = ++c.gen;
    const ctl = new AbortController();
    c.abort = ctl;
    c.state = "busy";
    c.tStart = performance.now();
    const stale = () => st.destroyed || gen !== c.gen;
    try {
      // a card met before in this visit: its prepared region and its check from the memory, no worker job
      const known = checkedOf(c.card);
      const p = known ? known.prepared : await prepare(c, ctl.signal);
      if (stale()) return;
      c.from = p.from || null;
      c.known = !!known;
      c.ui.setHref(p.href);
      c.ui.setActions(cardActions(p));
      const checking = known ? Promise.resolve(known.facts) : p.check();
      // the check of a card runs in the region worker: leaving the page while the picture is drawn rejects it with
      // "aborted", which the catch below handles (here only marked as handled, it is awaited later)
      checking.catch(() => {});
      const side = sideOf(c);
      const drawn = await drawCard(c, p, side, ctl.signal);
      const facts = await checking;
      if (!known) keepChecked(c.card, { prepared: { colour: p.colour, x0: p.x0, d0: p.d0, cells: p.cells, href: p.href, subject: p.subject, from: p.from }, facts });
      if (stale()) return;
      c.drawn = { source: drawn.source, cells: p.cells, fit: drawn.fit, meta: drawn.meta, side, kept: drawn.kept };
      c.colour = p.colour;
      const stated = statedOf(c.card);
      const reasons = facts.reasons.slice();
      if (facts.genus !== stated.genus) reasons.push(`genus ${facts.genus}, stated ${stated.genus}`);
      if (facts.area !== stated.area) reasons.push(`area ${facts.area}, stated ${stated.area}`);
      c.facts = facts;
      const name = `region of type ${typeText(p.colour)}`;
      if (facts.pass && reasons.length === 0) {
        const parts = captionParts(c.card, facts);
        c.caption = parts.join(" | ");
        c.ui.setCaption(parts, c.caption);
        c.ui.canvas.setAttribute("aria-label", `${name}, ${c.caption}${drawn.fit.cropped ? ", a part is shown" : ""}`);
        c.ui.canvas.title = drawn.fit.cropped ? "Part of the region" : "";
        if (!c.ui.canvas.title) c.ui.canvas.removeAttribute("title");
        c.ui.setMark("ok");
        c.state = "ok";
      } else {
        failCard(c, reasons.join(" | "));
      }
    } catch (e) {
      if (stale() || (e && e.code === "aborted")) return;
      failCard(c, String((e && e.message) || e));
      console.warn(e);
    }
    c.tDone = performance.now();
    st.tLast = c.tDone;
  }

  function enqueue(c) {
    if (c.queued || c.state !== "wait") return;
    c.queued = true;
    st.queue.push(c);
    st.queue.sort((a, b) => a.index - b.index);
    pump();
  }

  async function pump() {
    if (st.running) return;
    st.running = true;
    while (st.queue.length && !st.destroyed) {
      const c = st.queue.shift();
      c.queued = false;
      if (c.state !== "wait") continue;
      await runCard(c);
      // let the page breathe between two cards
      await new Promise((r) => setTimeout(r, 0));
    }
    st.running = false;
  }

  // startKnown(cards): every card of the list whose check and picture the memory has is finished at once (in the frame
  // that shows it: no queue, no worker, the awaits of runCard are already resolved)
  function startKnown(cards) {
    for (const c of cards) if (c.state === "wait" && checkedOf(c.card) && hasPicture(pictureKeyOf(c, sideOf(c)))) runCard(c);
  }

  // ---------- redraw after a theme or palette change (pictures only, the checks stay) ----------
  let redrawGen = 0;
  async function redrawAll() {
    const my = ++redrawGen;
    for (const c of st.cards) {
      if (st.destroyed || my !== redrawGen) return;
      if (!c.drawn || c.state === "busy") continue;
      const ctl = new AbortController();
      c.redrawAbort = ctl;
      try {
        await drawRegion(c.ui.canvas, { source: c.drawn.source, cells: c.drawn.cells, side: c.drawn.side, signal: ctl.signal, fit: c.drawn.fit });
        keepPicture(pictureKeyOf(c, c.drawn.side), c.ui.canvas, { fit: c.drawn.fit, meta: c.drawn.meta });
      } catch (e) {
        if (!(e && e.code === "aborted")) console.warn(e);
      }
    }
    if (!st.destroyed && my === redrawGen) st.redraws++;
  }

  // ---------- the cards of a section: made for its present page and type, the old ones dropped ----------
  function makeCard(sec, card) {
    const ui = createCardElement({ label: `region of genus ${statedOf(card).genus}`, text: card.text || null });
    ui.el.dataset.group = sec.def.id;
    ui.el.dataset.kind = card.kind;
    if (card.kind === "token") ui.setHref(cardHref(card, st.tokens[card.label]));
    else if (card.kind === "witness" || card.kind === "natural") ui.setHref(cardHref(card));
    const c = { index: 0, group: sec.def.id, card, ui, state: "wait", gen: 0, near: false, queued: false, drawn: null, facts: null, caption: "", reason: null, tStart: null, tDone: null, colour: null };
    ui.el.__galCard = c;
    return c;
  }

  function fillSection(sec) {
    for (const c of sec.cards) {
      c.gen++;
      c.state = "gone";
      if (c.abort) c.abort.abort();
      if (c.redrawAbort) c.redrawAbort.abort();
      if (observer) observer.unobserve(c.ui.el);
    }
    sec.cards = sectionCards(sec.def, st.gallery, { page: sec.page, colour: sec.colour }).map((card) => makeCard(sec, card));
    const kids = sec.cards.map((c) => c.ui.el);
    while (kids.length < sec.slots) kids.push(createSlot());
    sec.grid.replaceChildren(...kids);
    if (sec.pager) sec.pager.set(sec.page);
    if (sec.switch) sec.switch.set(sec.colour);
    st.cards = st.sections.flatMap((s) => s.cards);
    st.cards.forEach((c, k) => {
      c.index = k;
    });
    st.queue = st.queue.filter((c) => c.state === "wait");
    if (st.ready) startKnown(sec.cards);
    if (observer) for (const c of sec.cards) observer.observe(c.ui.el);
  }

  // the pages and types of the sections, kept in the store for the visit
  function remember() {
    if (!ctx.store) return;
    const g = {};
    for (const s of st.sections) g[s.def.id] = { page: s.page, colour: s.colour };
    ctx.store.set({ gallery: g });
  }

  function setPage(id, k) {
    const sec = st.sections.find((s) => s.def.id === id);
    if (!sec || !sec.pager || k === sec.page || clampPage(k, sec.pages.length) !== k) return;
    sec.page = k;
    remember();
    fillSection(sec);
  }

  function setColour(id, colour) {
    const sec = st.sections.find((s) => s.def.id === id);
    if (!sec || !sec.switch || colour === sec.colour || !sec.def.colours.includes(colour)) return;
    sec.colour = colour;
    remember();
    fillSection(sec);
  }

  // ---------- the page ----------
  // jumpTo(sec): scrolls smoothly to the section (at once when the visitor prefers reduced motion) and moves the focus
  // to its heading
  function jumpTo(sec) {
    const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    sec.head.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    sec.head.focus({ preventScroll: true });
  }

  // the title row is pinned below the site's header: its height goes to --gal-top-h (the headings' scroll margin, with
  // the header's --header-h). No button is marked while the page scrolls.
  let pinObserver = null;
  function pinRow(page, top) {
    const setHeight = () => page.style.setProperty("--gal-top-h", `${Math.ceil(top.getBoundingClientRect().height)}px`);
    setHeight();
    if (typeof ResizeObserver === "function") {
      pinObserver = new ResizeObserver(setHeight);
      pinObserver.observe(top);
    }
  }

  function buildPage() {
    const page = h("div", { class: "gal-page" });
    const jumps = h("nav", { class: "gal-jumps", "aria-label": "Sections" });
    const top = h("div", { class: "gal-top" }, h("h1", { class: "page-title" }, "Gallery"), jumps);
    page.append(top);
    const saved = (ctx.store && ctx.store.get().gallery) || {};
    for (const def of SECTIONS) {
      const keep = saved[def.id] || {};
      const pages = sectionPages(def);
      const colours = def.colours || [];
      const sec = {
        def, pages, slots: sectionSlots(def, st.gallery), cards: [], pager: null, switch: null, head: null, jump: null,
        page: clampPage(keep.page, Math.max(1, pages.length)),
        colour: colours.includes(keep.colour) ? keep.colour : colours.length ? colours[0] : null,
      };
      // a title may hold a $...$ formula (the name of a family of shapes), typeset. The heading takes the focus of the
      // section's button of the title row.
      sec.head = h("h2", { class: "gal-h", tabindex: "-1" }, mathText(h("span"), def.title));
      sec.jump = h("button", { type: "button", class: "gal-jump", dataset: { group: def.id }, onclick: () => jumpTo(sec) }, mathText(h("span"), def.title));
      jumps.append(sec.jump);
      if (colours.length > 1) {
        sec.switch = typeSwitch({ colours, current: sec.colour, onSelect: (c) => setColour(def.id, c) });
        sec.head.append(sec.switch.el);
      }
      const parts = [sec.head];
      if (pages.length > 1) {
        sec.pager = createPager({ names: pages.map((p) => pageName(def, p)), current: sec.page, label: "Pages of this section", onSelect: (k) => setPage(def.id, k) });
        sec.pager.el.classList.add("gal-pages");
        parts.push(sec.pager.el);
      }
      sec.grid = h("div", { class: "gal-grid" });
      parts.push(sec.grid);
      page.append(h("section", { class: "gal-group", dataset: { group: def.id } }, ...parts));
      st.sections.push(sec);
    }
    for (const sec of st.sections) fillSection(sec);
    return { page, top };
  }

  Promise.all([
    useStyles(url("../../../styles/gallery.css")),
    loadJson(url("../../../data/gallery.json")),
    loadJson(url("../../../data/tokens.json")),
    loadJson(url(`../../../${FAMILY_TOKENS_FILE}`)),
  ]).then(([, gallery, tokens, familyTokens]) => {
    if (st.destroyed) return;
    st.tokens = tokens;
    st.familyTokens = familyTokens;
    st.gallery = gallery;
    const built = buildPage();
    root.replaceChildren(built.page);
    pinRow(built.page, built.top);
    st.ready = true;
    startKnown(st.cards);
    requestAnimationFrame(() => {
      if (!st.destroyed) st.firstHeight = document.documentElement.scrollHeight;
    });
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const c = e.target.__galCard;
        if (!c || c.state === "gone") continue;
        c.near = e.isIntersecting;
        if (c.near) enqueue(c);
      }
    }, { rootMargin: "200px 0px" });
    for (const c of st.cards) observer.observe(c.ui.el);
    stopTheme = watchTheme(redrawAll);
  }).catch((e) => {
    if (st.destroyed) return;
    st.error = String((e && e.message) || e);
    console.error(e);
    root.replaceChildren(h("p", { class: "page-error" }, "The gallery could not be loaded."));
  });

  current = {
    handles: () => ({
      ready: st.ready,
      error: st.error,
      total: st.cards.length,
      done: st.cards.filter((c) => c.state === "ok" || c.state === "fail").length,
      failed: st.cards.filter((c) => c.state === "fail").length,
      tMount,
      tLast: st.tLast,
      firstHeight: st.firstHeight,
      redraws: st.redraws,
      sections: st.sections.map((s) => ({
        id: s.def.id, kind: s.def.kind, title: s.def.title, page: s.page, pages: s.pages.map((p) => [p.from, p.to]),
        colour: s.colour, colours: s.def.colours, slots: s.slots, cards: s.cards.map((c) => c.index),
      })),
      setPage,
      setColour,
      builds: st.builds.slice(),
      cards: st.cards.map((c) => ({
        index: c.index, group: c.group, kind: c.card.kind, genus: statedOf(c.card).genus, member: c.card.kind === "family" ? c.card.member : null,
        state: c.state, caption: c.caption, reason: c.reason,
        href: c.ui.link.getAttribute("href"),
        colour: c.colour, cropped: c.drawn ? c.drawn.fit.cropped : null, tStart: c.tStart, tDone: c.tDone,
        from: c.from || null, known: !!c.known, pictureKept: c.drawn ? c.drawn.kept : null,
      })),
      card: (k) => st.cards[k],
      worker: worker.stats(),
      construct: builder.stats(),
      memory: memoryStats(),
    }),
  };

  return () => {
    st.destroyed = true;
    if (observer) observer.disconnect();
    if (pinObserver) pinObserver.disconnect();
    if (stopTheme) stopTheme();
    for (const c of st.cards) {
      if (c.abort) c.abort.abort();
      if (c.redrawAbort) c.redrawAbort.abort();
    }
    worker.terminate();
    builder.terminate();
    current = null;
    root.replaceChildren();
  };
}
