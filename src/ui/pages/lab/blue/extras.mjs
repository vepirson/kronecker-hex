// Extras of the blue Construction Lab: the hover line. Hovering a window cell shows in one fixed line over the canvas
// why it has its region type, by blueCellFacts of the construction: the class prime or the private prime that divides
// both coordinates of a cell of S, or "coprime" for a neighbour. The line is the one of ../toolbar.mjs, shared with the
// green and red extras. There is no tool button for blue.

import { blueCellFacts } from "../../../../construct/blue/inspect.mjs";
import { mountToolbar } from "../toolbar.mjs";

// factsLine(f) is the text of the hover line for an output f of blueCellFacts ("" for null).
export function factsLine(f) {
  if (!f) return "";
  if (f.kind === "class") return `region type 0: the class prime ${f.prime} divides x and d`;
  if (f.kind === "private") return `region type 0: its own prime ${f.prime} divides x and d`;
  return "neighbour: x and d coprime, region type +1 or -1";
}

// The state of the mounted extras, read by the browser checks through testHandles().
let live = null;

// testHandles() returns { open (always null: no popover), hover ({ i, j, text, kind, prime } of the last hovered cell
// or null) }, or null when no blue extras are mounted.
export function testHandles() {
  return live ? live() : null;
}

// The hover line of the blue toolbar: which prime gives a cell region type 0.
const PRIMES_HOVER = Object.freeze({
  none: Object.freeze({ kind: null, prime: null }),
  describe(r, [i, j]) {
    const f = blueCellFacts(r, i, j);
    return {
      text: factsLine(f),
      record: { kind: f ? f.kind : null, prime: f ? f.prime : null },
      data: { kind: f ? f.kind : "", prime: f && f.prime !== null ? String(f.prime) : "" },
    };
  },
});

// mountExtras(toolbar, kit, { canvasBox }) mounts the hover line (mountToolbar of ../toolbar.mjs, no button) and
// returns unmount(). canvasBox: the box of the canvas (the hover line is drawn over its top left corner).
export function mountExtras(toolbar, kit, opts = {}) {
  const tb = mountToolbar(toolbar, kit, { canvasBox: opts.canvasBox || null, hover: PRIMES_HOVER, tools: [] });
  live = () => tb.state();
  return () => {
    tb.unmount();
    live = null;
  };
}
