// The steps of the Construction Lab and the moves of its stepper: ONE table per kind gives the number and the title of
// every step (src/ui/pages/lab/steps.mjs), the heading the frame writes for a step equals the label of its step button
// for both kinds, no step module writes a number of its own, the texts of the Lab name the steps by their numbers, and
// every move of the stepper (the four arrows, the keys) is one pure function, moveTarget of src/ui/widgets/stepper.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { STEP_TABLES, stepLabel, stepLabels, stepRef, stepPlace, isMainStep, stepNumberText } from "../../src/ui/pages/lab/steps.mjs";
import { SIGN, BLUE, KINDS, renderStep } from "../../src/ui/pages/lab/kinds.mjs";
import { moveTarget, positionText, nextPos } from "../../src/ui/widgets/stepper.mjs";
import { buildLabView } from "../../src/construct/lab_view.mjs";
import { runToEnd } from "../../src/construct/index.mjs";
import { shapeS, seedS, shapeZ, seedZ } from "../../src/core/shapes.mjs";
import { ICONS } from "../../src/ui/widgets/icons.mjs";

// the first step of a part of the answer carries the part's number alone with a full stop and the answer's title (a
// main step, in bold), a further step of the part keeps its second digit
const SIGN_LABELS = ["Shape", "1. Small primes", "1.2 Remaining cells", "2. Row primes", "2.2 Cofactors and d", "3. One row", "4. Packing rows", "Check"];
const BLUE_LABELS = ["Shape", "1. Small primes", "1.2 Own primes", "1.3 d", "1.4 x", "Check"];
const SIGN_MAIN = [false, true, false, true, false, true, true, false];
const BLUE_MAIN = [false, true, false, false, false, false];

test("one table per kind: the numbers of the answer, no number on the first and the last step", () => {
  assert.deepEqual(STEP_TABLES.sign.map(isMainStep), SIGN_MAIN);
  assert.deepEqual(STEP_TABLES.blue.map(isMainStep), BLUE_MAIN);
  assert.deepEqual(STEP_TABLES.sign.map(stepNumberText), ["", "1.", "1.2", "2.", "2.2", "3.", "4.", ""]);
  // the position text and the sentences name a main step by its number alone
  assert.deepEqual([stepPlace("sign", 1), stepPlace("sign", 2), stepRef("sign", 1, true), stepRef("blue", 2)], ["step 1", "step 1.2", "Step 1", "step 1.2"]);
  assert.deepEqual(stepLabels("sign"), SIGN_LABELS);
  assert.deepEqual(stepLabels("blue"), BLUE_LABELS);
  for (const e of Object.values(KINDS)) {
    assert.equal(STEP_TABLES[e.id].length, e.steps.length, e.id);
    assert.deepEqual(e.labels, stepLabels(e.id), e.id);
    const t = STEP_TABLES[e.id];
    assert.equal(t[0].number, null);
    assert.equal(t.at(-1).number, null);
    for (const row of t) assert.ok(row.title.length > 0 && row.title.length < 30, row.title);
  }
  assert.equal(stepLabel({ number: "2.2", title: "Cofactors and d" }), "2.2 Cofactors and d");
  assert.equal(stepLabel({ number: "2", title: "Row primes" }), "2. Row primes");
  assert.deepEqual([stepRef("sign", 5), stepRef("sign", 0), stepRef("sign", 7, true), stepRef("blue", 5), stepRef("blue", 3, true)],
    ["step 3", "the shape", "The check", "the check", "Step 1.3"]);
  // the position text starts with the number of a step, or with the title of an end
  assert.deepEqual([stepPlace("sign", 0), stepPlace("sign", 3), stepPlace("blue", 5)], ["Shape", "step 2", "Check"]);
});

// a DOM-free panel and kit: h builds plain nodes, the canvas calls are counted
function fakeNode(tag, attrs, children) {
  const node = { tag, attrs: attrs || {}, children: [], dataset: {} };
  const add = (c) => {
    if (c === null || c === undefined || c === false || c === true) return;
    if (Array.isArray(c)) c.forEach(add);
    else node.children.push(c);
  };
  children.forEach(add);
  node.append = (...more) => more.forEach(add);
  node.replaceChildren = (...more) => {
    node.children = [];
    more.forEach(add);
  };
  node.querySelector = () => null;
  return node;
}
const fakeKit = () => {
  const calls = { clear: 0, sources: 0 };
  return {
    calls,
    h: (tag, attrs, ...children) => fakeNode(tag, attrs, children),
    text: () => "",
    bigNumber: () => ({ parts: {}, update() {} }),
    hex: { setSource: () => calls.sources++, setOverlays() {}, clear: () => calls.clear++, fit() {}, onCellHover: () => () => {}, onCellClick: () => () => {} },
    table: { highlight() {}, onLineClick: () => () => {} },
    result: null,
  };
};
const textOf = (n) => (typeof n === "string" || typeof n === "number" ? String(n) : n.children.map(textOf).join(""));
// the steps that load their own styles (useStyles) find a document head here
const links = [];
globalThis.document ??= { baseURI: "http://localhost/", head: { querySelectorAll: () => links, appendChild: (l) => links.push(l) }, createElement: () => ({ addEventListener() {} }) };

test("the frame of a step: the heading is the label of its step button, a step without data clears the canvas", () => {
  for (const [entry, run] of [[SIGN, () => runToEnd({ shape: shapeS(1), seed: seedS(1), colour: 1, lift: 1 })], [BLUE, () => runToEnd({ shape: shapeZ(1), seed: seedZ(1), colour: 0 })]]) {
    const { events } = run();
    for (const view of [entry.buildView([]), entry.buildView(events)]) {
      entry.steps.forEach((m, k) => {
        const panel = fakeNode("section", null, []);
        const kit = fakeKit();
        renderStep(entry, k, panel, view, 0, kit);
        const head = panel.children[0];
        assert.equal(head.tag, "h2", `${entry.id} ${k}`);
        assert.equal(textOf(head), entry.labels[k], `${entry.id} ${k}: the heading equals the step button's label`);
        if (!view.available[k]) assert.equal(kit.calls.clear, 1, `${entry.id} ${k}: no data, the canvas is cleared`);
      });
    }
  }
  assert.equal(buildLabView([]).available.length, SIGN.steps.length);
});

test("no step module writes its own number or its own heading", () => {
  const dir = new URL("../../src/ui/pages/lab/", import.meta.url);
  const files = [...fs.readdirSync(dir).filter((f) => /^step\d\.mjs$/.test(f)), ...fs.readdirSync(new URL("blue/", dir)).filter((f) => /^step\d\.mjs$/.test(f)).map((f) => `blue/${f}`)];
  assert.equal(files.length, 14);
  for (const f of files) {
    const code = fs.readFileSync(new URL(f, dir), "utf8").replace(/\/\/[^\n]*/g, "");
    assert.equal(/lab-h2|`\d+(\.\d+)?\. |heading|export const title/.test(code), false, f);
  }
  // the texts of the Lab name steps by their numbers: no "step 5" (an index) in the content files of the Lab
  for (const f of fs.readdirSync(new URL("../../content/lab/", import.meta.url))) {
    const text = fs.readFileSync(new URL(`../../content/lab/${f}`, import.meta.url), "utf8");
    const refs = [...text.matchAll(/\b[Ss]teps? (\d+(?:\.\d+)?)(?: (?:and|to) (\d+(?:\.\d+)?))?/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean);
    const kind = f.startsWith("blue") ? "blue" : "sign";
    const numbers = new Set(STEP_TABLES[kind].map((r) => r.number).filter(Boolean));
    for (const n of refs) assert.ok(numbers.has(n), `${f}: "step ${n}" is not a step number of the ${kind} kind`);
  }
});

test("the moves of the stepper: one pure function for the arrows and the keys", () => {
  const counts = [2, 0, 3, 1];
  const enabled = [true, true, true, false];
  const opts = { stepCount: 4, isEnabled: (k) => enabled[k], subCountOf: (k) => counts[k] };
  const at = (step, sub) => ({ step, sub, subCount: counts[step] });
  const go = (action, step, sub) => moveTarget(action, at(step, sub), opts);
  // next and prev items
  assert.deepEqual(go("next", 0, 0), { step: 0, sub: 1 });
  assert.deepEqual(go("next", 0, 2), { step: 1, sub: 0 });
  assert.equal(go("next", 2, 3), null, "the next step is not enabled");
  assert.deepEqual(go("prev", 2, 0), { step: 1, sub: 0 });
  assert.deepEqual(go("prev", 1, 0), { step: 0, sub: 2 }, "back to the last item of the step before");
  assert.equal(go("prev", 0, 0), null);
  // >>: the end of this step, from its end the start of the next step; <<: the start of this step, from its start the
  // end of the step before
  assert.deepEqual(go("nextStep", 0, 0), { step: 0, sub: 2 }, "first to the end of this step");
  assert.deepEqual(go("nextStep", 0, 1), { step: 0, sub: 2 });
  assert.deepEqual(go("nextStep", 0, 2), { step: 1, sub: 0 }, "from the end to the start of the next step");
  assert.deepEqual(go("nextStep", 1, 0), { step: 2, sub: 0 }, "a step of one item: one press leaves it");
  assert.deepEqual(go("nextStep", 2, 1), { step: 2, sub: 3 }, "the end of this step even when the next one is not enabled");
  assert.equal(go("nextStep", 2, 3), null, "the next step is not enabled");
  assert.deepEqual(go("prevStep", 2, 2), { step: 2, sub: 0 });
  assert.deepEqual(go("prevStep", 2, 0), { step: 1, sub: 0 }, "a step of one item: its end is its start");
  assert.deepEqual(go("prevStep", 1, 0), { step: 0, sub: 2 }, "from the start to the end of the step before");
  assert.equal(go("prevStep", 0, 0), null);
  // repeated presses: end, start of the next, end of the next, ... and back
  const walk = (action, from, n) => {
    const out = [];
    let p = from;
    for (let k = 0; k < n; k++) {
      const q = moveTarget(action, at(p.step, p.sub), opts);
      if (!q) break;
      out.push([q.step, q.sub]);
      p = q;
    }
    return out;
  };
  assert.deepEqual(walk("nextStep", { step: 0, sub: 1 }, 9), [[0, 2], [1, 0], [2, 0], [2, 3]]);
  assert.deepEqual(walk("prevStep", { step: 2, sub: 2 }, 9), [[2, 0], [1, 0], [0, 2], [0, 0]]);
  // with every step enabled >> stops only at the last item of the last step
  const all = { ...opts, isEnabled: () => true };
  assert.deepEqual(moveTarget("nextStep", at(3, 0), all), { step: 3, sub: 1 });
  assert.equal(moveTarget("nextStep", at(3, 1), all), null);
  // first and last (the last enabled step at its last item)
  assert.deepEqual(go("first", 2, 2), { step: 0, sub: 0 });
  assert.deepEqual(go("last", 0, 0), { step: 2, sub: 3 });
  assert.equal(go("toggle", 0, 0), null);
  // next agrees with nextPos where the next step is enabled
  assert.deepEqual(go("next", 1, 0), nextPos(at(1, 0), 4));
  // the position text names a step by its name when the names are given
  assert.equal(positionText(at(2, 1), 4), "step 2 of 0-3, item 2 of 4");
  assert.equal(positionText(at(2, 1), 4, ["Shape", "step 1.1", "step 1.2", "Check"]), "step 1.2, item 2 of 4");
  assert.equal(positionText(at(1, 0), 4, ["Shape", "step 1.1", "step 1.2", "Check"]), "step 1.1");
});

test("the four arrows of the stepper: two pairs of icons, each the mirror image of the other", () => {
  const pts = (name) => ICONS[name].map(([, a]) => a.d.match(/-?\d+(\.\d+)?/g).map(Number));
  const mirror = (p) => p.map((v, k) => (k % 2 === 0 ? 16 - v : v));
  for (const [a, b] of [["prev", "next"], ["prevStep", "nextStep"]]) {
    assert.deepEqual(pts(a).map(mirror), pts(b), `${a} and ${b}`);
  }
});
