// The hexagonal canvas: colour sources, the interactive view, and the drawing of a fixed window.
//
// Geometry (pointy-top hexagons, y pointing down): the cell with offset (i, j) has its centre at
// ((i - j / 2) s, -j s sqrt(3) / 2) relative to the centre cell, s pixels between neighbouring centres, hexagon
// circumradius s / sqrt(3). Offsets are Numbers relative to a centre cell; the centre itself is a bigint and is never
// converted to a Number.
//
// A colour source is an object { kind, colour(i, j), work(rows, deadline) }:
//   kind "kronecker": colour(i, j) is the cached symbol or null while the cell is pending; work computes pending cells
//     of the given rows (in the given order) until the deadline and returns the number still pending.
//   kind "static": colour(i, j) is -1, 0, 1 or null (empty), work returns 0.
// Fills are opaque and outlines are drawn after the fills, so the pixel at a cell centre is the cell's fill.

// Soft look: with the option soft (createHexView, setSoft, renderWindow) every cell with a symbol is drawn in its soft
// colour, the fill mixed with the theme's --soft-to at the fraction --soft (light theme: white at 0.45, which gives
// #eaa09e, #9bb9e7, #95cda5 for the standard fills). Overlays then draw a region at full strength (region of
// overlays.mjs). Soft colours are opaque too.

import { rowReducer } from "../core/kronecker.mjs";
import { cellKey, SQ3_2 } from "../core/geometry.mjs";
import { parseBigIntStrict, CodedError } from "../core/bigint_utils.mjs";
import { softFillsOf } from "./overlays.mjs";

const SQ3 = Math.sqrt(3);

// Length of one computation slice of a lazy source, in milliseconds.
export const SLICE_MS = 40;
// The interactive view moves its centre cell when the view middle is more than this many cells away from it.
export const FOLD_LIMIT = 1048576; // 2^20
// A pointer that moves this many CSS pixels or more between press and release is a drag, not a click.
export const CLICK_SLOP = 5;
// Allowed pixels per cell in the interactive view.
export const CELL_MIN = 4;
export const CELL_MAX = 160;
// The factor of one zoom step (the keys + and -, the zoom buttons of the view controls, a double click).
export const ZOOM_STEP = 1.25;
// Default padding of fitted windows, in hexes (left and right) and rows (top and bottom).
export const DEFAULT_PAD = 3.5;
// Largest window drawn by renderWindow.
export const WINDOW_LIMITS = Object.freeze({ maxSide: 16000, maxPixels: 64000000 });

// The fills of the two palettes, by symbol.
export const PALETTES = Object.freeze({
  standard: Object.freeze({ "-1": "#d9534f", 0: "#4a7fd4", 1: "#3fa45b" }),
  colourblind: Object.freeze({ "-1": "#d55e00", 0: "#56b4e9", 1: "#009e73" }),
});

// The fixed light colours used for exported images (the fills are the light fills of the current palette).
export const EXPORT_THEME = Object.freeze({
  canvas: "#ffffff", outline: "#111111", pending: "#c9c9c2", empty: "#e6e6df", text: "#111111",
  softTo: "#ffffff", softFraction: 0.45,
});

// The theme values of styles/base.css, mirrored here for use outside a browser and for missing variables.
export const THEMES = Object.freeze({
  light: Object.freeze({ canvas: "#ffffff", outline: "#111111", pending: "#c9c9c2", empty: "#e6e6df", text: "#1d1d1b", softTo: "#ffffff", softFraction: 0.45 }),
  dark: Object.freeze({ canvas: "#14151a", outline: "#000000", pending: "#3a3b40", empty: "#26272b", text: "#e6e6e1", softTo: "#14151a", softFraction: 0.55 }),
});
// The standard fills of the dark theme (the colour-blind palette keeps its fills in both themes).
export const DARK_FILLS = Object.freeze({ "-1": "#e2605b", 0: "#5b8fe6", 1: "#4bb86b" });

const LIGHT_DEFAULTS = THEMES.light;

// resolveColours(el) reads the theme and palette variables of the page (--fill-red, --fill-blue, --fill-green,
// --canvas, --outline, --pending, --empty, --text, --soft-to, --soft) from el (default <html>). Returns
// { fills: { "-1", "0", "1" }, canvas, outline, pending, empty, text, softTo, softFraction (a number),
// softFills: { "-1", "0", "1" } (the fills mixed with softTo at softFraction) }, falling back to the standard light
// values for a missing variable (and outside a browser).
export function resolveColours(el) {
  let cs = null;
  try {
    if (typeof getComputedStyle === "function" && typeof document !== "undefined") cs = getComputedStyle(el || document.documentElement);
  } catch {
    cs = null;
  }
  const v = (name, fb) => {
    const s = cs ? cs.getPropertyValue(name).trim() : "";
    return s || fb;
  };
  const frac = Number(v("--soft", ""));
  const out = {
    fills: { "-1": v("--fill-red", PALETTES.standard["-1"]), 0: v("--fill-blue", PALETTES.standard[0]), 1: v("--fill-green", PALETTES.standard[1]) },
    canvas: v("--canvas", LIGHT_DEFAULTS.canvas),
    outline: v("--outline", LIGHT_DEFAULTS.outline),
    pending: v("--pending", LIGHT_DEFAULTS.pending),
    empty: v("--empty", LIGHT_DEFAULTS.empty),
    text: v("--text", LIGHT_DEFAULTS.text),
    softTo: v("--soft-to", LIGHT_DEFAULTS.softTo),
    softFraction: Number.isFinite(frac) && frac >= 0 && frac <= 1 && v("--soft", "") !== "" ? frac : LIGHT_DEFAULTS.softFraction,
  };
  out.softFills = softFillsOf(out);
  return out;
}

// currentPalette() is "colourblind" when <html> has data-palette="colourblind", else "standard".
function currentPalette() {
  try {
    if (typeof document !== "undefined" && document.documentElement.dataset.palette === "colourblind") return "colourblind";
  } catch {
    // no document
  }
  return "standard";
}

// exportColours() is the fixed light theme of EXPORT_THEME (white background and lines, outline #111111, soft cells
// mixed with white at 0.45) with the light fills of the current palette (PALETTES), whatever the page's theme.
export function exportColours() {
  const c = resolveColours();
  const out = { ...c, ...EXPORT_THEME, fills: { ...PALETTES[currentPalette()] } };
  delete out.softFills;
  out.softFills = softFillsOf(out);
  return out;
}

function toBig(v, name) {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isSafeInteger(v)) return BigInt(v);
  const b = parseBigIntStrict(typeof v === "string" ? v : "");
  if (b === null) throw new CodedError("bad_integer", `${name} must be a bigint, a safe integer or a decimal string`);
  return b;
}

const OFFSET_LIMIT = 16777216; // 2^24, the range of cellKey and of rowReducer offsets
const CACHE_CAP = 1000000;
const ROW_CAP = 20000;

// kroneckerSource(x, d) is the colour source of the symbol (x + i | d + j) around the centre cell (x, d) (bigints,
// safe integers or decimal strings). One rowReducer per row, a cache of computed cells, null while a cell is
// pending, computed in slices of SLICE_MS by work(rows, deadline). Extra members: x, d (getters), compute(i, j),
// ready(i, j), setCentre(x, d) (clears the cache when the centre moves), stats().
export function kroneckerSource(x, d) {
  let X = toBig(x, "x");
  let D = toBig(d, "d");
  let cells = new Map();
  let rows = new Map();
  let computed = 0;
  const check = (i, j) => {
    if (!(Math.abs(i) < OFFSET_LIMIT && Math.abs(j) < OFFSET_LIMIT)) throw new CodedError("offset_too_large", `offset (${i}, ${j}) is outside |i|, |j| < 2^24`);
  };
  const src = {
    kind: "kronecker",
    sliceMs: SLICE_MS,
    get x() {
      return X;
    },
    get d() {
      return D;
    },
    // The cached symbol of (i, j), or null while it is pending.
    colour(i, j) {
      const v = cells.get(cellKey(i, j));
      return v === undefined ? null : v;
    },
    // True when (i, j) is computed.
    ready(i, j) {
      return cells.has(cellKey(i, j));
    },
    // Computes (i, j) now (synchronously), caches and returns it.
    compute(i, j) {
      check(i, j);
      const k = cellKey(i, j);
      const c = cells.get(k);
      if (c !== undefined) return c;
      let r = rows.get(j);
      if (r === undefined) {
        if (rows.size >= ROW_CAP) rows = new Map();
        r = rowReducer(X, D + BigInt(j));
        rows.set(j, r);
      }
      const v = r.symbol(i);
      if (cells.size >= CACHE_CAP) cells = new Map();
      cells.set(k, v);
      computed++;
      return v;
    },
    // Computes pending cells of rows = [[j, ilo, ihi], ...] in that order until performance.now() >= deadline.
    // Returns the number of cells of these rows still pending.
    work(rowList, deadline) {
      let pending = 0;
      let open = true;
      for (const [j, ilo, ihi] of rowList) {
        for (let i = ilo; i <= ihi; i++) {
          if (cells.has(cellKey(i, j))) continue;
          if (open && performance.now() < deadline) {
            src.compute(i, j);
          } else {
            open = false;
            pending++;
          }
        }
      }
      return pending;
    },
    // Moves the centre to (x, d) and clears the cache (kept when the centre does not change).
    setCentre(nx, nd) {
      const bx = toBig(nx, "x");
      const bd = toBig(nd, "d");
      if (bx === X && bd === D) return;
      X = bx;
      D = bd;
      cells = new Map();
      rows = new Map();
    },
    // { cells (cached), rows, computed (since creation) }
    stats() {
      return { cells: cells.size, rows: rows.size, computed };
    },
  };
  return src;
}

// staticSource(colourOf) is the colour source of a function colourOf(i, j) returning -1, 0, 1 or null (drawn in the
// empty colour). Any other return value is drawn as empty too.
export function staticSource(colourOf) {
  if (typeof colourOf !== "function") throw new CodedError("bad_source", "staticSource takes a function (i, j) => -1 | 0 | 1 | null");
  return {
    kind: "static",
    colour(i, j) {
      const v = colourOf(i, j);
      return v === 1 || v === -1 || v === 0 ? v || 0 : null;
    },
    ready() {
      return true;
    },
    work() {
      return 0;
    },
  };
}

// ---------- pure geometry (also used by the tests) ----------

// planeOf(i, j) is the centre of cell (i, j) for unit spacing, y pointing down: [i - j / 2, -j sqrt(3) / 2].
export function planeOf(i, j) {
  return [i - j / 2, -j * SQ3_2];
}

// nearestCell(px, py) is the cell [i, j] whose unit-spacing centre (planeOf) is nearest to the point (px, py).
export function nearestCell(px, py) {
  const jf = -py / SQ3_2;
  const ifl = px + jf / 2;
  let best = null;
  let bd = Infinity;
  const j0 = Math.floor(jf);
  const i0 = Math.floor(ifl);
  for (let j = j0 - 1; j <= j0 + 2; j++) {
    for (let i = i0 - 1; i <= i0 + 2; i++) {
      const dx = i - j / 2 - px;
      const dy = -j * SQ3_2 - py;
      const dd = dx * dx + dy * dy;
      if (dd < bd) {
        bd = dd;
        best = [i, j];
      }
    }
  }
  return best;
}

// makeTransform({ originX, originY, cell }) returns { toScreen(i, j), cellAt(X, Y) } for the screen position
// (originX, originY) of the centre of cell (0, 0) and cell pixels per cell. cellAt(toScreen(i, j)) = [i, j].
export function makeTransform({ originX, originY, cell }) {
  return {
    toScreen(i, j) {
      return [originX + (i - j / 2) * cell, originY - j * SQ3_2 * cell];
    },
    cellAt(X, Y) {
      return nearestCell((X - originX) / cell, (Y - originY) / cell);
    },
  };
}

// boxTest({ cell, halfWidth, halfHeight, cx, cy }) is the test (i, j) => boolean of a screen rectangle whose centre
// lies cx pixels right of and cy pixels below the centre of the cell (0, 0) (both 0 when absent: the rectangle is
// centred on that cell): true when the centre of the cell (i, j), placed by makeTransform at cell pixels per cell,
// lies at most halfWidth pixels left or right and at most halfHeight pixels above or below the rectangle's centre.
// Throws "bad_box" unless cell, halfWidth and halfHeight are finite and positive and cx, cy finite.
export function boxTest({ cell, halfWidth, halfHeight, cx = 0, cy = 0 } = {}) {
  if (![cell, halfWidth, halfHeight].every((v) => Number.isFinite(v) && v > 0) || !Number.isFinite(cx) || !Number.isFinite(cy)) {
    throw new CodedError("bad_box", "a box is { cell, halfWidth, halfHeight, cx, cy }: three positive numbers of pixels and an offset");
  }
  const t = makeTransform({ originX: 0, originY: 0, cell });
  return (i, j) => {
    const [X, Y] = t.toScreen(i, j);
    return Math.abs(X - cx) <= halfWidth && Math.abs(Y - cy) <= halfHeight;
  };
}

// boxRows(box) lists the rows [j, ilo, ihi] (ascending j) of the cells whose centre lies in the box of boxTest (the same
// box object), with a margin of rounding: every cell boxTest accepts is in a row's range, a cell of the range may lie
// just outside the box (boxTest decides).
export function boxRows({ cell, halfWidth, halfHeight, cx = 0, cy = 0 } = {}) {
  boxTest({ cell, halfWidth, halfHeight, cx, cy });
  const hRow = SQ3_2 * cell;
  const eps = 1e-9;
  const jlo = Math.ceil((-cy - halfHeight) / hRow - eps);
  const jhi = Math.floor((halfHeight - cy) / hRow + eps);
  const out = [];
  for (let j = jlo; j <= jhi; j++) {
    const ilo = Math.ceil(j / 2 + (cx - halfWidth) / cell - eps);
    const ihi = Math.floor(j / 2 + (cx + halfWidth) / cell + eps);
    if (ihi >= ilo) out.push([j, ilo, ihi]);
  }
  return out;
}

// visibleRows(width, height, originX, originY, cell) lists the rows [j, ilo, ihi] (ascending j) of the cells whose
// hexagon can meet the rectangle [0, width] x [0, height].
export function visibleRows(width, height, originX, originY, cell) {
  const R = cell / SQ3;
  const hRow = SQ3_2 * cell;
  const jlo = Math.ceil((originY - height - R) / hRow);
  const jhi = Math.floor((originY + R) / hRow);
  const out = [];
  for (let j = jlo; j <= jhi; j++) {
    const ilo = Math.ceil((-cell / 2 - originX) / cell + j / 2);
    const ihi = Math.floor((width + cell / 2 - originX) / cell + j / 2);
    if (ihi >= ilo) out.push([j, ilo, ihi]);
  }
  return out;
}

// boundsExtents(bounds) is the extent of the cell centres of bounds ({ imin, imax, jmin, jmax } or a list of cells
// [i, j]) in the plane of planeOf (unit spacing, y down): { ax, bx, ay, by } (smallest and largest x and y). Throws
// "empty_shape" for an empty list and "bad_bounds" for anything else.
export function boundsExtents(bounds) {
  let pts;
  if (Array.isArray(bounds)) {
    if (bounds.length === 0) throw new CodedError("empty_shape", "bounds is an empty cell list");
    pts = bounds;
  } else if (bounds && typeof bounds === "object" && ["imin", "imax", "jmin", "jmax"].every((k) => Number.isFinite(bounds[k]))) {
    const { imin, imax, jmin, jmax } = bounds;
    if (imin > imax || jmin > jmax) throw new CodedError("bad_bounds", "bounds has imin > imax or jmin > jmax");
    pts = [[imin, jmin], [imax, jmin], [imin, jmax], [imax, jmax]];
  } else {
    throw new CodedError("bad_bounds", "bounds must be { imin, imax, jmin, jmax } or a list of cells [i, j]");
  }
  let ax = Infinity, bx = -Infinity, ay = Infinity, by = -Infinity;
  for (const [i, j] of pts) {
    const [px, py] = planeOf(i, j);
    if (px < ax) ax = px;
    if (px > bx) bx = px;
    if (py < ay) ay = py;
    if (py > by) by = py;
  }
  return { ax, bx, ay, by };
}

// fittedWindow(bounds, cell, pad) is the fixed window around bounds: a box { imin, imax, jmin, jmax } (its four
// corner cells count) or a list of cells [i, j]. The window is the screen rectangle around the outer edges of these
// hexagons (half width s / 2, half height R = s / sqrt(3)), widened by pad hexes left and right and pad rows top and
// bottom. Returns { width, height (integer pixels, ceil), originX, originY (pixel centre of cell (0, 0)), cell, pad,
// R, rows (visibleRows of the window), cells (number of cells drawn) }.
export function fittedWindow(bounds, cell = 12, pad = DEFAULT_PAD) {
  if (!(Number.isFinite(cell) && cell > 0)) throw new CodedError("bad_cell", "cell must be a positive number of pixels");
  if (!(Number.isFinite(pad) && pad >= 0)) throw new CodedError("bad_pad", "pad must be a nonnegative number");
  const { ax, bx, ay, by } = boundsExtents(bounds);
  const R = cell / SQ3;
  const minX = ax * cell - cell / 2 - pad * cell;
  const maxX = bx * cell + cell / 2 + pad * cell;
  const minY = ay * cell - R - pad * SQ3_2 * cell;
  const maxY = by * cell + R + pad * SQ3_2 * cell;
  const width = Math.ceil(maxX - minX - 1e-9);
  const height = Math.ceil(maxY - minY - 1e-9);
  const originX = -minX;
  const originY = -minY;
  const rows = visibleRows(width, height, originX, originY, cell);
  const cells = rows.reduce((a, [, lo, hi]) => a + hi - lo + 1, 0);
  return { width, height, originX, originY, cell, pad, R, rows, cells };
}

// ---------- drawing ----------

const HEX_C = [];
const HEX_S = [];
for (let k = 0; k < 6; k++) {
  const a = (Math.PI / 180) * (30 + 60 * k);
  HEX_C.push(Math.cos(a));
  HEX_S.push(Math.sin(a));
}

// hexPath(path, X, Y, r) adds a pointy-top hexagon of circumradius r centred at (X, Y) to a Path2D (or a context).
export function hexPath(path, X, Y, r) {
  path.moveTo(X + r * HEX_C[0], Y - r * HEX_S[0]);
  for (let k = 1; k < 6; k++) path.lineTo(X + r * HEX_C[k], Y - r * HEX_S[k]);
  path.closePath();
}

// fillRadius(cell) is the circumradius used for the cell fills: slightly smaller than the hexagon from 8 px on (a
// thin gap shows the canvas colour), slightly larger below 8 px (no gaps).
export function fillRadius(cell) {
  const R = cell / SQ3;
  return cell >= 8 ? R * 0.95 : R * 1.02;
}

// The view object handed to overlay draw functions. Offsets are shifted by (si, sj): overlay cell (i, j) is drawn at
// the base cell (i - si, j - sj).
function makeFrame({ width, height, originX, originY, cell, source, colours, rows, si = 0, sj = 0 }) {
  const t = makeTransform({ originX, originY, cell });
  return {
    width,
    height,
    cell,
    R: cell / SQ3,
    Rd: fillRadius(cell),
    colours,
    kind: source.kind,
    rows: si === 0 && sj === 0 ? rows : rows.map(([j, lo, hi]) => [j + sj, lo + si, hi + si]),
    toScreen: (i, j) => t.toScreen(i - si, j - sj),
    cellAt: (X, Y) => {
      const c = t.cellAt(X, Y);
      return [c[0] + si, c[1] + sj];
    },
    colourAt: (i, j) => source.colour(i - si, j - sj),
    hexPath,
  };
}

function layerOf(o) {
  return Number.isFinite(o.layer) ? o.layer : 50;
}

function paint(ctx, { width, height, originX, originY, cell, source, colours, rows, overlays, si = 0, sj = 0, soft = false }) {
  ctx.fillStyle = colours.canvas;
  ctx.fillRect(0, 0, width, height);
  const Rd = fillRadius(cell);
  const pendingKey = source.kind === "kronecker" ? "pending" : "empty";
  const keys = ["-1", "0", "1", "pending", "empty"];
  const base = soft ? softFillsOf(colours) : colours.fills;
  const fillOf = { "-1": base["-1"], 0: base[0], 1: base[1], pending: colours.pending, empty: colours.empty };
  let pending = 0;
  const hRow = SQ3_2 * cell;
  for (const [j, ilo, ihi] of rows) {
    const paths = {};
    for (const k of keys) paths[k] = null;
    const Y = originY - j * hRow;
    for (let i = ilo; i <= ihi; i++) {
      const X = originX + (i - j / 2) * cell;
      const c = source.colour(i, j);
      const k = c === null ? pendingKey : String(c);
      if (c === null && pendingKey === "pending") pending++;
      if (paths[k] === null) paths[k] = new Path2D();
      hexPath(paths[k], X, Y, Rd);
    }
    for (const k of keys) {
      if (paths[k] === null) continue;
      ctx.fillStyle = fillOf[k];
      ctx.fill(paths[k]);
    }
  }
  if (overlays && overlays.length) {
    const frame = makeFrame({ width, height, originX, originY, cell, source, colours, rows, si, sj });
    const sorted = overlays.map((o, k) => [o, k]).sort((a, b) => layerOf(a[0]) - layerOf(b[0]) || a[1] - b[1]);
    for (const [o] of sorted) {
      ctx.save();
      try {
        o.draw(ctx, frame);
      } finally {
        ctx.restore();
      }
    }
  }
  return pending;
}

function byDistance(rows, jMid) {
  return rows.slice().sort((a, b) => Math.abs(a[0] - jMid) - Math.abs(b[0] - jMid));
}

// centreFirst(rows, W, H, ox, oy, s, jMid) is the computation order of a view: first the cells of the central square
// of side min(W, H) (where a fitted window sits), then the rest, each part by rows nearest the middle row first.
// Returns row segments [j, ilo, ihi] covering every cell of rows exactly once.
export function centreFirst(rows, W, H, ox, oy, s, jMid) {
  const half = Math.min(W, H) / 2;
  const R = s / SQ3;
  const hRow = SQ3_2 * s;
  const inner = [];
  const outer = [];
  for (const [j, lo, hi] of rows) {
    const Y = oy - j * hRow;
    if (Math.abs(Y - H / 2) > half + R) {
      outer.push([j, lo, hi]);
      continue;
    }
    const a = Math.max(lo, Math.ceil((W / 2 - half - s / 2 - ox) / s + j / 2));
    const b = Math.min(hi, Math.floor((W / 2 + half + s / 2 - ox) / s + j / 2));
    if (a > b) {
      outer.push([j, lo, hi]);
      continue;
    }
    inner.push([j, a, b]);
    if (lo < a) outer.push([j, lo, a - 1]);
    if (b < hi) outer.push([j, b + 1, hi]);
  }
  return byDistance(inner, jMid).concat(byDistance(outer, jMid));
}

const nextTick = () => new Promise((r) => setTimeout(r, 0));

function checkOverlays(list) {
  if (!Array.isArray(list)) throw new CodedError("bad_overlays", "overlays must be a list");
  for (const o of list) if (!o || typeof o.draw !== "function") throw new CodedError("bad_overlays", "an overlay is { id, draw(ctx, view) }");
  return list.slice();
}

// renderWindow(canvas, { source, bounds, cell, overlays, pad }) draws the fixed window fittedWindow(bounds, cell, pad)
// into canvas (its pixel size is set to the window times the device pixel ratio, its style width to the window width
// in CSS pixels, so a max-width rule can still shrink it) and returns a promise resolved, when no
// cell is pending, with { width, height, originX, originY, cell, pad, dpr, cells, ms } (CSS pixels, centre of cell
// (0, 0) at (originX, originY)). Extra options: dpr (default devicePixelRatio), colours (default resolveColours()),
// signal (an AbortSignal: rejects with code "aborted"), onProgress({ done, total, ms }), soft (default false: every
// cell in its soft colour, a region overlay draws its cells at full strength).
export async function renderWindow(canvas, { source, bounds, cell = 12, overlays = [], pad = DEFAULT_PAD, dpr, colours, signal, onProgress, soft = false } = {}) {
  if (!source || typeof source.colour !== "function") throw new CodedError("bad_source", "renderWindow needs a colour source");
  const ovs = checkOverlays(overlays);
  const t0 = performance.now();
  const fw = fittedWindow(bounds, cell, pad);
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : (typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1);
  const pw = Math.round(fw.width * ratio);
  const ph = Math.round(fw.height * ratio);
  if (pw > WINDOW_LIMITS.maxSide || ph > WINDOW_LIMITS.maxSide || pw * ph > WINDOW_LIMITS.maxPixels) {
    throw new CodedError("too_large", `window of ${pw} x ${ph} pixels is over the limits (${WINDOW_LIMITS.maxSide} per side, ${WINDOW_LIMITS.maxPixels} in all)`);
  }
  canvas.width = pw;
  canvas.height = ph;
  if (canvas.style) canvas.style.width = `${fw.width}px`;
  const ctx = canvas.getContext("2d");
  const col = colours || resolveColours();
  const args = { width: fw.width, height: fw.height, originX: fw.originX, originY: fw.originY, cell, source, colours: col, rows: fw.rows, overlays: ovs, soft: soft === true };
  const draw = () => {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return paint(ctx, args);
  };
  const ordered = byDistance(fw.rows, Math.round((fw.rows[0][0] + fw.rows[fw.rows.length - 1][0]) / 2));
  let lastDraw = performance.now();
  for (;;) {
    if (signal && signal.aborted) throw new CodedError("aborted", "renderWindow was aborted");
    const pending = source.work(ordered, performance.now() + (source.sliceMs || SLICE_MS));
    if (pending === 0) break;
    if (onProgress) onProgress({ done: fw.cells - pending, total: fw.cells, ms: performance.now() - t0 });
    if (performance.now() - lastDraw > 250) {
      draw();
      lastDraw = performance.now();
    }
    await nextTick();
  }
  const left = draw();
  if (left !== 0) throw new CodedError("guard_failed", `renderWindow finished with ${left} pending cells`);
  if (onProgress) onProgress({ done: fw.cells, total: fw.cells, ms: performance.now() - t0 });
  return { width: fw.width, height: fw.height, originX: fw.originX, originY: fw.originY, cell, pad, dpr: ratio, cells: fw.cells, ms: performance.now() - t0 };
}

// ---------- the interactive view ----------

const LIVE = new Set();
let themeObserver = null;
const redrawAll = () => {
  for (const v of LIVE) v.requestDraw();
};
// the theme is the data-theme attribute of <html> (the system's colour scheme is not read), so the views redraw when
// an attribute of <html> changes
function watchTheme(on) {
  if (typeof document === "undefined") return;
  if (on && !themeObserver) {
    themeObserver = new MutationObserver(redrawAll);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-palette", "class", "style"] });
  } else if (!on && themeObserver) {
    themeObserver.disconnect();
    themeObserver = null;
  }
}

const clampCell = (s) => Math.max(CELL_MIN, Math.min(CELL_MAX, s));

// createHexView(canvas, { source, cell, soft }) makes canvas an interactive hex view (drag, wheel, touch drag and
// pinch, arrow keys and + / -), redrawn on demand, on resize and when the theme or palette changes. Offsets in every
// method and callback are relative to the centre cell. Returns
// { setSource(s), setCentre(x, d), setCell(px), zoomStep(n), panBy(dx, dy), fit(bounds, pad), toScreen(i, j), cellAt(X, Y),
//   setOverlays(list), requestDraw(), destroy(), onCellClick(fn), onCellHover(fn), onViewChange(fn) }
// plus the extras getView(), getPlace(), setPlace(place), whenComplete(), onFrame(fn), setSoft(on), isSoft(). Screen coordinates are CSS pixels
// from the canvas corner. soft (default false): every cell drawn in its soft colour (see renderWindow). A press and
// release that moved less than CLICK_SLOP pixels is a click. While a drag pans the view the canvas carries the
// attribute data-dragging="true" (for a grabbing cursor).
export function createHexView(canvas, { source, cell = 22, soft = false } = {}) {
  if (!source || typeof source.colour !== "function") throw new CodedError("bad_source", "createHexView needs a colour source");
  let src = source;
  let s = clampCell(Number(cell) || 22);
  let softOn = soft === true;
  let ux = 0; // plane position of the view middle relative to the centre cell, unit spacing, y pointing down
  let uy = 0;
  let overlays = [];
  let si = 0; // overlay offset shift accumulated by centre folds since setOverlays / setCentre
  let sj = 0;
  let raf = 0;
  let destroyed = false;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let pendingFit = null;
  let changed = false;
  let lastFolded = null;
  let lastFrame = null;
  let hoverCell = null;
  const subs = { click: new Set(), hover: new Set(), change: new Set(), frame: new Set() };
  const waiters = [];
  const ctx = canvas.getContext("2d");

  const originX = () => W / 2 - ux * s;
  const originY = () => H / 2 - uy * s;
  const toScreen = (i, j) => makeTransform({ originX: originX(), originY: originY(), cell: s }).toScreen(i, j);
  const cellAt = (X, Y) => makeTransform({ originX: originX(), originY: originY(), cell: s }).cellAt(X, Y);
  const middle = () => nearestCell(ux, uy);

  function measure() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    dpr = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
    const pw = Math.max(1, Math.round(W * dpr));
    const ph = Math.max(1, Math.round(H * dpr));
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
  }

  function getView() {
    const [mi, mj] = middle();
    const kr = src.kind === "kronecker";
    return {
      cell: s,
      middle: [mi, mj],
      x: kr ? (src.x + BigInt(mi)).toString() : null,
      d: kr ? (src.d + BigInt(mj)).toString() : null,
      centre: kr ? { x: src.x.toString(), d: src.d.toString() } : null,
      width: W,
      height: H,
      folded: lastFolded,
      soft: softOn,
    };
  }

  function fold() {
    if (src.kind !== "kronecker" || typeof src.setCentre !== "function") return;
    const [mi, mj] = middle();
    if (Math.abs(mi) <= FOLD_LIMIT && Math.abs(mj) <= FOLD_LIMIT) return;
    src.setCentre(src.x + BigInt(mi), src.d + BigInt(mj));
    const [px, py] = planeOf(mi, mj);
    ux -= px;
    uy -= py;
    si += mi;
    sj += mj;
    lastFolded = [mi, mj];
  }

  function markChanged() {
    fold();
    changed = true;
    requestDraw();
  }

  function frame() {
    raf = 0;
    if (destroyed) return;
    measure();
    if (W === 0 || H === 0) return;
    if (pendingFit) {
      const f = pendingFit;
      pendingFit = null;
      applyFit(f.bounds, f.pad);
    }
    const t0 = performance.now();
    const ox = originX();
    const oy = originY();
    const rows = visibleRows(W, H, ox, oy, s);
    let pendingAfterWork = 0;
    if (src.kind === "kronecker") {
      const [, mj] = middle();
      pendingAfterWork = src.work(centreFirst(rows, W, H, ox, oy, s, mj), t0 + (src.sliceMs || SLICE_MS));
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pending = paint(ctx, { width: W, height: H, originX: ox, originY: oy, cell: s, source: src, colours: resolveColours(canvas), rows, overlays, si, sj, soft: softOn });
    const cells = rows.reduce((a, [, lo, hi]) => a + hi - lo + 1, 0);
    lastFrame = { cells, pending, ms: performance.now() - t0, cell: s };
    for (const fn of [...subs.frame]) fn(lastFrame);
    if (changed) {
      changed = false;
      const v = getView();
      lastFolded = null;
      for (const fn of [...subs.change]) fn(v);
    }
    if (pending > 0 || pendingAfterWork > 0) requestDraw();
    else while (waiters.length) waiters.shift()(lastFrame);
  }

  function requestDraw() {
    if (destroyed || raf) return;
    raf = requestAnimationFrame(frame);
  }

  function zoomAt(f, X, Y) {
    const ns = clampCell(s * f);
    const px = ux + (X - W / 2) / s;
    const py = uy + (Y - H / 2) / s;
    s = ns;
    ux = px - (X - W / 2) / s;
    uy = py - (Y - H / 2) / s;
    markChanged();
  }
  // zoomStep(n): n zoom steps (n > 0 in, n < 0 out) about the view middle
  const zoomStep = (n) => zoomAt(Math.pow(ZOOM_STEP, n), W / 2, H / 2);

  function applyFit(bounds, pad) {
    // the extents of fittedWindow for unit spacing, without its rounding to whole pixels
    const { ax, bx, ay, by } = boundsExtents(bounds);
    const ww = bx - ax + 1 + 2 * pad;
    const hh = by - ay + 2 / SQ3 + 2 * pad * SQ3_2;
    s = clampCell(Math.min(W / ww, H / hh));
    ux = (ax + bx) / 2;
    uy = (ay + by) / 2;
  }

  // ---------- input ----------
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const setDragging = (on) => {
    if (on) canvas.setAttribute("data-dragging", "true");
    else canvas.removeAttribute("data-dragging");
  };
  const startDrag = (id, X, Y, moved) => {
    drag = { id, X, Y, ux, uy, moved };
    setDragging(moved);
  };
  const startPinch = () => {
    const [a, b] = [...pointers.values()];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s, px: ux + (mx - W / 2) / s, py: uy + (my - H / 2) / s };
    drag = null;
    setDragging(true);
  };
  const onDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const [X, Y] = local(e);
    pointers.set(e.pointerId, [X, Y]);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // capture is optional
    }
    if (pointers.size === 1) startDrag(e.pointerId, X, Y, false);
    else if (pointers.size === 2) startPinch();
  };
  const onMove = (e) => {
    const [X, Y] = local(e);
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, [X, Y]);
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
        s = clampCell((pinch.s * dist) / pinch.dist);
        ux = pinch.px - (mx - W / 2) / s;
        uy = pinch.py - (my - H / 2) / s;
        markChanged();
        return;
      }
      if (drag && drag.id === e.pointerId) {
        const dx = X - drag.X;
        const dy = Y - drag.Y;
        if (!drag.moved && Math.hypot(dx, dy) >= CLICK_SLOP) {
          drag.moved = true;
          setDragging(true);
        }
        if (drag.moved) {
          ux = drag.ux - dx / s;
          uy = drag.uy - dy / s;
          markChanged();
        }
        return;
      }
    }
    if (e.pointerType === "mouse" && pointers.size === 0 && subs.hover.size) {
      const c = cellAt(X, Y);
      if (!hoverCell || hoverCell[0] !== c[0] || hoverCell[1] !== c[1]) {
        hoverCell = c;
        for (const fn of [...subs.hover]) fn(c, e);
      }
    }
  };
  const onUp = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const [X, Y] = local(e);
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size === 1) {
        const [[id, p]] = [...pointers.entries()];
        pinch = null;
        startDrag(id, p[0], p[1], true);
      } else if (pointers.size === 0) {
        pinch = null;
        setDragging(false);
      }
      return;
    }
    if (drag && drag.id === e.pointerId) {
      const wasClick = !drag.moved && e.type === "pointerup" && Math.hypot(X - drag.X, Y - drag.Y) < CLICK_SLOP;
      drag = null;
      setDragging(false);
      if (wasClick && subs.click.size) {
        const c = cellAt(X, Y);
        for (const fn of [...subs.click]) fn(c, e);
      }
    }
  };
  const onLeave = (e) => {
    if (e.pointerType === "mouse" && hoverCell) {
      hoverCell = null;
      for (const fn of [...subs.hover]) fn(null, e);
    }
  };
  const onWheel = (e) => {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    const f = Math.max(0.5, Math.min(2, Math.pow(1.0015, -e.deltaY * k)));
    const [X, Y] = local(e);
    zoomAt(f, X, Y);
  };
  const onKey = (e) => {
    const step = (e.shiftKey ? 20 : 3) * s;
    let used = true;
    if (e.key === "ArrowLeft") ux -= step / s;
    else if (e.key === "ArrowRight") ux += step / s;
    else if (e.key === "ArrowUp") uy -= (step / s) * SQ3_2;
    else if (e.key === "ArrowDown") uy += (step / s) * SQ3_2;
    else if (e.key === "+" || e.key === "=") zoomStep(1);
    else if (e.key === "-" || e.key === "_") zoomStep(-1);
    else used = false;
    if (used) {
      e.preventDefault();
      markChanged();
    }
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("keydown", onKey);
  if (!canvas.hasAttribute("tabindex")) canvas.setAttribute("tabindex", "0");
  canvas.style.touchAction = "none";
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => requestDraw()) : null;
  if (ro) ro.observe(canvas);

  const api = {
    // Replaces the colour source (pan and zoom are kept).
    setSource(next) {
      if (!next || typeof next.colour !== "function") throw new CodedError("bad_source", "setSource needs a colour source");
      src = next;
      markChanged();
    },
    // Moves the centre to the cell (x, d) (bigints or decimal strings) and puts it in the view middle. Kronecker
    // source only (throws "not_kronecker").
    setCentre(x, d) {
      if (src.kind !== "kronecker" || typeof src.setCentre !== "function") throw new CodedError("not_kronecker", "setCentre needs a Kronecker source");
      src.setCentre(x, d);
      ux = 0;
      uy = 0;
      si = 0;
      sj = 0;
      markChanged();
    },
    // Sets the pixels per cell (clamped to [CELL_MIN, CELL_MAX]), keeping the view middle.
    setCell(px) {
      if (!Number.isFinite(px)) throw new CodedError("bad_cell", "setCell takes a number of pixels");
      s = clampCell(px);
      markChanged();
    },
    // Zooms by n steps of ZOOM_STEP about the view middle (n > 0 in, n < 0 out), as the keys + and - do.
    zoomStep,
    // Moves the picture by (dx, dy) screen pixels, as a drag by that amount.
    panBy(dx, dy) {
      ux -= dx / s;
      uy -= dy / s;
      markChanged();
    },
    // Zooms and pans so that fittedWindow(bounds, s, pad) fills the canvas (pad default DEFAULT_PAD).
    fit(bounds, pad = DEFAULT_PAD) {
      boundsExtents(bounds);
      measure();
      if (W === 0 || H === 0) pendingFit = { bounds, pad };
      else applyFit(bounds, pad);
      markChanged();
    },
    toScreen,
    cellAt,
    // Sets the overlays ({ id, draw(ctx, view) }), drawn in layer order after the fills. Their offsets are relative
    // to the centre at the time of this call (a later fold of the centre is applied to them).
    setOverlays(list) {
      overlays = checkOverlays(list || []);
      si = 0;
      sj = 0;
      requestDraw();
    },
    requestDraw,
    // Removes every listener and observer and stops drawing.
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKey);
      if (ro) ro.disconnect();
      for (const k of Object.keys(subs)) subs[k].clear();
      LIVE.delete(api);
      if (LIVE.size === 0) watchTheme(false);
    },
    // fn(cell [i, j], event) on a click or tap without movement. Returns a function that removes fn.
    onCellClick(fn) {
      subs.click.add(fn);
      return () => subs.click.delete(fn);
    },
    // fn(cell [i, j] or null when the mouse leaves, event) when the mouse moves to another cell.
    onCellHover(fn) {
      subs.hover.add(fn);
      return () => subs.hover.delete(fn);
    },
    // fn(getView()) once per drawn frame after a pan, zoom, fit, centre or source change.
    onViewChange(fn) {
      subs.change.add(fn);
      return () => subs.change.delete(fn);
    },
    // Extra: fn({ cells, pending, ms, cell }) after every drawn frame.
    onFrame(fn) {
      subs.frame.add(fn);
      return () => subs.frame.delete(fn);
    },
    // Extra: { cell, middle [i, j], x, d (strings of the middle cell, Kronecker source only), centre, width, height,
    // folded, soft }.
    getView,
    // Extra: draw every cell in its soft colour (true) or in its fill (false, the default).
    setSoft(on) {
      const next = on === true;
      if (next === softOn) return;
      softOn = next;
      requestDraw();
    },
    // Extra: true when the view draws soft cells.
    isSoft() {
      return softOn;
    },
    // Extra: the place of the view, { at: [u, v] (the plane position of the view middle relative to the centre cell,
    // unit spacing, y pointing down: planeOf of the middle cell when the view is centred on a cell), cell }.
    getPlace() {
      return { at: [ux, uy], cell: s };
    },
    // Extra: puts the view at a place of getPlace (the centre and the computed cells of the source stay).
    setPlace({ at, cell: px } = {}) {
      if (!Array.isArray(at) || !at.every(Number.isFinite) || !Number.isFinite(px)) throw new CodedError("bad_place", "a place is { at: [u, v], cell }, finite numbers");
      s = clampCell(px);
      ux = at[0];
      uy = at[1];
      markChanged();
    },
    // Extra: a promise of the next frame that has no pending cell (resolved with that frame's onFrame record).
    whenComplete() {
      return new Promise((resolve) => {
        waiters.push(resolve);
        requestDraw();
      });
    },
    get source() {
      return src;
    },
  };
  LIVE.add(api);
  watchTheme(true);
  markChanged();
  return api;
}
