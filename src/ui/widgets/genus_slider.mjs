// The genus slider of the Proof page: the shapes S_g^{+-1} (regions of type +1 or -1, green or red) and S_g^{0}
// (regions of type 0, blue) for a chosen g, with their area, their genus and the residue test that shows them
// admissible (for S_g^{0} the test is on its neighbour set). The code calls the two families kind "S" and "Z". Also exports hexFigure, the fixed-window hex canvas that every figure of the Proof page
// uses (drawn with renderWindow, so the mouse wheel keeps scrolling the article, redrawn on a theme change).
//
// shapeFacts(kind, g) is the pure function behind every number the slider prints (tested in Node).

import { h } from "../dom.mjs";
import { renderWindow, staticSource, fittedWindow, makeTransform } from "../../render/hex_canvas.mjs";
import { region } from "../../render/overlays.mjs";
import { shapeS, shapeZ } from "../../core/shapes.mjs";
import { genusOfCells, holeCount, isConnected } from "../../core/regions.mjs";
import { neighbourhood, cellKey } from "../../core/geometry.mjs";
import { residueTest } from "../../core/admissible.mjs";
import { renderMathIn } from "./math.mjs";

// The range of the slider.
export const G_MIN = 1;
export const G_MAX = 20;

// The value D of the shape Z_g: 3g for g even, 3g + 1 for g odd.
export function zHeight(g) {
  return g % 2 === 0 ? 3 * g : 3 * g + 1;
}

// shapeFacts(kind, g) for kind "S" or "Z" and an integer g >= 0 returns { kind, g, cells, neighbours, area,
// areaFormula (10g - 4 for S, 2D + g + 3 for Z, null at g = 0), D (Z only, else null), genus, chi, edges,
// triangles, holes (bounded components of the complement, a second count), connected, testedOn ("shape" for S,
// "neighbours" for Z), tested (number of cells tested), records (residueTest of the tested set), admissible }.
export function shapeFacts(kind, g) {
  if (kind !== "S" && kind !== "Z") throw new Error(`shapeFacts: kind must be "S" or "Z", got ${kind}`);
  const cells = kind === "S" ? shapeS(g) : shapeZ(g);
  const neighbours = neighbourhood(cells);
  const tested = kind === "S" ? cells : neighbours;
  const gen = genusOfCells(cells);
  const records = residueTest(tested);
  const D = kind === "Z" ? (g === 0 ? null : zHeight(g)) : null;
  let areaFormula = null;
  if (g >= 1) areaFormula = kind === "S" ? 10 * g - 4 : 2 * D + g + 3;
  return {
    kind, g, cells, neighbours, area: cells.length, areaFormula, D,
    genus: gen.genus, chi: gen.chi, edges: gen.edges, triangles: gen.triangles,
    holes: holeCount(cells), connected: isConnected(cells),
    testedOn: kind === "S" ? "shape" : "neighbours", tested: tested.length, records,
    admissible: records.every((r) => r.missed !== null),
  };
}

// The printed name (a formula) of the shape of shapeFacts(kind, g): S_g^{+-1} for kind "S", S_g^{0} for kind "Z".
const shapeName = (f) => (f.kind === "S" ? `S_{${f.g}}^{\\pm1}` : `S_{${f.g}}^{0}`);

// The text lines (with $...$ formulas) that the slider shows for shapeFacts(kind, g).
export function factsLines(f) {
  const name = shapeName(f);
  const lines = [];
  const formula = f.kind === "S" ? `10g-4=${f.areaFormula}` : `2D+g+3=${f.areaFormula}$ with $D=${f.D}`;
  lines.push(`$${name}$ has ${f.area} cells ($${formula}$) and is ${f.connected ? "connected" : "not connected"}.`);
  lines.push(`Genus $1-\\chi=${f.genus}$, with $\\chi=${f.area}-${f.edges}+${f.triangles}=${f.chi}$ (cells, adjacent pairs, adjacent triples). The complement has ${f.holes} bounded components.`);
  const what = f.kind === "S" ? `the ${f.tested} cells of $${name}$` : `the ${f.tested} cells of $N(${name})$`;
  const parts = f.records.map((r) => (r.missed ? `$p=${r.p}$ misses $(${r.missed[0]},${r.missed[1]})$` : `$p=${r.p}$ hits all ${r.p * r.p} classes`));
  lines.push(`Residue test on ${what}, for the primes with $p^{2}\\le${f.tested}$: ${parts.join(", ")}. ${f.admissible ? "Admissible." : "Not admissible."}`);
  return lines;
}

// The one caption line of the slider for shapeFacts(kind, g).
export function factsCaption(f) {
  const name = shapeName(f);
  const tested = f.kind === "S" ? "" : " (tested on its neighbours)";
  return `$${name}$ | ${f.area} cells | genus ${f.genus} | ${f.admissible ? "admissible" : "not admissible"}${tested}`;
}

// ---------- the caption of a figure: one live line with reserved height, the rest behind "details" ----------

// figureCaption(id) returns { box, set(caption, lines) }: box holds one caption line (id = id, its height reserved
// by the stylesheet so that a new value never moves the text below) and a closed "details" disclosure with the
// longer lines. Both are typeset with renderMathIn.
export function figureCaption(id) {
  const cap = h("p", { class: "proof-cap", "aria-live": "polite" });
  const more = h("div", { class: "proof-more" });
  const box = h("div", { class: "proof-info", id }, cap, h("details", { class: "proof-details" }, h("summary", null, "Details"), more));
  return {
    box,
    set(caption, lines = []) {
      cap.replaceChildren(caption);
      renderMathIn(cap);
      more.replaceChildren(...lines.map((t) => h("p", null, t)));
      renderMathIn(more);
    },
  };
}

// ---------- the fixed-window figure shared by the Proof page ----------

// hexFigure(container, { maxCell, maxHeight, pad, label }) adds a canvas to container and returns
// { canvas, draw(spec), cellAt(clientX, clientY), onClick(fn), meta(), destroy() }. draw({ source, bounds, overlays,
// soft, maxCell, maxHeight, pad }) renders the window fittedWindow(bounds, cell, pad) with renderWindow, the cell size
// chosen to fit the container width and maxHeight (at most maxCell, at least 4 pixels), and resolves with the
// window record of renderWindow. The last drawing is repeated on a theme or palette change and when the container
// width changes. onClick(fn) calls fn([i, j], event) with the cell under a click.
export function hexFigure(container, { maxCell = 30, maxHeight = 420, pad = 1, label = "figure" } = {}) {
  const canvas = h("canvas", { class: "hexwindow proof-canvas", role: "img", "aria-label": label });
  container.appendChild(canvas);
  // reserved height: a new drawing never moves the text below the figure
  container.style.minHeight = `${maxHeight}px`;
  let spec = null;
  let meta = null;
  let abort = null;
  let lastWidth = 0;
  let destroyed = false;
  const clicks = new Set();

  function cellSize(s) {
    const fw = fittedWindow(s.bounds, 10, s.pad);
    const avail = Math.max(120, container.clientWidth || 600);
    const c = Math.min(s.maxCell, (avail / fw.width) * 10, (s.maxHeight / fw.height) * 10);
    return Math.max(4, Math.floor(c * 4) / 4);
  }

  function draw(next) {
    if (destroyed) return Promise.resolve(null);
    if (next) spec = { overlays: [], soft: false, maxCell, maxHeight, pad, ...next };
    if (!spec) return Promise.resolve(null);
    if (abort) abort.abort();
    const ctl = new AbortController();
    abort = ctl;
    lastWidth = container.clientWidth;
    const s = spec;
    return renderWindow(canvas, { source: s.source, bounds: s.bounds, cell: cellSize(s), overlays: s.overlays, pad: s.pad, soft: s.soft, signal: ctl.signal })
      .then((m) => {
        if (abort === ctl) {
          meta = m;
          canvas.dataset.cell = String(m.cell);
        }
        return m;
      })
      .catch((e) => {
        if (e && e.code === "aborted") return null;
        throw e;
      });
  }

  function cellAt(clientX, clientY) {
    if (!meta) return null;
    const r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const X = ((clientX - r.left) * meta.width) / r.width;
    const Y = ((clientY - r.top) * meta.height) / r.height;
    return makeTransform({ originX: meta.originX, originY: meta.originY, cell: meta.cell }).cellAt(X, Y);
  }

  const onCanvasClick = (ev) => {
    const c = cellAt(ev.clientX, ev.clientY);
    if (!c) return;
    for (const fn of clicks) fn(c, ev);
  };
  canvas.addEventListener("click", onCanvasClick);

  const redraw = () => {
    if (spec) draw();
  };
  const mo = typeof MutationObserver === "function" ? new MutationObserver(redraw) : null;
  if (mo) mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-palette"] });
  const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  if (mq) mq.addEventListener("change", redraw);
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    if (Math.abs(container.clientWidth - lastWidth) > 8) redraw();
  }) : null;
  if (ro) ro.observe(container);

  return {
    canvas,
    draw,
    cellAt,
    onClick(fn) {
      clicks.add(fn);
      return () => clicks.delete(fn);
    },
    meta: () => meta,
    // The screen position (client pixels) of the centre of cell (i, j), for automated checks.
    clientPoint(i, j) {
      if (!meta) return null;
      const r = canvas.getBoundingClientRect();
      const [X, Y] = makeTransform({ originX: meta.originX, originY: meta.originY, cell: meta.cell }).toScreen(i, j);
      return [r.left + (X * r.width) / meta.width, r.top + (Y * r.height) / meta.height];
    },
    destroy() {
      destroyed = true;
      if (abort) abort.abort();
      canvas.removeEventListener("click", onCanvasClick);
      if (mo) mo.disconnect();
      if (mq) mq.removeEventListener("change", redraw);
      if (ro) ro.disconnect();
      clicks.clear();
      canvas.remove();
    },
  };
}

// ---------- the slider ----------

// mountGenusSlider(el, { kind, g }) shows the slider in el and returns { set(kind, g), state(), whenDrawn(),
// destroy() }. state() = { kind, g, facts } of what is shown.
export function mountGenusSlider(el, { kind = "S", g = 3 } = {}) {
  let cur = { kind, g };
  let facts = null;
  let drawn = Promise.resolve(null);
  const range = h("input", { type: "range", min: String(G_MIN), max: String(G_MAX), step: "1", value: String(g), class: "proof-range", "aria-label": "Genus g", id: "proof-genus-range" });
  const gOut = h("output", { class: "proof-gvalue", id: "proof-genus-value" }, String(g));
  const bS = h("button", { type: "button", "aria-pressed": "true", id: "proof-genus-s" }, "$S_{g}^{\\pm1}$, type +1 or -1");
  const bZ = h("button", { type: "button", "aria-pressed": "false", id: "proof-genus-z" }, "$S_{g}^{0}$, type 0");
  const caption = figureCaption("proof-genus-facts");
  const info = caption.box;
  const figBox = h("div", { class: "proof-figbox" });
  const controls = h("div", { class: "proof-controls" },
    h("span", { class: "proof-seg" }, bS, bZ),
    h("label", { class: "proof-label" }, "g ", gOut, range));
  el.append(controls, figBox, info);
  el.classList.add("proof-wide");
  renderMathIn(controls);
  const fig = hexFigure(figBox, { maxCell: 26, maxHeight: 460, pad: 1, label: "the shape and its neighbours" });

  function show() {
    facts = shapeFacts(cur.kind, cur.g);
    const inShape = new Set(facts.cells.map(([i, j]) => cellKey(i, j)));
    const inNb = new Set(facts.neighbours.map(([i, j]) => cellKey(i, j)));
    const shapeColour = cur.kind === "S" ? 1 : 0;
    const nbColour = cur.kind === "S" ? 0 : 1;
    const source = staticSource((i, j) => {
      const k = cellKey(i, j);
      if (inShape.has(k)) return shapeColour;
      if (inNb.has(k)) return nbColour;
      return null;
    });
    drawn = fig.draw({ source, bounds: facts.cells.concat(facts.neighbours), overlays: [region(facts.cells)], soft: true });
    gOut.textContent = String(cur.g);
    range.value = String(cur.g);
    bS.setAttribute("aria-pressed", String(cur.kind === "S"));
    bZ.setAttribute("aria-pressed", String(cur.kind === "Z"));
    caption.set(factsCaption(facts), factsLines(facts));
    info.dataset.kind = cur.kind;
    info.dataset.g = String(cur.g);
    info.dataset.genus = String(facts.genus);
    info.dataset.area = String(facts.area);
    info.dataset.admissible = String(facts.admissible);
  }

  const onRange = () => {
    cur = { ...cur, g: Number(range.value) };
    show();
  };
  range.addEventListener("input", onRange);
  bS.addEventListener("click", () => {
    cur = { ...cur, kind: "S" };
    show();
  });
  bZ.addEventListener("click", () => {
    cur = { ...cur, kind: "Z" };
    show();
  });
  show();

  return {
    set(kind2, g2) {
      cur = { kind: kind2 === "Z" ? "Z" : "S", g: Math.max(G_MIN, Math.min(G_MAX, Math.round(Number(g2)))) };
      show();
    },
    state: () => ({ kind: cur.kind, g: cur.g, facts }),
    whenDrawn: () => drawn,
    figure: fig,
    destroy() {
      range.removeEventListener("input", onRange);
      fig.destroy();
      el.replaceChildren();
    },
  };
}
