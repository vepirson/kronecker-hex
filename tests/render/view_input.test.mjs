// Click versus drag in the interactive view, on a fake canvas (the view's own pointer listeners are called with
// pointer events): movement under CLICK_SLOP = 5 pixels is a click, 5 pixels or more is a drag (no click, the canvas
// carries data-dragging while it lasts). Also the soft switch of the view.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHexView, staticSource, CLICK_SLOP } from "../../src/render/hex_canvas.mjs";

globalThis.requestAnimationFrame = () => 1; // no frame is drawn: the input logic does not need one
globalThis.cancelAnimationFrame = () => {};

function fakeCanvas() {
  const listeners = {};
  const attrs = {};
  const ctx = new Proxy({}, { get: () => () => {} });
  return {
    width: 0,
    height: 0,
    clientWidth: 400,
    clientHeight: 300,
    style: {},
    attrs,
    getContext: () => ctx,
    addEventListener(t, f) {
      (listeners[t] = listeners[t] || []).push(f);
    },
    removeEventListener(t, f) {
      listeners[t] = (listeners[t] || []).filter((g) => g !== f);
    },
    hasAttribute: (k) => k in attrs,
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    setAttribute(k, v) {
      attrs[k] = String(v);
    },
    removeAttribute(k) {
      delete attrs[k];
    },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture() {},
    fire(type, X, Y, extra = {}) {
      const e = { type, pointerType: "mouse", button: 0, pointerId: 1, clientX: X, clientY: Y, preventDefault() {}, ...extra };
      for (const f of listeners[type] || []) f(e);
    },
  };
}

function setup() {
  const canvas = fakeCanvas();
  const view = createHexView(canvas, { source: staticSource(() => 1), cell: 20 });
  const clicks = [];
  view.onCellClick((c) => clicks.push(c));
  return { canvas, view, clicks };
}

test("a press and release with less than 5 px of movement is a click on the cell under the release", () => {
  assert.equal(CLICK_SLOP, 5);
  const { canvas, view, clicks } = setup();
  canvas.fire("pointerdown", 100, 100);
  canvas.fire("pointermove", 103, 102);
  canvas.fire("pointerup", 103, 102);
  assert.deepEqual(clicks, [view.cellAt(103, 102)]);
  // 3 px right and 3 px down: 4.24 px (a drag under the earlier |dx| + |dy| > 4 rule, a click now)
  canvas.fire("pointerdown", 50, 50);
  canvas.fire("pointermove", 53, 53);
  canvas.fire("pointerup", 53, 53);
  assert.equal(clicks.length, 2);
  assert.equal(canvas.attrs["data-dragging"], undefined);
});

test("5 px of movement or more is a drag: no click, data-dragging while it lasts, the view pans", () => {
  const { canvas, view, clicks } = setup();
  const before = view.getView().middle;
  canvas.fire("pointerdown", 100, 100);
  canvas.fire("pointermove", 103, 104); // exactly 5 px
  assert.equal(canvas.attrs["data-dragging"], "true");
  canvas.fire("pointermove", 160, 104);
  canvas.fire("pointerup", 160, 104);
  assert.deepEqual(clicks, []);
  assert.equal(canvas.attrs["data-dragging"], undefined);
  assert.notDeepEqual(view.getView().middle, before);
  // a release 6 px away with no move event in between is not a click either
  canvas.fire("pointerdown", 100, 100);
  canvas.fire("pointerup", 106, 100);
  assert.deepEqual(clicks, []);
  // a cancelled pointer is never a click
  canvas.fire("pointerdown", 100, 100);
  canvas.fire("pointercancel", 100, 100);
  assert.deepEqual(clicks, []);
});

test("the soft switch of the view: option, setSoft, isSoft, getView().soft", () => {
  const canvas = fakeCanvas();
  const v1 = createHexView(canvas, { source: staticSource(() => 0) });
  assert.equal(v1.isSoft(), false, "default false: nothing else changes");
  assert.equal(v1.getView().soft, false);
  v1.setSoft(true);
  assert.equal(v1.isSoft(), true);
  assert.equal(v1.getView().soft, true);
  v1.setSoft("yes");
  assert.equal(v1.isSoft(), false, "only true turns it on");
  const v2 = createHexView(fakeCanvas(), { source: staticSource(() => 0), soft: true });
  assert.equal(v2.isSoft(), true);
  v1.destroy();
  v2.destroy();
});
