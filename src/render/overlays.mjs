// Overlays of the hex canvas. An overlay is { id, draw(ctx, view) } with an optional numeric layer (default 50):
// the view draws its overlays after the fills, in ascending layer (then list) order. Provided layers: fadeOutside
// 10, region 15, highlight 20, modGrid 30, outline 40, hollowMarks 50, marker 55, labels 60. To rename one, spread it:
// { ...outline(cells), id }.
//
// The view object passed to draw: { width, height, cell, R, Rd, colours, kind, rows ([j, ilo, ihi] visible rows),
// toScreen(i, j), cellAt(X, Y), colourAt(i, j) (-1, 0, 1 or null), hexPath(path, X, Y, r) }. colours holds the
// theme (see resolveColours of hex_canvas.mjs), among them softTo, softFraction and softFills.

import { cellKey, keyToCell } from "../core/geometry.mjs";
import { CodedError } from "../core/bigint_utils.mjs";

// Default fraction mixed into the cells outside a shown region (the light theme's value of --soft).
export const DEFAULT_FADE = 0.45;
// Default colour the soft cells are mixed with (the light theme's value of --soft-to).
export const DEFAULT_SOFT_TO = "#ffffff";

// parseColour(c) returns [r, g, b] (0..255) of "#rgb", "#rrggbb" or "rgb(r, g, b)". Throws "bad_colour".
export function parseColour(c) {
  const s = String(c).trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [...m[1]].map((x) => parseInt(x + x, 16));
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16));
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(s);
  if (m) return [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)));
  throw new CodedError("bad_colour", `cannot read the colour ${JSON.stringify(c)}`);
}

// fadeHex(colour, f) mixes a colour with white: every channel c becomes round(c + (255 - c) f). Returns "#rrggbb".
export function fadeHex(colour, f) {
  if (!(f >= 0 && f <= 1)) throw new CodedError("bad_fade", "the fade fraction is in [0, 1]");
  return "#" + parseColour(colour).map((c) => Math.round(c + (255 - c) * f).toString(16).padStart(2, "0")).join("");
}

// mixHex(colour, target, f) mixes a colour with the colour target: every channel c becomes round(c + (t - c) f),
// t the channel of target. mixHex(c, "#ffffff", f) = fadeHex(c, f). Returns "#rrggbb".
export function mixHex(colour, target, f) {
  if (!(f >= 0 && f <= 1)) throw new CodedError("bad_fade", "the fade fraction is in [0, 1]");
  const t = parseColour(target);
  return "#" + parseColour(colour).map((c, k) => Math.round(c + (t[k] - c) * f).toString(16).padStart(2, "0")).join("");
}

// softFillsOf(colours) is the soft fill of each symbol, { "-1", "0", "1" }: colours.fills mixed with colours.softTo
// (default DEFAULT_SOFT_TO) at colours.softFraction (default DEFAULT_FADE). colours.softFills is used when present.
export function softFillsOf(colours) {
  if (colours.softFills) return colours.softFills;
  const to = colours.softTo || DEFAULT_SOFT_TO;
  const f = Number.isFinite(colours.softFraction) ? colours.softFraction : DEFAULT_FADE;
  return { "-1": mixHex(colours.fills["-1"], to, f), 0: mixHex(colours.fills[0], to, f), 1: mixHex(colours.fills[1], to, f) };
}

function keySet(cells) {
  if (!Array.isArray(cells)) throw new CodedError("bad_cells", "an overlay takes a list of cells [i, j]");
  const set = new Set();
  for (const c of cells) {
    if (!Array.isArray(c) || !Number.isInteger(c[0]) || !Number.isInteger(c[1])) throw new CodedError("bad_cells", "a cell is an integer pair [i, j]");
    set.add(cellKey(c[0], c[1]));
  }
  return set;
}

const onScreen = (view, X, Y, m) => X >= -m && X <= view.width + m && Y >= -m && Y <= view.height + m;

// Neighbour steps with the angle (degrees) of the direction to them on screen.
const DIRS = [[1, 0, 0], [1, 1, 60], [0, 1, 120], [-1, 0, 180], [-1, -1, 240], [0, -1, 300]];

// Strokes every hexagon edge between a cell of set (list = its cells) and a cell outside it.
function strokeOutline(ctx, view, set, list, style) {
  const R = view.R;
  const p = new Path2D();
  const m = 2 * view.cell;
  for (const [i, j] of list) {
    const [X, Y] = view.toScreen(i, j);
    if (!onScreen(view, X, Y, m)) continue;
    for (const [di, dj, ang] of DIRS) {
      if (set.has(cellKey(i + di, j + dj))) continue;
      const a1 = (Math.PI / 180) * (ang - 30);
      const a2 = (Math.PI / 180) * (ang + 30);
      p.moveTo(X + R * Math.cos(a1), Y - R * Math.sin(a1));
      p.lineTo(X + R * Math.cos(a2), Y - R * Math.sin(a2));
    }
  }
  const width = style.width || Math.max(1.5, view.cell * 0.14);
  ctx.lineCap = "round";
  if (style.halo === true || (style.halo === "auto" && haloNeeded(view.colours))) {
    ctx.strokeStyle = haloOf(view.colours);
    ctx.lineWidth = width + 2 * OUTLINE_HALO;
    ctx.stroke(p);
  }
  ctx.strokeStyle = style.colour || view.colours.outline;
  ctx.lineWidth = width;
  ctx.stroke(p);
}

// Width of the light halo on each side of an outline drawn with style.halo, in CSS pixels (see MARKER_EDGE).
export const OUTLINE_HALO = 2;

// relative luminance (WCAG 2) of a CSS colour
function luminance(c) {
  const lin = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = parseColour(c).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// lighterOf(a, b) is the lighter of two CSS colours (the canvas colour in the light theme, the text colour in the dark
// one: the colour of a halo around the dark outline)
export function lighterOf(a, b) {
  return luminance(a) >= luminance(b) ? a : b;
}
// haloOf({ canvas, text }) is the colour of the halo of an outline: the lighter of the theme's canvas and text colours,
// moved a fifth of the way to the other when it is the text colour (the dark theme), so that it never has the colour
// of the line of a cell mark (hollowMarks, marker)
export function haloOf({ canvas, text = canvas }) {
  const light = lighterOf(canvas, text);
  return light === canvas ? canvas : mixHex(text, canvas, 0.2);
}

// contrastOf(a, b) is the contrast ratio (WCAG 2) of two CSS colours, from 1 to 21.
export function contrastOf(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// haloNeeded({ outline, empty, canvas }) is the one rule of the "auto" halo of an outline: true when the theme's
// outline colour does not reach 3 to 1 against the theme's empty colour (the grid without a fill, canvas when empty is
// not given), so that a plain line would not show where the outline borders an empty cell (the dark theme), false
// when the plain line is enough (the light theme).
export function haloNeeded({ outline, empty, canvas }) {
  return contrastOf(outline, empty || canvas) < 3;
}

// outline(cells, style) strokes the boundary of a cell set: every hexagon edge between a cell of the set and a cell
// outside it. style: { colour (CSS colour, default the theme outline colour), width (pixels, default
// max(1.5, 0.14 cell)), halo (true: under the line a light halo of OUTLINE_HALO px on each side, haloOf the theme's
// colours, so that the line or its halo reaches 3 to 1 on every fill and on the empty grid of both themes; "auto":
// that halo only where haloNeeded of the theme's colours says the plain line does not show on the empty grid, decided
// at every draw, so a theme change redraws it by the same rule), id }.
export function outline(cells, style = {}) {
  const set = keySet(cells);
  const list = [...set].map(keyToCell);
  return {
    id: style.id || "outline",
    layer: 40,
    draw(ctx, view) {
      strokeOutline(ctx, view, set, list, style);
    },
  };
}

// The CSS variable of the accent colour (--select of styles/base.css: the timeline's progress, the step shown), the
// colour of accentOutline.
export const ACCENT_COLOUR_VAR = "--select";

// accentColour() is the present value of ACCENT_COLOUR_VAR on the page, "" without a page (read at every frame, so a
// theme change redraws the line in the new theme).
export function accentColour() {
  if (typeof getComputedStyle !== "function" || typeof document === "undefined" || !document.documentElement) return "";
  return getComputedStyle(document.documentElement).getPropertyValue(ACCENT_COLOUR_VAR).trim();
}

// accentOutline(cells, { id, layer }) strokes the boundary of a cell set as outline() strokes the boundary of a selected
// region (the same function and width, its default width in that frame), in the accent colour (accentColour, the
// theme's outline colour when the page has none), over a halo OUTLINE_HALO px wide on each side (the width of the halo
// of outline()) in the theme's outline colour. The accent alone does not reach 3 to 1 against every fill, and neither
// does the light halo of outline() (the dark full fills of the dark theme), the dark halo does wherever the accent
// does not: line or halo at 3 to 1 on every fill, full and soft. The default width is read from the frame itself:
// outline() of no cell sets the line width it uses and strokes nothing. Defaults: id "accent", layer 45 (above
// outline, below hollowMarks and marker). The Algorithm page outlines its checked rows with it, the Explorer and the
// Gallery a custom highlight.
export function accentOutline(cells, { id = "accent", layer = 45 } = {}) {
  const none = outline([]);
  const haloStyle = { colour: null, width: null };
  const halo = outline(cells, haloStyle);
  const lineStyle = { colour: null };
  const line = outline(cells, lineStyle);
  return {
    id,
    layer,
    draw(ctx, view) {
      none.draw(ctx, view);
      haloStyle.width = ctx.lineWidth + 2 * OUTLINE_HALO;
      haloStyle.colour = view.colours.outline;
      halo.draw(ctx, view);
      lineStyle.colour = accentColour() || view.colours.outline;
      line.draw(ctx, view);
    },
  };
}

// region(cells, style) draws the listed cells at full strength (the fill of their symbol, for a view drawn soft or
// faded around them) and then strokes their boundary as outline(cells, style) does. style: { colour, width (of the
// outline, defaults as outline), outline (false: fills only), id (default "region") }. Layer 15: above fadeOutside,
// below highlight, modGrid, outline, marker and labels. Cells without a colour yet (pending, empty) are left as drawn.
export function region(cells, style = {}) {
  const set = keySet(cells);
  const list = [...set].map(keyToCell);
  return {
    id: style.id || "region",
    layer: 15,
    draw(ctx, view) {
      const paths = { "-1": null, 0: null, 1: null };
      const m = view.cell;
      for (const [i, j] of list) {
        const [X, Y] = view.toScreen(i, j);
        if (!onScreen(view, X, Y, m)) continue;
        const c = view.colourAt(i, j);
        if (c === null) continue;
        if (paths[c] === null) paths[c] = new Path2D();
        view.hexPath(paths[c], X, Y, view.Rd);
      }
      for (const k of ["-1", "0", "1"]) {
        if (paths[k] === null) continue;
        ctx.fillStyle = view.colours.fills[k];
        ctx.fill(paths[k]);
      }
      if (style.outline !== false) strokeOutline(ctx, view, set, list, style);
    },
  };
}

// fadeOutside(cells, f) redraws every visible computed cell outside the set in its soft colour: its fill mixed with
// the theme's soft target (colours.softTo, white in the light theme, the canvas colour in the dark theme) at
// fraction f, by default the theme's fraction (colours.softFraction, 0.45 in the light theme). fadeOutside([]) makes
// every cell soft. Opaque colours, so a faded cell centre has the exact colour mixHex(fill, softTo, f). The member
// fraction is f, or null when the theme's fraction is used.
export function fadeOutside(cells, f) {
  const set = keySet(cells);
  if (f !== undefined && !(f >= 0 && f <= 1)) throw new CodedError("bad_fade", "the fade fraction is in [0, 1]");
  return {
    id: "fade",
    layer: 10,
    fraction: f === undefined ? null : f,
    draw(ctx, view) {
      if (f === 0) return;
      const faded = f === undefined ? softFillsOf(view.colours) : softFillsOf({ fills: view.colours.fills, softTo: view.colours.softTo, softFraction: f });
      for (const [j, ilo, ihi] of view.rows) {
        const paths = { "-1": null, 0: null, 1: null };
        for (let i = ilo; i <= ihi; i++) {
          if (set.has(cellKey(i, j))) continue;
          const c = view.colourAt(i, j);
          if (c === null) continue;
          const [X, Y] = view.toScreen(i, j);
          if (paths[c] === null) paths[c] = new Path2D();
          view.hexPath(paths[c], X, Y, view.Rd);
        }
        for (const k of ["-1", "0", "1"]) {
          if (paths[k] === null) continue;
          ctx.fillStyle = faded[k];
          ctx.fill(paths[k]);
        }
      }
    },
  };
}

// highlight(cells, cssColour) fills a smaller hexagon (half the size) inside each listed cell in the given colour
// (default the theme's text colour, the colour of the cell marker), so the cell's own fill stays visible around it.
export function highlight(cells, cssColour) {
  const set = keySet(cells);
  const list = [...set].map(keyToCell);
  return {
    id: "highlight",
    layer: 20,
    draw(ctx, view) {
      const p = new Path2D();
      const m = view.cell;
      for (const [i, j] of list) {
        const [X, Y] = view.toScreen(i, j);
        if (onScreen(view, X, Y, m)) view.hexPath(p, X, Y, view.Rd * 0.5);
      }
      ctx.fillStyle = cssColour || view.colours.text || view.colours.outline;
      ctx.fill(p);
    },
  };
}

// labels(list) writes text at cell centres: list of [i, j, text]. Skipped below 9 pixels per cell.
export function labels(list) {
  if (!Array.isArray(list)) throw new CodedError("bad_cells", "labels takes a list of [i, j, text]");
  const items = list.map(([i, j, t]) => [i, j, String(t)]);
  return {
    id: "labels",
    layer: 60,
    draw(ctx, view) {
      if (view.cell < 9) return;
      const size = Math.max(8, Math.round(view.cell * 0.38));
      ctx.font = `${size}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, size * 0.25);
      ctx.strokeStyle = view.colours.canvas;
      ctx.fillStyle = view.colours.text || view.colours.outline;
      for (const [i, j, t] of items) {
        const [X, Y] = view.toScreen(i, j);
        if (!onScreen(view, X, Y, view.cell)) continue;
        ctx.strokeText(t, X, Y);
        ctx.fillText(t, X, Y);
      }
    },
  };
}

const mod = (a, p) => ((a % p) + p) % p;

// modGrid(p, a, b) marks with a dot every visible cell (i, j) with i = a and j = b modulo p (the class (a, b) of
// (Z/p)^2 on offsets).
export function modGrid(p, a, b) {
  if (!Number.isInteger(p) || p < 1) throw new CodedError("bad_modulus", "modGrid takes an integer p >= 1");
  const ra = mod(a, p);
  const rb = mod(b, p);
  return {
    id: "modgrid",
    layer: 30,
    draw(ctx, view) {
      const r = Math.max(1.5, view.cell * 0.16);
      const path = new Path2D();
      for (const [j, ilo, ihi] of view.rows) {
        if (mod(j, p) !== rb) continue;
        let i = ilo + mod(ra - ilo, p);
        for (; i <= ihi; i += p) {
          const [X, Y] = view.toScreen(i, j);
          path.moveTo(X + r, Y);
          path.arc(X, Y, r, 0, 2 * Math.PI);
        }
      }
      ctx.fillStyle = view.colours.outline;
      ctx.fill(path);
    },
  };
}

// Size of the cell marker: its circumradius as a fraction of the circumradius of the cell's hexagon.
export const MARKER_SIZE = 0.4;
// Width of the marker's edge in CSS pixels. A line is centred on the hexagon's sides, so a 1 px line is spread over
// two half-covered device pixels at device pixel ratio 1 and never shows its own colour. At 2 px at least one whole
// device pixel of the edge is drawn in the canvas colour.
export const MARKER_EDGE = 2;

// marker(cell) marks one cell [i, j] with a small filled hexagon at its centre, MARKER_SIZE times the size of the
// cell, in the theme's text colour with an edge of MARKER_EDGE px in the canvas colour. The rule it is built for: on
// every fill (full and soft, both themes, both palettes) the body or the edge reaches a contrast of 3 to 1 as drawn
// (the light body on the soft fills of the dark theme, the dark edge on its full fills). Nothing when cell is null.
export function marker(cell) {
  return {
    id: "marker",
    layer: 55,
    draw(ctx, view) {
      if (!cell) return;
      const [X, Y] = view.toScreen(cell[0], cell[1]);
      const p = new Path2D();
      view.hexPath(p, X, Y, view.R * MARKER_SIZE);
      ctx.fillStyle = view.colours.text || view.colours.outline;
      ctx.fill(p);
      ctx.strokeStyle = view.colours.canvas;
      ctx.lineWidth = MARKER_EDGE;
      ctx.stroke(p);
    },
  };
}

// Width of the line of a hollow mark and of the halo around it, in CSS pixels across the line. At 2 px each shows its
// own colour on at least one whole device pixel (see MARKER_EDGE).
export const HOLLOW_LINE = 2;
export const HOLLOW_HALO = 2;

// The circumradius step of a pointy-top hexagon whose sides move by w pixels.
const sideStep = (w) => (2 * w) / Math.sqrt(3);

// hollowMarks(cells) marks each listed cell with the outline of a small hexagon at its centre: a line of HOLLOW_LINE px
// in the theme's text colour whose outer edge has the size of the cell marker (MARKER_SIZE), and outside it a halo of
// HOLLOW_HALO px in the canvas colour. The middle stays open, so the cell's own fill (or the empty colour) shows
// there. Line and halo are the two colours of the marker, so the same rule holds on every fill: one of them reaches 3
// to 1. The open middle keeps at least 0.45 of the mark's size at small zoom. Layer 50: above the outline, below the
// cell marker.
export function hollowMarks(cells) {
  const set = keySet(cells);
  const list = [...set].map(keyToCell);
  return {
    id: "hollow",
    layer: 50,
    draw(ctx, view) {
      if (list.length === 0) return;
      const r = view.R * MARKER_SIZE;
      const rIn = Math.max(0.45 * r, r - sideStep(HOLLOW_LINE));
      const rHalo = r + sideStep(HOLLOW_HALO);
      const halo = new Path2D();
      const line = new Path2D();
      for (const [i, j] of list) {
        const [X, Y] = view.toScreen(i, j);
        if (!onScreen(view, X, Y, view.cell)) continue;
        view.hexPath(halo, X, Y, rHalo);
        view.hexPath(halo, X, Y, r);
        view.hexPath(line, X, Y, r);
        view.hexPath(line, X, Y, rIn);
      }
      ctx.fillStyle = view.colours.canvas;
      ctx.fill(halo, "evenodd");
      ctx.fillStyle = view.colours.text || view.colours.outline;
      ctx.fill(line, "evenodd");
    },
  };
}
