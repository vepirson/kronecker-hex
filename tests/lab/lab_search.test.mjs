// The tries of a green or red construction (src/ui/pages/lab/search.mjs): a replay does not try anything, so the
// rejected candidates d0 and the residues R tried are shown for it only once they are known for exactly its result.
// The stored file data/lab_search.json (tools/build_lab_search.mjs) has exactly the presets that replay a stored token,
// and each record equals the tries of a fresh live run, which gives the token's numbers. A live run of the run state
// keeps its tries for the visit, a replay of the same result ends with them, a record of another result is refused.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { runToEnd } from "../../src/construct/index.mjs";
import { buildLabView } from "../../src/construct/lab_view.mjs";
import { openToken } from "../../src/formats/token.mjs";
import { sha256Hex } from "../../src/core/sha256.mjs";
import { shapeS, seedS } from "../../src/core/shapes.mjs";
import { createStore, defaultState } from "../../src/ui/store.mjs";
import { createRunState } from "../../src/ui/pages/lab/run_state.mjs";
import { SIGN, BLUE } from "../../src/ui/pages/lab/kinds.mjs";
import * as search from "../../src/ui/pages/lab/search.mjs";
import * as step4 from "../../src/ui/pages/lab/step4.mjs";
import * as step5 from "../../src/ui/pages/lab/step5.mjs";

const read = (rel) => JSON.parse(fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "ascii"));
const tokens = read("data/tokens.json");
const STORED = read("data/lab_search.json");

test("the stored tries: the format, exactly the presets that replay a stored token, ASCII", () => {
  assert.equal(STORED.format, search.LAB_SEARCH_FORMAT);
  assert.match(STORED.note, /tools\/build_lab_search\.mjs/);
  const labels = search.storedPlans().map((p) => p.tokenLabel);
  assert.deepEqual(labels, ["genus100_green", "genus100_red", "genus0_hexagon_green", "genus0_hexagon_red", "hexagon_genus117_green", "hexagon_genus117_red"]);
  assert.deepEqual(Object.keys(STORED.records), labels);
  assert.match(fs.readFileSync(new URL("../../data/lab_search.json", import.meta.url), "latin1"), /^[\x00-\x7f]*$/);
});

test("every stored record equals the tries of a fresh live run of its preset, which gives the token's x0 and d0", () => {
  for (const plan of search.storedPlans()) {
    const file = read(`data/shapes/${plan.file}`);
    const { events, result } = runToEnd({ shape: file.shape, seed: file.seed, colour: plan.colour, lift: plan.lift, id: null });
    const op = openToken(tokens[plan.tokenLabel]);
    assert.equal(result.sha256.x0, sha256Hex(op.x0.toString()), plan.tokenLabel);
    assert.equal(result.sha256.d0, sha256Hex(op.d0.toString()), plan.tokenLabel);
    const rec = STORED.records[plan.tokenLabel];
    assert.equal(rec.key, search.searchKey(result));
    assert.deepEqual({ candidates: rec.candidates, attempts: rec.attempts }, search.searchRecord(buildLabView(events)), plan.tokenLabel);
  }
});

test("a replay joined with the tries of its result shows the candidates and the residues R of the live run", () => {
  const live = runToEnd({ shape: shapeS(4), seed: seedS(4), colour: 1, lift: 1, id: null });
  const replay = runToEnd({ replay: live.result.data });
  const lv = buildLabView(live.events);
  const rv = buildLabView(replay.events);
  assert.equal(search.isReplay(rv), true);
  assert.equal(search.isReplay(lv), false);
  // a live view is shown as it is, a replay without its tries leaves them out
  assert.equal(search.withSearch(lv, null), lv);
  assert.equal(search.searchKnown(lv), true);
  const bare = search.withSearch(rv, null);
  assert.equal(search.searchKnown(bare), false);
  assert.equal(step5.step5Data(bare, 0).retriedRows, null);
  assert.equal(step5.step5Data(bare, 1).focus.attempts, null);
  // joined: the same candidates (t, digits, reason, state) and the same R tried as the live run
  const joined = search.withSearch(rv, search.searchRecord(lv));
  assert.equal(search.searchKnown(joined), true);
  const strip = (d) => d.candidates.map((c) => [c.index, c.d0Digits, c.rejected, c.state]);
  assert.deepEqual(strip(step4.step4Data(joined, 0)), strip(step4.step4Data(lv, 0)));
  assert.equal(step5.step5Data(joined, 0).retriedRows, step5.step5Data(lv, 0).retriedRows);
  for (let n = 1; n <= step5.subCount(lv); n++) {
    const a = step5.step5Data(joined, n).focus.attempts.map((x) => [String(x.R), x.found]);
    const b = step5.step5Data(lv, n).focus.attempts.map((x) => [String(x.R), x.found]);
    assert.deepEqual(a, b, `row ${n}`);
  }
});

test("the run state: a live run keeps its tries for the visit, a replay of the same result ends with them, another result's are refused", () => {
  const store = createStore(defaultState());
  const r = createRunState({ store, now: () => 0 });
  const input = { shape: shapeS(5), seed: seedS(5), colour: -1, lift: 1, id: null };
  const live = runToEnd(input);
  r.begin(input, "live", "live", {});
  r.events(live.events);
  r.finish(live.result);
  assert.equal(r.state.status, "done");
  assert.deepEqual(r.state.search, search.searchRecord(buildLabView(live.events)));
  const key = search.searchKey(live.result);
  assert.deepEqual(search.recalledSearch(key), r.state.search);
  // the replay of the same result in this visit
  const replay = runToEnd({ replay: live.result.data });
  r.begin({ replay: live.result.data }, "replay", "replay", {});
  assert.equal(r.state.search, null);
  r.events(replay.events);
  r.finish(replay.result);
  assert.deepEqual(r.state.search, search.recalledSearch(key));
  // a record of another result is kept for that result but not shown
  const other = runToEnd({ shape: shapeS(2), seed: seedS(2), colour: 1, lift: 1, id: null });
  const otherKey = search.searchKey(other.result);
  const otherRec = search.searchRecord(buildLabView(other.events));
  assert.equal(r.learnSearch(otherKey, otherRec), false);
  assert.deepEqual(search.recalledSearch(otherKey), otherRec);
  assert.deepEqual(r.state.search, search.recalledSearch(key));
  assert.equal(r.learnSearch(key, null), false);
  // only the green and red kind tries anything
  assert.deepEqual([SIGN.hasTries, BLUE.hasTries], [true, false]);
});
