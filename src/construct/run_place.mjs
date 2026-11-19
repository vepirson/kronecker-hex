// The one rule that decides where a page runs a construction, a replay or the opening of a link: on the main thread
// when it is short, in the construct worker otherwise, so that a page never stops answering for long. The Lab, the
// Explorer and the shape editor's Build all ask runPlace.

import { kindOf } from "./kind.mjs";

// A blue construction or replay runs on the main thread up to this many cells of its shape, in the worker above.
// (Its cost grows with the shape: Z_320 with 2243 cells takes about 1.3 s to rebuild x0 and d0 and 4 s with the
// final check in Node on the development machine.)
export const MAIN_THREAD_CELLS = 100;

// runPlace(input) is "main" or "worker" for a construction input of either kind: a live input { shape, colour, ... }
// or a replay { replay: data } (also the opening of a token: { replay: data } of its decoded data).
//   blue (live or replay): "main" up to MAIN_THREAD_CELLS cells of the shape, else "worker",
//   green or red, replay: "main" (a replay solves no row, a stored region of 656 cells replays in about 50 ms),
//   green or red, live: "worker" (the row solve of a long row can take long).
// A page may run a live green or red shape on the main thread when it knows the shape is thin (the Lab's S_g and its
// shipped C_10, see the presets of the Lab).
export function runPlace(input) {
  const src = input && input.replay ? input.replay : input;
  if (kindOf(input) === "blue") {
    return src && Array.isArray(src.shape) && src.shape.length <= MAIN_THREAD_CELLS ? "main" : "worker";
  }
  return input && input.replay ? "main" : "worker";
}
