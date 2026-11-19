// Guard of the sentence of the Proof page (section "Every genus") on the two families of shapes as the answer to the
// question writes them: the answer's S_g^{+-1} is the page's S_g^{+-1} (shapeS of src/core/shapes.mjs) under
// (i, j) -> (j, i - 1), and the answer's S_g^{0} is the page's S_g^{0} (shapeZ) under (i, j) -> (i - j + D, i), for
// g = 1 .. 30. The answer's two formulas are written out here, independently of the site's code. Both maps keep the
// six neighbour directions of the grid, and the page prints both maps.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { shapeS, shapeZ } from "../../src/core/shapes.mjs";

const G_MAX = 30;
const key = ([i, j]) => `${i},${j}`;
const keySet = (cells) => new Set(cells.map(key));
const sameSet = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));

// D of the answer: the even one of 3g and 3g + 1
const dOf = (g) => (3 * g) % 2 === 0 ? 3 * g : 3 * g + 1;

// The answer's S_g^{+-1}: {(i, 0) : 0 <= i <= 6g - 5} and, for k = 0 .. g - 1, (6k - 1, -1), (6k + 1, -1),
// (6k - 1, -2), (6k, -2).
function answerSigned(g) {
  const out = [];
  for (let i = 0; i <= 6 * g - 5; i++) out.push([i, 0]);
  for (let k = 0; k <= g - 1; k++) out.push([6 * k - 1, -1], [6 * k + 1, -1], [6 * k - 1, -2], [6 * k, -2]);
  return out;
}

// The answer's S_g^{0}: {(i, 0) : 0 <= i <= D}, {(i, 2) : 2 <= i <= D + 2}, {(D + 1 - 3k, 1) : 0 <= k <= g}.
function answerZero(g) {
  const D = dOf(g);
  const out = [];
  for (let i = 0; i <= D; i++) out.push([i, 0]);
  for (let i = 2; i <= D + 2; i++) out.push([i, 2]);
  for (let k = 0; k <= g; k++) out.push([D + 1 - 3 * k, 1]);
  return out;
}

const mapSigned = ([i, j]) => [j, i - 1];
const mapZero = (D) => ([i, j]) => [i - j + D, i];

const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];

test("the answer's formulas have no cell twice and the stated areas 10g - 4 and 2D + g + 3, g = 1 .. 30", () => {
  for (let g = 1; g <= G_MAX; g++) {
    const s = answerSigned(g), z = answerZero(g);
    assert.equal(keySet(s).size, s.length, `S_${g}^{+-1}`);
    assert.equal(s.length, 10 * g - 4, `S_${g}^{+-1}`);
    assert.equal(keySet(z).size, z.length, `S_${g}^{0}`);
    assert.equal(z.length, 2 * dOf(g) + g + 3, `S_${g}^{0}`);
  }
});

test("the answer's S_g^{+-1} is the image of shapeS(g) under (i, j) -> (j, i - 1), g = 1 .. 30", () => {
  for (let g = 1; g <= G_MAX; g++) {
    const site = shapeS(g);
    const image = keySet(site.map(mapSigned));
    assert.equal(image.size, site.length, `the map is one to one on S_${g}^{+-1}`);
    assert.ok(sameSet(image, keySet(answerSigned(g))), `S_${g}^{+-1}`);
  }
});

test("the answer's S_g^{0} is the image of shapeZ(g) under (i, j) -> (i - j + D, i), g = 1 .. 30", () => {
  for (let g = 1; g <= G_MAX; g++) {
    const site = shapeZ(g);
    const image = keySet(site.map(mapZero(dOf(g))));
    assert.equal(image.size, site.length, `the map is one to one on S_${g}^{0}`);
    assert.ok(sameSet(image, keySet(answerZero(g))), `S_${g}^{0}`);
  }
});

test("both maps keep the six neighbour directions (symmetries of the grid)", () => {
  const dirs = keySet(DIRECTIONS);
  // the linear parts: (i, j) -> (j, i) and (i, j) -> (i - j, i)
  for (const lin of [([i, j]) => [j, i], ([i, j]) => [i - j, i]]) {
    assert.ok(sameSet(keySet(DIRECTIONS.map(lin)), dirs));
  }
  // the full maps differ from them by a translation: the difference of the images of two neighbours is a direction
  for (const f of [mapSigned, mapZero(7)]) {
    for (const [a, b] of DIRECTIONS) {
      const p = f([5, -3]), q = f([5 + a, -3 + b]);
      assert.ok(dirs.has(key([q[0] - p[0], q[1] - p[1]])));
    }
  }
});

test("the Proof page prints the two maps", () => {
  const html = fs.readFileSync(new URL("../../content/proof/04_every_genus.html", import.meta.url), "utf8");
  assert.ok(html.includes("$S_{g}^{\\pm1}$ is the set $S_{g}^{\\pm1}$ above under $(i,j)\\mapsto(j,i-1)$"));
  assert.ok(html.includes("$S_{g}^{0}$ is the set $S_{g}^{0}$ above under $(i,j)\\mapsto(i-j+D,i)$"));
});
