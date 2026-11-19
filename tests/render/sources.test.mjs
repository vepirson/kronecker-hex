// The colour sources without a canvas: the Kronecker source (row reducers, cache, time slices) against the core's
// kronecker on windows at small coordinates and at a shipped witness, and the static source.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { kronecker } from "../../src/core/kronecker.mjs";
import { openToken } from "../../src/formats/token.mjs";
import { kroneckerSource, staticSource, fittedWindow, SLICE_MS } from "../../src/render/hex_canvas.mjs";

const tokens = JSON.parse(fs.readFileSync(new URL("../../data/tokens.json", import.meta.url), "utf8"));

function fillAll(src, rows) {
  let slices = 0;
  while (src.work(rows, performance.now() + SLICE_MS) > 0) slices++;
  return slices;
}

test("Kronecker source equals kronecker on small windows (signs of x and d, d = 0)", () => {
  for (const [x, d] of [[1080n, 517n], [-422n, -951n], [0n, 0n], [7n, -2n], [-34n, -54n]]) {
    const src = kroneckerSource(x, d);
    const fw = fittedWindow({ imin: -9, imax: 9, jmin: -7, jmax: 7 }, 10, 1);
    assert.equal(src.colour(0, 0), null, "pending before work");
    fillAll(src, fw.rows);
    let n = 0;
    for (const [j, lo, hi] of fw.rows) {
      for (let i = lo; i <= hi; i++) {
        assert.equal(src.colour(i, j), kronecker(x + BigInt(i), d + BigInt(j)), `${x + BigInt(i)}, ${d + BigInt(j)}`);
        n++;
      }
    }
    assert.equal(src.stats().cells, n);
  }
});

test("Kronecker source at a shipped witness (x0 of 10437 digits), in time slices", () => {
  const { x0, d0, data } = openToken(tokens.genus100_green);
  const src = kroneckerSource(x0, d0);
  const fw = fittedWindow(data.shape, 12, 3.5);
  const t0 = performance.now();
  const slices = fillAll(src, fw.rows);
  const ms = performance.now() - t0;
  let bad = 0;
  let inside = 0;
  const set = new Set(data.shape.map(([i, j]) => `${i},${j}`));
  for (const [j, lo, hi] of fw.rows) {
    for (let i = lo; i <= hi; i++) {
      const k = kronecker(x0 + BigInt(i), d0 + BigInt(j));
      if (src.colour(i, j) !== k) bad++;
      if (set.has(`${i},${j}`)) {
        inside++;
        assert.equal(k, data.colour, "every shape cell has the region colour");
      }
    }
  }
  assert.equal(bad, 0);
  assert.equal(inside, data.shape.length);
  console.log(`witness window: ${fw.cells} cells, ${slices + 1} slices, ${ms.toFixed(0)} ms`);
});

test("setCentre clears the cache, inputs are checked", () => {
  const src = kroneckerSource("1080", 517);
  src.compute(0, 0);
  assert.equal(src.colour(0, 0), kronecker(1080n, 517n));
  src.setCentre(5n, "-9");
  assert.equal(src.colour(0, 0), null);
  assert.equal(src.x, 5n);
  assert.equal(src.d, -9n);
  assert.throws(() => kroneckerSource("1.5", 2), { code: "bad_integer" });
  assert.throws(() => kroneckerSource(2 ** 60, 2), { code: "bad_integer" });
  assert.throws(() => src.compute(2 ** 24, 0), { code: "offset_too_large" });
});

test("static source: -1, 0, 1 or null, anything else empty", () => {
  const src = staticSource((i, j) => [1, -1, 0, null, undefined, 7, -0][((i % 7) + 7) % 7]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((i) => src.colour(i, 0)), [1, -1, 0, null, null, null, 0]);
  assert.ok(Object.is(src.colour(6, 0), 0), "-0 becomes 0");
  assert.equal(src.work([[0, 0, 10]], 0), 0);
  assert.throws(() => staticSource(null), { code: "bad_source" });
});
