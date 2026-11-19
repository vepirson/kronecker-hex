// The ruler of the timeline widget: where the minor ticks of a segment go for given item counts and widths (every
// item while the items are at least TICK_MIN_PX wide, else every k-th with k in 2, 5, 10, 20, 50, 100, ...), and the
// position text of the stepper with the items counted from 1.

import { test } from "node:test";
import assert from "node:assert/strict";

import { tickEvery, tickItems, TICK_MIN_PX } from "../../src/ui/widgets/timeline.mjs";
import { positionText } from "../../src/ui/widgets/stepper.mjs";

test("the minor ticks of a segment: every item when there is room, thinned as on a ruler, none for one item", () => {
  assert.equal(TICK_MIN_PX, 6);
  assert.deepEqual(tickItems(1, 300), []);
  assert.deepEqual(tickItems(3, 60), [1, 2]);
  assert.deepEqual(tickItems(4, 24), [1, 2, 3]);
  // 3 px per item: every 2nd, 1 px: every 10th (5 x 1 px is 5 px, too little), 0.1 px: every 100th
  assert.deepEqual(tickItems(10, 30), [2, 4, 6, 8]);
  assert.equal(tickEvery(40, 40), 10);
  assert.deepEqual(tickItems(40, 40), [10, 20, 30]);
  assert.equal(tickEvery(1000, 100), 100);
  assert.equal(tickEvery(151, 250), 5);
  assert.equal(tickEvery(151, 90), 20);
  // the ticks are always at least TICK_MIN_PX apart, and k is the smallest step of the ruler that leaves that room
  for (const [n, w] of [[2, 12], [8, 30], [41, 200], [151, 300], [700, 120], [5000, 900]]) {
    const k = tickEvery(n, w);
    assert.ok((w / n) * k >= TICK_MIN_PX, `${n} ${w}`);
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    const smaller = steps.filter((s) => s < k);
    assert.ok(smaller.every((s) => (w / n) * s < TICK_MIN_PX), `${n} ${w}: k ${k}`);
    assert.deepEqual(tickItems(n, w), Array.from({ length: Math.ceil(n / k) - 1 }, (_, q) => (q + 1) * k).filter((q) => q < n));
  }
});

test("the position text names the step, the items counted from 1 (the overview is item 1)", () => {
  const names = ["Shape", "step 1.1", "step 1.2", "Check"];
  assert.equal(positionText({ step: 0, sub: 0, subCount: 2 }, 4, names), "Shape, item 1 of 3");
  assert.equal(positionText({ step: 2, sub: 6, subCount: 39 }, 4, names), "step 1.2, item 7 of 40");
  assert.equal(positionText({ step: 3, sub: 0, subCount: 0 }, 4, names), "Check");
});
