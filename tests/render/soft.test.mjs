// The soft look: the soft colour formula (fill mixed with the theme's soft target), the theme defaults, the colours of
// exported images, and the drawing with the soft option, the region overlay and fadeOutside, recorded on a fake 2D
// context (no browser needed: every fill call is recorded with its colour and its number of hexagons).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mixHex, fadeHex, softFillsOf, region, fadeOutside, outline, DEFAULT_FADE, DEFAULT_SOFT_TO } from "../../src/render/overlays.mjs";
import { renderWindow, staticSource, fittedWindow, resolveColours, exportColours, PALETTES, THEMES, DARK_FILLS, EXPORT_THEME } from "../../src/render/hex_canvas.mjs";

// ---------- a fake canvas that records what is drawn ----------

class FakePath {
  constructor() {
    this.hexes = 0;
    this.segments = 0;
  }
  moveTo() {}
  lineTo() {
    this.segments++;
  }
  closePath() {
    this.hexes++;
  }
  arc() {}
}
globalThis.Path2D = FakePath;

function fakeCanvas() {
  const log = { fills: new Map(), strokes: [], background: [] };
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "",
    setTransform() {},
    save() {},
    restore() {},
    fillRect() {
      log.background.push(this.fillStyle);
    },
    fill(p) {
      log.fills.set(this.fillStyle, (log.fills.get(this.fillStyle) || 0) + p.hexes);
    },
    stroke(p) {
      log.strokes.push({ colour: this.strokeStyle, segments: p.segments });
    },
  };
  return { canvas: { width: 0, height: 0, style: {}, getContext: () => ctx }, log };
}

const mod3 = (v) => ((v % 3) + 3) % 3;
const colourOf = (i, j) => [-1, 0, 1][mod3(i + 2 * j)];
const BOUNDS = { imin: -5, imax: 5, jmin: -4, jmax: 4 };

function windowCounts(bounds, cell, pad, inside = () => false) {
  const out = { all: { "-1": 0, 0: 0, 1: 0 }, inside: { "-1": 0, 0: 0, 1: 0 } };
  for (const [j, lo, hi] of fittedWindow(bounds, cell, pad).rows) {
    for (let i = lo; i <= hi; i++) {
      const k = colourOf(i, j);
      out.all[k]++;
      if (inside(i, j)) out.inside[k]++;
    }
  }
  return out;
}

// ---------- the formula ----------

test("soft colour = fill mixed with the soft target, per channel, rounded: the exact light values", () => {
  const light = softFillsOf({ fills: PALETTES.standard, softTo: "#ffffff", softFraction: 0.45 });
  assert.deepEqual(light, { "-1": "#eaa09e", 0: "#9bb9e7", 1: "#95cda5" });
  // mixing with white is the old fade
  for (const c of Object.values(PALETTES.standard)) assert.equal(mixHex(c, "#ffffff", 0.45), fadeHex(c, 0.45));
  // by hand for blue #4a7fd4: 74 + 181 * 0.45 = 155.45, 127 + 128 * 0.45 = 184.6, 212 + 43 * 0.45 = 231.35
  assert.equal(mixHex("#4a7fd4", "#ffffff", 0.45), "#9bb9e7");
  assert.equal(DEFAULT_FADE, 0.45);
  assert.equal(DEFAULT_SOFT_TO, "#ffffff");
});

test("dark theme: the soft cells are dimmed toward the dark canvas, never washed out toward white", () => {
  const dark = softFillsOf({ fills: DARK_FILLS, softTo: THEMES.dark.softTo, softFraction: THEMES.dark.softFraction });
  // by hand for red #e2605b toward #14151a at 0.55: 226 - 206 * 0.55 = 112.7, 96 - 75 * 0.55 = 54.75, 91 - 65 * 0.55 = 55.25
  assert.deepEqual(dark, { "-1": "#713737", 0: "#344c76", 1: "#2d5e3e" });
  for (const c of Object.values(dark)) {
    const sum = [1, 3, 5].reduce((a, k) => a + parseInt(c.slice(k, k + 2), 16), 0);
    assert.ok(sum < 3 * 128, `${c} is darker than mid grey`);
  }
  // the purple selection colour left the canvas palette: the one cell marker uses the text colour
  assert.deepEqual(THEMES.dark, { canvas: "#14151a", outline: "#000000", pending: "#3a3b40", empty: "#26272b", text: "#e6e6e1", softTo: "#14151a", softFraction: 0.55 });
  assert.equal(THEMES.light.canvas, "#ffffff", "white lines between the hexagons");
  assert.equal(THEMES.light.outline, "#111111");
});

test("the colour-blind palette keeps its fills in both themes and follows the same rule", () => {
  const cb = PALETTES.colourblind;
  const light = softFillsOf({ fills: cb, softTo: "#ffffff", softFraction: 0.45 });
  const dark = softFillsOf({ fills: cb, softTo: "#14151a", softFraction: 0.55 });
  for (const k of ["-1", "0", "1"]) {
    const f = cb[k];
    const c = [1, 3, 5].map((p) => parseInt(f.slice(p, p + 2), 16));
    const want = (t, fr) => "#" + c.map((v, q) => Math.round(v + (t[q] - v) * fr).toString(16).padStart(2, "0")).join("");
    assert.equal(light[k], want([255, 255, 255], 0.45));
    assert.equal(dark[k], want([20, 21, 26], 0.55));
  }
  assert.throws(() => mixHex("#000000", "#ffffff", 2), { code: "bad_fade" });
});

test("resolveColours outside a browser: the light theme with the soft fills; exports: fixed light theme", () => {
  const c = resolveColours();
  assert.equal(c.canvas, "#ffffff");
  assert.equal(c.softTo, "#ffffff");
  assert.equal(c.softFraction, 0.45);
  assert.deepEqual(c.softFills, { "-1": "#eaa09e", 0: "#9bb9e7", 1: "#95cda5" });
  const e = exportColours();
  assert.deepEqual(e.fills, { "-1": "#d9534f", 0: "#4a7fd4", 1: "#3fa45b" });
  assert.deepEqual(e.softFills, { "-1": "#eaa09e", 0: "#9bb9e7", 1: "#95cda5" });
  assert.equal(e.canvas, "#ffffff");
  assert.equal(e.outline, "#111111");
  assert.equal(EXPORT_THEME.softFraction, 0.45);
});

// ---------- drawing ----------

test("renderWindow default: full fills, white background; soft: every cell soft", async () => {
  const cell = 12;
  const pad = 1;
  const n = windowCounts(BOUNDS, cell, pad).all;
  const full = fakeCanvas();
  await renderWindow(full.canvas, { source: staticSource(colourOf), bounds: BOUNDS, cell, pad, dpr: 1 });
  assert.deepEqual(full.log.background, ["#ffffff"]);
  assert.deepEqual(Object.fromEntries(full.log.fills), { "#d9534f": n["-1"], "#4a7fd4": n[0], "#3fa45b": n[1] });
  const soft = fakeCanvas();
  await renderWindow(soft.canvas, { source: staticSource(colourOf), bounds: BOUNDS, cell, pad, dpr: 1, soft: true });
  assert.deepEqual(Object.fromEntries(soft.log.fills), { "#eaa09e": n["-1"], "#9bb9e7": n[0], "#95cda5": n[1] });
});

test("soft + region(cells): the region at full strength with one outline stroke on top", async () => {
  const cell = 12;
  const pad = 1;
  const cells = [];
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) cells.push([i, j]);
  const inside = (i, j) => Math.abs(i) <= 2 && Math.abs(j) <= 2;
  const n = windowCounts(BOUNDS, cell, pad, inside);
  const r = fakeCanvas();
  await renderWindow(r.canvas, { source: staticSource(colourOf), bounds: BOUNDS, cell, pad, dpr: 1, soft: true, overlays: [region(cells)] });
  assert.deepEqual(Object.fromEntries(r.log.fills), {
    "#eaa09e": n.all["-1"], "#9bb9e7": n.all[0], "#95cda5": n.all[1],
    "#d9534f": n.inside["-1"], "#4a7fd4": n.inside[0], "#3fa45b": n.inside[1],
  });
  assert.equal(r.log.strokes.length, 1);
  assert.equal(r.log.strokes[0].colour, "#111111");
  // boundary edges of the 5 x 5 block: 6 * 25 edge sides minus 2 per inner adjacency (20 along i, 20 along j, 16
  // along the diagonal (1, 1)) = 150 - 112 = 38
  assert.equal(r.log.strokes[0].segments, 38);
  // the outline of region equals the separate outline overlay
  const o = fakeCanvas();
  await renderWindow(o.canvas, { source: staticSource(colourOf), bounds: BOUNDS, cell, pad, dpr: 1, overlays: [outline(cells)] });
  assert.equal(o.log.strokes[0].segments, r.log.strokes[0].segments);
  // region without outline
  const q = fakeCanvas();
  await renderWindow(q.canvas, { source: staticSource(colourOf), bounds: BOUNDS, cell, pad, dpr: 1, soft: true, overlays: [region(cells, { outline: false })] });
  assert.equal(q.log.strokes.length, 0);
});

test("fadeOutside([]) makes every cell soft, fadeOutside(cells) every cell outside; the dark theme dims", async () => {
  const cell = 12;
  const pad = 1;
  const n = windowCounts(BOUNDS, cell, pad).all;
  const a = fakeCanvas();
  await renderWindow(a.canvas, { source: staticSource(colourOf), bounds: BOUNDS, cell, pad, dpr: 1, overlays: [fadeOutside([])] });
  const fa = Object.fromEntries(a.log.fills);
  assert.equal(fa["#eaa09e"], n["-1"]);
  assert.equal(fa["#9bb9e7"], n[0]);
  assert.equal(fa["#95cda5"], n[1]);
  // dark theme colours given explicitly (no softFills member: computed from softTo and softFraction)
  const dark = { ...THEMES.dark, fills: { ...DARK_FILLS } };
  const b = fakeCanvas();
  await renderWindow(b.canvas, { source: staticSource(colourOf), bounds: BOUNDS, cell, pad, dpr: 1, colours: dark, overlays: [fadeOutside([])] });
  const fb = Object.fromEntries(b.log.fills);
  assert.deepEqual(b.log.background, ["#14151a"]);
  assert.equal(fb["#e2605b"], n["-1"], "full dark fills first");
  assert.equal(fb["#713737"], n["-1"]);
  assert.equal(fb["#344c76"], n[0]);
  assert.equal(fb["#2d5e3e"], n[1]);
  // an explicit fraction mixes with the theme's target too
  const c = fakeCanvas();
  await renderWindow(c.canvas, { source: staticSource(colourOf), bounds: BOUNDS, cell, pad, dpr: 1, colours: dark, overlays: [fadeOutside([], 0.45)] });
  assert.equal(Object.fromEntries(c.log.fills)[mixHex("#e2605b", "#14151a", 0.45)], n["-1"]);
  // the soft option with the dark colours gives the same dimmed values
  const d = fakeCanvas();
  await renderWindow(d.canvas, { source: staticSource(colourOf), bounds: BOUNDS, cell, pad, dpr: 1, colours: dark, soft: true });
  assert.deepEqual(Object.fromEntries(d.log.fills), { "#713737": n["-1"], "#344c76": n[0], "#2d5e3e": n[1] });
});

test("soft keeps the empty colour of a static source", async () => {
  const cell = 12;
  const src = staticSource((i, j) => (i === 0 && j === 0 ? null : 1));
  const r = fakeCanvas();
  await renderWindow(r.canvas, { source: src, bounds: [[0, 0]], cell, pad: 1, dpr: 1, soft: true });
  assert.equal(r.log.fills.get("#e6e6df"), 1);
  assert.ok(r.log.fills.get("#95cda5") > 1);
});
