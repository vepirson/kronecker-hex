// The view controls of the site (src/ui/widgets/view_controls.mjs): the keys they take, the text fields where they
// never act, their tooltips, and the one zoom step of the hex view that the buttons, the page keys and the canvas's own
// keys + and - all use.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHexView, staticSource, ZOOM_STEP } from "../../src/render/hex_canvas.mjs";
import { viewKeyAction, inTextField, ZOOM_IN_LABEL, ZOOM_OUT_LABEL, FIT_LABEL } from "../../src/ui/widgets/view_controls.mjs";

globalThis.requestAnimationFrame = () => 1; // no frame is drawn: the zoom arithmetic does not need one
globalThis.cancelAnimationFrame = () => {};

function fakeCanvas() {
  const listeners = {};
  const attrs = {};
  const ctx = new Proxy({}, { get: () => () => {} });
  return {
    width: 0, height: 0, clientWidth: 400, clientHeight: 300, style: {}, attrs,
    getContext: () => ctx,
    addEventListener(t, f) {
      (listeners[t] = listeners[t] || []).push(f);
    },
    removeEventListener(t, f) {
      listeners[t] = (listeners[t] || []).filter((g) => g !== f);
    },
    hasAttribute: (k) => k in attrs,
    setAttribute(k, v) {
      attrs[k] = String(v);
    },
    removeAttribute(k) {
      delete attrs[k];
    },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    key(key) {
      const e = { key, defaultPrevented: false, preventDefault() {
        e.defaultPrevented = true;
      } };
      for (const f of listeners.keydown || []) f(e);
      return e;
    },
  };
}

const key = (k, extra = {}) => ({ key: k, defaultPrevented: false, ctrlKey: false, metaKey: false, altKey: false, ...extra });

test("the view keys: + and = zoom in, - and _ zoom out, f fits, 0 goes home, nothing with Ctrl, Alt, Cmd or a used key", () => {
  assert.deepEqual(["+", "=", "-", "_", "f", "F", "0"].map((k) => viewKeyAction(key(k))), ["in", "in", "out", "out", "fit", "fit", "home"]);
  assert.equal(viewKeyAction(key("r")), null);
  assert.equal(viewKeyAction(key("Escape")), null);
  assert.equal(viewKeyAction(key("+", { ctrlKey: true })), null);
  assert.equal(viewKeyAction(key("f", { metaKey: true })), null);
  assert.equal(viewKeyAction(key("-", { altKey: true })), null);
  // the canvas's own key handler used the key already: the page handler leaves it
  assert.equal(viewKeyAction(key("+", { defaultPrevented: true })), null);
});

test("the view keys never act in a text field: text inputs, textareas, selects, editable elements", () => {
  const el = (tagName, extra = {}) => ({ tagName, ...extra });
  assert.equal(inTextField(el("INPUT", { type: "text" })), true);
  assert.equal(inTextField(el("INPUT", { type: "number" })), true);
  assert.equal(inTextField(el("TEXTAREA")), true);
  assert.equal(inTextField(el("SELECT")), true);
  assert.equal(inTextField(el("DIV", { isContentEditable: true })), true);
  assert.equal(inTextField(el("INPUT", { type: "file" })), false);
  assert.equal(inTextField(el("BUTTON")), false);
  assert.equal(inTextField(el("CANVAS")), false);
  assert.equal(inTextField(null), false);
});

test("the tooltips of the three view buttons name the action and its key in brackets, the same on every page", () => {
  assert.equal(ZOOM_IN_LABEL, "Zoom in (+)");
  assert.equal(ZOOM_OUT_LABEL, "Zoom out (-)");
  assert.equal(FIT_LABEL, "Fit (F)");
});

test("one zoom step: the canvas's key + and view.zoomStep(1) give the same cell size, ZOOM_STEP 1.25, and - undoes it", () => {
  assert.equal(ZOOM_STEP, 1.25);
  const a = createHexView(fakeCanvas(), { source: staticSource(() => 1), cell: 20 });
  const ca = fakeCanvas();
  const b = createHexView(ca, { source: staticSource(() => 1), cell: 20 });
  a.zoomStep(1);
  const e = ca.key("+");
  assert.equal(e.defaultPrevented, true);
  assert.equal(a.getView().cell, b.getView().cell);
  assert.equal(a.getView().cell, 20 * ZOOM_STEP);
  a.zoomStep(-1);
  ca.key("-");
  assert.equal(a.getView().cell, b.getView().cell);
  assert.ok(Math.abs(a.getView().cell - 20) < 1e-9);
  a.destroy();
  b.destroy();
});
