// The tries of a green or red construction: the candidates d0 = D + t M_d that were rejected before the accepted one
// (with the reason and the row), and the residues R tried in each row of the accepted candidate. They are part of the
// example (the answer: "If there is no match, try another R or d"), but a replay reads the accepted choices from its
// data and does not try anything, so its view lacks them. A replay shows them only when they are known for exactly
// its result (the same x0 and d0, so the same deterministic construction): from a live run of this visit (the memory
// below), from the stored file data/lab_search.json (the presets that replay a stored token, written by
// tools/build_lab_search.mjs), or from a live run in the background. Until then the panels leave those lines out.
//
// A record is plain JSON: { candidates: [{ index (t, decimal), d0 (decimal), rejected: { reason, j } | null }],
// attempts: { "<j>": [{ R (decimal), found }] } }.

import { LAB_PRESETS, resolveSignPreset, colourWord } from "./model.mjs";

// storedPlans() is the list of the plans of the presets that replay a stored token, in the order of the presets and
// the region types +1, -1 (the keys of data/lab_search.json are their token labels).
export function storedPlans() {
  return LAB_PRESETS.flatMap((p) => [1, -1].map((c) => resolveSignPreset(p.name, colourWord(c), "replay"))).filter((plan) => plan && plan.tokenLabel);
}

// The format name of data/lab_search.json.
export const LAB_SEARCH_FORMAT = "lab_search_v1";

// The URL of the stored records of the presets.
export const LAB_SEARCH_URL = new URL("../../../../data/lab_search.json", import.meta.url);

// searchKey(result) names the result of a construction by the sha256 of x0 and d0: "<sha x0>|<sha d0>".
export function searchKey(result) {
  return `${result.sha256.x0}|${result.sha256.d0}`;
}

// searchRecord(view) is the record of the tries of a finished live view (buildLabView of a live run).
export function searchRecord(view) {
  return {
    candidates: view.candidates.map((c) => ({ index: String(c.index), d0: String(c.d0), rejected: c.rejected ? { reason: c.rejected.reason, j: c.rejected.j } : null })),
    attempts: Object.fromEntries(view.rows.map((r) => [String(r.j), r.attempts.map((a) => ({ R: String(a.R), found: a.found }))])),
  };
}

// isReplay(view) is true for the view of a replay (its tries are not in its events).
export function isReplay(view) {
  return !!(view && view.start && view.start.mode === "replay");
}

// searchKnown(view) is true when the tries shown with the view are those of its result: always for a live view, for
// a replay only once a record was joined to it (withSearch).
export function searchKnown(view) {
  return !isReplay(view) || view.searched === true;
}

// withSearch(view, record) is the view the panels show: a live view as it is, a replay with the candidates and the
// attempts of the record (searched: true), or the replay itself while no record is known (searched: false).
export function withSearch(view, record) {
  if (!isReplay(view)) return view;
  if (!record) return { ...view, searched: false };
  return {
    ...view,
    searched: true,
    candidates: record.candidates.map((c) => ({ index: BigInt(c.index), d0: BigInt(c.d0), rejected: c.rejected })),
    rows: view.rows.map((r) => {
      const a = record.attempts[String(r.j)];
      return a ? { ...r, attempts: a.map((x) => ({ R: BigInt(x.R), found: x.found })) } : r;
    }),
  };
}

// The records of the results computed live in this visit, by searchKey (kept across a leave and a return).
const memory = new Map();

// rememberSearch(key, record) keeps the record of a result, recalledSearch(key) gives it back (or null).
export function rememberSearch(key, record) {
  memory.set(key, record);
}
export function recalledSearch(key) {
  return memory.get(key) || null;
}
