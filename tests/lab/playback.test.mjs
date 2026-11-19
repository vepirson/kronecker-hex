// The playback of the Construction Lab: the pure parts of the timeline (src/ui/widgets/timeline.mjs), the position text
// shared with the stepper, the speeds of the page (src/ui/pages/lab/index.mjs) and the box "any genus"
// (src/ui/pages/lab/model.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";

import { itemsOf, itemIndex, positionAt, MIN_SEGMENT } from "../../src/ui/widgets/timeline.mjs";
import { positionText, nextPos } from "../../src/ui/widgets/stepper.mjs";
import * as model from "../../src/ui/pages/lab/model.mjs";
import { shapeZ, shapeS, seedS } from "../../src/core/shapes.mjs";
import { runPlace } from "../../src/construct/index.mjs";

test("timeline: items per step, the index of a position, the nearest item of a point", () => {
  const counts = [2, 0, 3];
  assert.deepEqual(itemsOf(counts), [3, 1, 4]);
  assert.equal(MIN_SEGMENT, 12);
  // the index walks every item once, in the stepper's order
  let pos = { step: 0, sub: 0 };
  const seen = [];
  for (;;) {
    seen.push(itemIndex(pos, counts));
    const q = nextPos({ ...pos, subCount: counts[pos.step] }, counts.length);
    if (!q) break;
    pos = q;
  }
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, 6, 7]);
  const widths = [30, 10, 40];
  assert.deepEqual(positionAt(0, widths, counts), { step: 0, sub: 0 });
  assert.deepEqual(positionAt(25 / 80, widths, counts), { step: 0, sub: 2 });
  assert.deepEqual(positionAt(35 / 80, widths, counts), { step: 1, sub: 0 });
  assert.deepEqual(positionAt(55 / 80, widths, counts), { step: 2, sub: 1 });
  assert.deepEqual(positionAt(1, widths, counts), { step: 2, sub: 3 });
  assert.deepEqual(positionAt(-3, widths, counts), { step: 0, sub: 0 });
  assert.equal(positionText({ step: 3, sub: 2, subCount: 39 }, 8), "step 3 of 0-7, item 3 of 40");
  assert.equal(positionText({ step: 0, sub: 0, subCount: 0 }, 6), "step 0 of 0-5");
});

test("the speeds of play and their intervals", async () => {
  const page = await import("../../src/ui/pages/lab/index.mjs");
  assert.deepEqual(page.SPEEDS, [0.5, 1, 2, 4]);
  assert.equal(page.PLAY_MS, 900);
  assert.deepEqual(page.SPEEDS.map(page.playMsOf), [1800, 900, 450, 225]);
  const store = (lab) => ({ get: () => ({ lab }) });
  assert.equal(page.readSpeed(store({ speed: 4 })), 4);
  assert.equal(page.readSpeed(store({ speed: 3 })), 1);
  assert.equal(page.readSpeed(store({})), 1);
});

test("the box any genus: green or red where the one rule sends a live run (the worker), blue by size, the measured limits enforced", () => {
  const { sign, blue } = model.GENUS_LIMITS;
  // the measured bounds of the memory of a run (the time of a run is not bounded: it shows its progress and stops)
  assert.deepEqual({ sign, blue }, { sign: 70, blue: 1200 });
  // the limits, without the time they were measured by (no timing on the page)
  assert.equal(model.genusLimitsText(), `$S_{g}^{\\pm1}$ of region type +1 or -1 up to g = ${sign}, $S_{g}^{0}$ of region type 0 up to g = ${blue}.`);
  assert.equal(model.genusLimit(1), sign);
  assert.equal(model.genusLimit(-1), sign);
  assert.equal(model.genusLimit(0), blue);
  assert.deepEqual(model.resolveGenus(String(sign), "red"), { kind: "preset", name: `S_${sign} (type +-1)`, nameTex: `$S_{${sign}}^{\\pm1}$`, colour: -1, lift: 1, family: "s", g: sign, shapeKind: "computed", mode: "live", runOn: "worker" });
  // a live green or red run of the box goes where the one rule sends a live run of its kind
  for (const g of [1, 12, sign]) assert.equal(model.resolveGenus(String(g), "green").runOn, runPlace({ shape: shapeS(g), seed: seedS(g), colour: 1 }));
  assert.equal(model.resolveGenus(String(sign + 1), "green").blocked.text, `$S_{${sign + 1}}^{\\pm1}$ cannot be packed here: the Any genus box packs $S_{g}^{\\pm1}$ up to g = ${sign}.`);
  assert.equal(model.resolveGenus(String(sign + 1), "green").blocked.plain, `S_${sign + 1} (type +-1) cannot be packed here: the Any genus box packs S_g (type +-1) up to g = ${sign}.`);
  const zb = model.resolveGenus(String(blue), "blue");
  assert.equal(zb.blocked, undefined);
  assert.equal(zb.runOn, shapeZ(blue).length <= 100 ? "main" : "worker");
  assert.equal(model.resolveGenus("13", "blue").runOn, "main");
  assert.equal(model.resolveGenus("14", "blue").runOn, "worker");
  assert.ok(model.resolveGenus(String(blue + 1), "blue").blocked);
  for (const bad of ["0", "-1", "2.5", "", "x", "1234567"]) assert.equal(model.resolveGenus(bad, "green"), null, bad);
  assert.equal(model.resolveGenus("3", "purple"), null);
  assert.equal(model.resolveInput({ query: { genus: "3", colour: "blue" } }).name, "S_3 (type 0)");
  assert.match(model.resolveInput({ query: { genus: String(blue + 1), colour: "blue" } }).problem, /cannot be packed here/);
  assert.match(model.resolveInput({ query: { genus: "x" } }).problem, /not a whole number/);
  assert.deepEqual(model.presetInput(model.resolveGenus("4", "blue")).shape, shapeZ(4));
});
