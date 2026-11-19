// The overlay helpers that need no canvas: colour parsing, the fade colour mix, the overlay objects and layers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseColour, fadeHex, outline, fadeOutside, region, highlight, labels, modGrid, marker, MARKER_SIZE, DEFAULT_FADE } from "../../src/render/overlays.mjs";
import * as overlays from "../../src/render/overlays.mjs";
import { PALETTES } from "../../src/render/hex_canvas.mjs";

test("parseColour reads #rgb, #rrggbb and rgb()", () => {
  assert.deepEqual(parseColour("#d9534f"), [217, 83, 79]);
  assert.deepEqual(parseColour(" #FFF "), [255, 255, 255]);
  assert.deepEqual(parseColour("rgb(1, 2, 3)"), [1, 2, 3]);
  assert.deepEqual(parseColour("rgba(10,20,30,0.5)"), [10, 20, 30]);
  assert.throws(() => parseColour("red"), { code: "bad_colour" });
});

test("fadeHex mixes with white: c + (255 - c) f, rounded", () => {
  // by hand: 217 + 38 * 0.45 = 234.1, 83 + 172 * 0.45 = 160.4, 79 + 176 * 0.45 = 158.2
  assert.equal(fadeHex("#d9534f", 0.45), "#eaa09e");
  assert.equal(fadeHex("#000000", 0.5), "#808080");
  assert.equal(fadeHex("#123456", 0), "#123456");
  assert.equal(fadeHex("#123456", 1), "#ffffff");
  assert.equal(DEFAULT_FADE, 0.45);
  for (const pal of Object.values(PALETTES)) {
    for (const c of Object.values(pal)) {
      const f = parseColour(fadeHex(c, 0.45));
      parseColour(c).forEach((v, k) => assert.equal(f[k], Math.round(v + (255 - v) * 0.45)));
    }
  }
  assert.throws(() => fadeHex("#000000", 1.5), { code: "bad_fade" });
});

test("overlay objects: ids, layers, draw functions, input checks", () => {
  const cells = [[0, 0], [1, 0]];
  const list = [fadeOutside(cells), region(cells), highlight(cells, "#ff0"), modGrid(3, 1, -1), outline(cells), marker([0, 0]), labels([[0, 0, "a"]])];
  assert.deepEqual(list.map((o) => o.id), ["fade", "region", "highlight", "modgrid", "outline", "marker", "labels"]);
  assert.deepEqual(list.map((o) => o.layer), [10, 15, 20, 30, 40, 55, 60]);
  for (const o of list) assert.equal(typeof o.draw, "function");
  // one cell marker: a small hexagon at 0.4 of the cell size, the old ring is gone
  assert.equal(MARKER_SIZE, 0.4);
  assert.equal(overlays.ring, undefined);
  assert.equal(outline(cells, { id: "region" }).id, "region");
  // changed default: without f the fade uses the theme's fraction (0.45 light, 0.55 dark), reported as null
  assert.equal(fadeOutside(cells).fraction, null);
  assert.equal(fadeOutside(cells, 0.45).fraction, 0.45);
  assert.equal(fadeOutside([]).id, "fade", "fadeOutside([]) is allowed: every cell soft");
  assert.throws(() => outline([[0.5, 0]]), { code: "bad_cells" });
  assert.throws(() => region([[0, 0.5]]), { code: "bad_cells" });
  assert.throws(() => modGrid(0, 0, 0), { code: "bad_modulus" });
  assert.throws(() => fadeOutside(cells, -0.1), { code: "bad_fade" });
});

// a context that records the hexagons of each fill: [fillStyle, rule, [circumradius of each subpath]]
function recordingView(cell) {
  const fills = [];
  const view = {
    width: 400, height: 400, cell, R: cell / Math.sqrt(3), colours: { canvas: "#ffffff", text: "#1d1d1b", outline: "#111111" },
    toScreen: (i, j) => [100 + i * cell, 100 + j * cell],
    hexPath: (p, X, Y, r) => p.radii.push(r),
  };
  const ctx = { fillStyle: null, fill(p, rule) { fills.push([this.fillStyle, rule, p.radii]); }, stroke() { throw new Error("a hollow mark is filled, not stroked"); } };
  return { view, ctx, fills };
}

test("hollow marks: the outline of a hexagon of the marker's size, a halo outside it, the middle open", () => {
  const prev = globalThis.Path2D;
  globalThis.Path2D = class { constructor() { this.radii = []; } };
  try {
    const o = overlays.hollowMarks([[0, 0], [1, 0], [1, 0]]);
    assert.equal(o.id, "hollow");
    assert.equal(o.layer, 50);
    assert.ok(o.layer > outline([[0, 0]]).layer && o.layer < marker([0, 0]).layer);
    for (const cell of [4, 8, 22, 60]) {
      const { view, ctx, fills } = recordingView(cell);
      o.draw(ctx, view);
      assert.equal(fills.length, 2);
      const [[haloColour, haloRule, halo], [lineColour, lineRule, line]] = fills;
      assert.deepEqual([haloColour, haloRule, lineColour, lineRule], ["#ffffff", "evenodd", "#1d1d1b", "evenodd"]);
      assert.equal(halo.length, 4, "two cells, each a ring of two hexagons");
      const r = view.R * MARKER_SIZE;
      const [hOut, hIn] = halo;
      const [lOut, lIn] = line;
      assert.ok(Math.abs(lOut - r) < 1e-9 && Math.abs(hIn - r) < 1e-9, "the line's outer edge has the marker's size, the halo starts there");
      // across the sides: the line and the halo are HOLLOW_LINE and HOLLOW_HALO px, the open middle at least 0.45 of the mark
      const side = (dr) => (dr * Math.sqrt(3)) / 2;
      assert.ok(Math.abs(side(hOut - hIn) - overlays.HOLLOW_HALO) < 1e-9);
      assert.ok(lIn >= 0.45 * r - 1e-9 && lIn > 0);
      if (cell >= 22) assert.ok(Math.abs(side(lOut - lIn) - overlays.HOLLOW_LINE) < 1e-9, `cell ${cell}`);
    }
    // nothing to draw: no fill at all
    const { view, ctx, fills } = recordingView(22);
    overlays.hollowMarks([]).draw(ctx, view);
    assert.equal(fills.length, 0);
    assert.throws(() => overlays.hollowMarks([[0.5, 0]]), { code: "bad_cells" });
  } finally {
    globalThis.Path2D = prev;
  }
});
