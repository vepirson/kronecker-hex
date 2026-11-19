// The home page: one large live picture (the green region of genus 100, opened from its token and drawn in the
// browser: every cell soft, the region at full strength with its outline), one sentence stating the result, and the
// plain links to the other pages. The text and the links come from content/landing.json. The picture box has its
// final size before anything is drawn, so nothing moves while it fills.

import { h, useStyles, loadJson } from "../dom.mjs";
import { fittedWindow, kroneckerSource, renderWindow } from "../../render/hex_canvas.mjs";
import { region } from "../../render/overlays.mjs";
import { openToken } from "../../formats/token.mjs";
import { renderMathIn, KATEX_CSS } from "../widgets/math.mjs";
import { regionStyle, watchTheme } from "../gallery/cards.mjs";
import { explorerTokenHref } from "../actions.mjs";

const url = (p) => new URL(p, import.meta.url);
// Padding of the picture in hexes, largest cell size, largest width of the picture box.
export const LANDING_PAD = 1.5;
export const LANDING_MAX_CELL = 18;
export const LANDING_MAX_WIDTH = 640;

let current = null;

// testHandles() returns { ready, error, drawn, meta, formulas, cells, x0, d0, canvas } of the mounted page, or null.
export function testHandles() {
  return current ? current.handles() : null;
}

// mount(root, ctx) shows the home page in root and returns unmount().
export function mount(root) {
  const st = { destroyed: false, ready: false, error: null, drawn: false, meta: null, formulas: null, cells: null, x0: null, d0: null, canvas: null };
  let abort = null;
  let stopTheme = null;

  Promise.all([
    useStyles(url("../../../styles/gallery.css")),
    useStyles(KATEX_CSS),
    loadJson(url("../../../content/landing.json")),
    loadJson(url("../../../data/tokens.json")),
  ]).then(([, , content, tokens]) => {
    if (st.destroyed) return;
    const text = tokens[content.picture.token];
    const o = openToken(text);
    const cells = o.data.shape;
    const source = kroneckerSource(o.x0, o.d0);
    const ratio = fittedWindow(cells, 100, LANDING_PAD);
    const canvas = h("canvas", { class: "land-canvas", width: "0", height: "0", role: "img", "aria-label": content.picture.title });
    const pic = h("a", { class: "land-pic", href: explorerTokenHref(text), title: content.picture.title, style: { aspectRatio: `${ratio.width} / ${ratio.height}` } }, canvas);
    const lead = h("h1", { class: "land-lead" }, content.sentence);
    const links = h("nav", { class: "land-links", "aria-label": "Pages" }, ...content.links.map((l) => h("a", { href: l.href }, l.text)));
    root.replaceChildren(h("div", { class: "land-page" }, pic, lead, links));
    st.formulas = renderMathIn(lead);
    Object.assign(st, { cells, x0: o.x0, d0: o.d0, canvas, ready: true });

    const draw = () => {
      if (st.destroyed) return;
      if (abort) abort.abort();
      const ctl = new AbortController();
      abort = ctl;
      const avail = Math.min(LANDING_MAX_WIDTH, pic.clientWidth || LANDING_MAX_WIDTH) - 2;
      const cell = Math.max(2, Math.min(LANDING_MAX_CELL, Math.floor((avail / ratio.width) * 100 * 100) / 100));
      renderWindow(canvas, { source, bounds: cells, cell, pad: LANDING_PAD, soft: true, overlays: [region(cells, regionStyle(cell))], signal: ctl.signal })
        .then((m) => {
          if (abort === ctl) {
            st.meta = m;
            st.drawn = true;
          }
        })
        .catch((e) => {
          if (!(e && e.code === "aborted")) console.error(e);
        });
    };
    draw();
    stopTheme = watchTheme(draw);
  }).catch((e) => {
    if (st.destroyed) return;
    st.error = String((e && e.message) || e);
    console.error(e);
    root.replaceChildren(h("p", { class: "page-error" }, "This page could not be loaded."));
  });

  current = { handles: () => ({ ...st }) };

  return () => {
    st.destroyed = true;
    if (abort) abort.abort();
    if (stopTheme) stopTheme();
    current = null;
    root.replaceChildren();
  };
}
