// The application store: one state object, merged by set(patch), observed by subscribe(fn).
//
// Merge rule: set(patch) merges the top level, and a patch value that is a plain object is merged one level deep into
// the current value of that key (when the current value is a plain object too), so set({ lab: { input } }) keeps the
// other keys of lab. Arrays and every other value replace the old value.
//
// Keys used by the site: view { x, d (decimal strings), cell (pixels per cell), selection ([i, j] or null) },
// editor { cells, seed, colour, undo, redo (the editor's history), built (the token of the editor's last Build),
// origin { href, cells, colour, stamp } (the Explorer's address that opened the editor on this shape) },
// lab { input, mode, status, events, result, step, sub },
// prefs { palette, theme ("light", "dark", or null while no theme is chosen: the page is light) }.
// gallery { <section id>: { page, colour } } (the page and the region type of each Gallery section, set by that page).
// selection { shape, seed, colour, token, home, stamp } (the region selected last, null in defaultState, the home cell
// in the site's first state, appState of router.mjs: see the selection of src/ui/actions.mjs), editor.stamp and
// lab.stamp (the stamp of the selection that the editor's drawing and the Lab's input came from, 0 for none).
// No bigint is allowed in the store outside lab.events and lab.result (set throws "bigint_in_store").

import { CodedError } from "../core/bigint_utils.mjs";
import { HOME_VIEW } from "./routes.mjs";

// True for an object made by {} or Object.create(null) (not an array, Map, Date, class instance).
export function isPlainObject(v) {
  if (v === null || typeof v !== "object") return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

// mergeState(state, patch) is the pure merge rule of set: a new object, the inputs are not changed.
export function mergeState(state, patch) {
  const out = { ...state };
  for (const [k, v] of Object.entries(patch)) {
    if (isPlainObject(v) && isPlainObject(state[k])) out[k] = { ...state[k], ...v };
    else out[k] = v;
  }
  return out;
}

function findBigint(v, path, depth) {
  if (typeof v === "bigint") return path;
  if (v === null || typeof v !== "object" || depth > 12) return null;
  if (Array.isArray(v)) {
    for (let k = 0; k < v.length; k++) {
      const r = findBigint(v[k], `${path}[${k}]`, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (!isPlainObject(v)) return null;
  for (const [k, x] of Object.entries(v)) {
    if (depth === 1 && path === "lab" && (k === "events" || k === "result")) continue;
    const r = findBigint(x, `${path}.${k}`, depth + 1);
    if (r) return r;
  }
  return null;
}

// The default state of the site (fresh objects on every call). The view is the home view of routes.mjs.
export function defaultState() {
  return {
    view: { x: String(HOME_VIEW.x), d: String(HOME_VIEW.d), cell: HOME_VIEW.cell, selection: null },
    editor: { cells: [], seed: null, colour: 1, undo: [], redo: [], built: null, stamp: 0 },
    lab: { input: null, mode: "replay", status: "idle", events: [], result: null, step: 0, sub: 0, stamp: 0 },
    prefs: { palette: "standard", theme: null },
    selection: null,
  };
}

// createStore(initial) returns { get(), set(patch), subscribe(fn) }. get() returns the current state object (treat it
// as read only). set(patch) applies the merge rule above and then calls every subscriber synchronously with
// (state, patch). subscribe(fn) returns a function that removes fn.
export function createStore(initial = {}) {
  let state = { ...initial };
  const subs = new Set();
  return {
    get() {
      return state;
    },
    set(patch) {
      if (!isPlainObject(patch)) throw new CodedError("bad_patch", "store.set takes a plain object");
      for (const [k, v] of Object.entries(patch)) {
        const where = findBigint(v, k, 1);
        if (where) throw new CodedError("bigint_in_store", `bigint at ${where}: store decimal strings instead`);
      }
      state = mergeState(state, patch);
      for (const fn of [...subs]) fn(state, patch);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
