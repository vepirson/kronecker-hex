// The store: the merge rule (top level, one level deep for plain objects, arrays replaced), subscriptions, and the
// rule that no bigint enters the store outside lab.events and lab.result.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, mergeState, isPlainObject, defaultState } from "../../src/ui/store.mjs";

test("set merges one level deep for plain objects and replaces arrays", () => {
  const st = createStore({ a: { x: 1, y: 2 }, b: [1, 2], c: 3 });
  st.set({ a: { y: 5 } });
  assert.deepEqual(st.get(), { a: { x: 1, y: 5 }, b: [1, 2], c: 3 });
  st.set({ b: [3] });
  assert.deepEqual(st.get().b, [3]);
  st.set({ a: { z: { q: 1 } } });
  st.set({ a: { z: { r: 2 } } });
  assert.deepEqual(st.get().a, { x: 1, y: 5, z: { r: 2 } }, "only one level deep");
  st.set({ c: { k: 1 } });
  assert.deepEqual(st.get().c, { k: 1 }, "a plain object over a non-object replaces it");
  st.set({ a: null });
  assert.equal(st.get().a, null);
  st.set({ d: "new" });
  assert.equal(st.get().d, "new");
});

test("the lab key keeps its other fields: set({ lab: { input } })", () => {
  const st = createStore(defaultState());
  const before = st.get().lab;
  st.set({ lab: { input: { shape: [[0, 0]], seed: [0, 0], colour: 1, lift: 1, id: null } } });
  const after = st.get().lab;
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
  assert.equal(after.mode, before.mode);
  assert.deepEqual(after.input.shape, [[0, 0]]);
  assert.notEqual(after, before, "a new object");
});

test("mergeState does not change its inputs", () => {
  const s = { a: { x: 1 }, b: [1] };
  const p = { a: { y: 2 }, b: [2] };
  const out = mergeState(s, p);
  assert.deepEqual(s, { a: { x: 1 }, b: [1] });
  assert.deepEqual(p, { a: { y: 2 }, b: [2] });
  assert.deepEqual(out, { a: { x: 1, y: 2 }, b: [2] });
});

test("subscribers get (state, patch) synchronously, unsubscribe works", () => {
  const st = createStore({ n: 0 });
  const seen = [];
  const off = st.subscribe((s, patch) => seen.push([s.n, patch]));
  st.set({ n: 1 });
  st.set({ n: 2 });
  off();
  st.set({ n: 3 });
  assert.deepEqual(seen, [[1, { n: 1 }], [2, { n: 2 }]]);
});

test("no bigint outside lab.events and lab.result", () => {
  const st = createStore(defaultState());
  assert.throws(() => st.set({ view: { x: 5n } }), { code: "bigint_in_store" });
  assert.throws(() => st.set({ lab: { input: { shape: [[0n, 0]] } } }), { code: "bigint_in_store" });
  assert.throws(() => st.set({ other: [1, [2, 3n]] }), { code: "bigint_in_store" });
  st.set({ lab: { events: [{ type: "row", c: 12345678901234567890n }], result: { x0: 7n } } });
  assert.equal(st.get().lab.result.x0, 7n);
  // the default view is the home view (0, 0) of the site
  assert.equal(st.get().view.x, "0", "the failed sets changed nothing");
  assert.throws(() => st.set([1]), { code: "bad_patch" });
});

test("isPlainObject and the default state", () => {
  assert.ok(isPlainObject({}));
  assert.ok(isPlainObject(Object.create(null)));
  assert.ok(!isPlainObject([]));
  assert.ok(!isPlainObject(new Map()));
  assert.ok(!isPlainObject(null));
  const d = defaultState();
  assert.deepEqual(Object.keys(d).sort(), ["editor", "lab", "prefs", "selection", "view"]);
  assert.deepEqual(Object.keys(d.lab).sort(), ["events", "input", "mode", "result", "stamp", "status", "step", "sub"]);
  assert.equal(d.selection, null, "no region is selected at the start");
  assert.deepEqual([d.editor.stamp, d.lab.stamp], [0, 0]);
  assert.equal(typeof d.view.x, "string");
  assert.notEqual(defaultState().lab, d.lab, "fresh objects on every call");
});
