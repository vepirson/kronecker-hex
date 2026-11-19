// The entry point of the constructions for the pages and the worker: it picks the construction of the kind of the
// input (blue for colour 0, sign for green and red) and runs it. Every function here works for both kinds.

import { construct, canonicalEvents as canonicalSignEvents } from "./pipeline.mjs";
import { constructBlue, canonicalBlueEvents } from "./blue/pipeline.mjs";
import { collectEvents, postInBatches } from "./events.mjs";
import { kindOf } from "./kind.mjs";

export { kindOf };
export { eventToJSON } from "./events.mjs";
export { runPlace, MAIN_THREAD_CELLS } from "./run_place.mjs";

// constructAny(input, hooks) returns the event generator of the construction of the kind of the input (hooks go to
// the sign construction, see construct in pipeline.mjs). Its return value is the result of that kind, or null after
// an error event.
export function constructAny(input, hooks) {
  return kindOf(input) === "blue" ? constructBlue(input) : construct(input, hooks);
}

// runToEnd(input) runs the construction of either kind to its end and returns { events, result } (result null
// after an error event).
export function runToEnd(input) {
  return collectEvents(constructAny(input));
}

// runBatched(input, post, { maxEvents, maxMs, id }) runs the construction of either kind and hands its events to
// post in batches { id, events }, then { id, finished: true, result } (see postInBatches in events.mjs). Returns the
// result.
export function runBatched(input, post, opts) {
  return postInBatches(constructAny(input), post, opts);
}

// canonicalEvents(events) is the canonical event list of a construction of either kind (the kind is read from its
// start event): canonicalEvents of pipeline.mjs for green and red, canonicalBlueEvents for blue.
export function canonicalEvents(events) {
  const start = events.find((ev) => ev.type === "start");
  return kindOf(start) === "blue" ? canonicalBlueEvents(events) : canonicalSignEvents(events);
}
