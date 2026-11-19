// The fix worker of the shape editor: the search of src/core/shape_fix.mjs off the main thread, so that a large shape
// never stops the page (a blue search over many class choices can take a second). The editor sends one job at a time
// and terminates the worker when its shape changes during a search (it then makes a new one).
//
// Message in:   { id, cells, colour }       cells a list of [i, j], colour 1, -1 or 0
// Messages out: { id, fix, ms }              fix = fixOf(cells, colour), ms the time of the search
//               { id, error: { code, message } }
//
// The same functions run in Node (the tests call handleMessage with their own post function).

import { fixShape } from "../../core/shape_fix.mjs";

// Class choices the fix may search for a blue shape (the default of fixShape for the other two types): the blue search
// grows fastest with the shape, and a blue fix is not exact at any bound.
export const BLUE_MAX_CHOICES = 2000;

// fixOf(cells, colour) is fixShape(cells, colour) with the editor's bounds (BLUE_MAX_CHOICES for blue).
export function fixOf(cells, colour) {
  return fixShape(cells, colour, colour === 0 ? { maxChoices: BLUE_MAX_CHOICES } : {});
}

// handleMessage(data, post) answers one job with post(message).
export function handleMessage(data, post) {
  const id = data ? data.id : null;
  try {
    const t0 = performance.now();
    const fix = fixOf(data.cells, data.colour);
    post({ id, fix, ms: performance.now() - t0 });
  } catch (e) {
    post({ id, error: { code: (e && e.code) || "error", message: String((e && e.message) || e) } });
  }
}

// Inside a dedicated worker: answer the editor's messages.
const inWorker = typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope;
if (inWorker) {
  self.onmessage = (e) => handleMessage(e.data, (m) => self.postMessage(m));
}
