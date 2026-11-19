// Error paths of the construction: bad input, an inadmissible shape, a row above the cap, no candidate d0, and
// replays of damaged data.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { runToEnd, CAP_K } from "../../src/construct/pipeline.mjs";
import { reglue } from "../../src/construct/inspect.mjs";
import { parsePacked } from "../../src/formats/packed.mjs";
import { CodedError } from "../../src/core/bigint_utils.mjs";

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), "ascii"));
const lastError = (events) => {
  const e = events[events.length - 1];
  assert.equal(e.type, "error");
  return e;
};

test("a 2 x 2 block is inadmissible at p = 2", () => {
  const { events, result } = runToEnd({ shape: [[0, 0], [1, 0], [0, 1], [1, 1]], seed: [0, 0], colour: 1 });
  assert.equal(result, null);
  const e = lastError(events);
  assert.equal(e.code, "inadmissible");
  assert.equal(e.p, 2);
  assert.equal(e.step, 1);
});

test("a row of 49 sign cells stops at the cap", () => {
  const strip = [];
  for (let i = 0; i < 47; i++) strip.push([i, 0]);
  const { events, result } = runToEnd({ shape: strip, seed: [0, 0], colour: -1 });
  assert.equal(result, null);
  const e = lastError(events);
  assert.equal(e.code, "row_cap");
  assert.equal(e.j, 0);
  assert.equal(e.k, 49);
  assert.equal(CAP_K, 47);
  assert.ok(e.k > CAP_K);
  // nothing after step 2 was emitted
  assert.ok(events.every((ev) => ev.step <= 2));
});

test("a replay with one changed r1 is rejected", () => {
  const { data } = parsePacked(readJson("../fixtures/packed_thin/green_s03.packed.json"));
  const rows = data.rows.map((r) => ({ ...r }));
  rows[2].r1 = (rows[2].r1 + 1) % rows[2].q1;
  const { events, result } = runToEnd({ replay: { ...data, rows } });
  if (result === null) {
    const e = lastError(events);
    assert.equal(e.code, "replay_mismatch");
    assert.equal(e.j, rows[2].j);
  } else {
    assert.equal(result.pass, false);
  }
});

test("other replay mismatches", () => {
  const { data } = parsePacked(readJson("../fixtures/packed_thin/green_s05.packed.json"));
  const code = (replay) => {
    const { events, result } = runToEnd({ replay });
    assert.equal(result, null);
    return lastError(events).code;
  };
  // a row prime that is not prime
  assert.equal(code({ ...data, rows: data.rows.map((r, k) => (k === 0 ? { ...r, q1: r.q1 * 3 } : r)) }), "replay_mismatch");
  // a missing row
  assert.equal(code({ ...data, rows: data.rows.slice(1) }), "replay_mismatch");
  // a wrong B
  assert.equal(code({ ...data, B: data.B + 1 }), "replay_mismatch");
  // a candidate index that gives another d0
  assert.equal(code({ ...data, dIndex: data.dIndex + 1n }), "replay_mismatch");
  // a class that contains a cell of the shape: the class of the cell (1, 0) mod 3
  const sp = data.smallPrimes.map((s) => (s.p === 3 ? { p: 3, xRes: 2, dRes: 0 } : s));
  assert.equal(code({ ...data, smallPrimes: sp }), "replay_mismatch");
});

test("bad input and no candidate d0", () => {
  const S3 = parsePacked(readJson("../fixtures/packed_thin/green_s09.packed.json")).data;
  const bad = (input) => {
    const { events, result } = runToEnd(input);
    assert.equal(result, null);
    assert.equal(events.length, 1);
    const e = lastError(events);
    assert.equal(e.step, 0);
    return e.code;
  };
  assert.equal(bad(null), "bad_input");
  // colour 0 is the blue kind: the runToEnd of pipeline.mjs is the green and red construction only (both kinds run
  // through src/construct/index.mjs)
  assert.equal(bad({ shape: S3.shape, seed: S3.seed, colour: 0 }), "bad_input");
  assert.equal(bad({ shape: S3.shape, seed: S3.seed, colour: 1, lift: 4 }), "bad_input");
  assert.equal(bad({ shape: S3.shape, seed: [50, 50], colour: 1 }), "bad_input");
  assert.equal(bad({ shape: [[0, 0], [5, 5]], seed: [0, 0], colour: 1 }), "bad_input");
  assert.equal(bad({ shape: [[0, 0], [0, 0]], seed: [0, 0], colour: 1 }), "bad_input");
  assert.equal(bad({ shape: S3.shape, seed: S3.seed, colour: 1, maxD0: 0 }), "bad_input");
  // S_9 needs the candidate t = 3: with at most 3 candidates there is none
  const { events, result } = runToEnd({ shape: S3.shape, seed: S3.seed, colour: 1, maxD0: 3 });
  assert.equal(result, null);
  assert.equal(lastError(events).code, "no_d0");
  assert.equal(events.filter((e) => e.type === "dRejected").length, 3);
  const ok = runToEnd({ shape: S3.shape, seed: S3.seed, colour: 1, maxD0: 4 });
  assert.equal(ok.result.pass, true);
});

test("reglue rejects an unknown row or a residue out of range", () => {
  const { data } = parsePacked(readJson("../fixtures/packed_thin/red_s02.packed.json"));
  const { result } = runToEnd({ replay: data });
  const throwsCode = (fn) => assert.throws(fn, (e) => e instanceof CodedError && e.code === "bad_input");
  throwsCode(() => reglue(result, [{ j: 999, r1: 0 }]));
  throwsCode(() => reglue(result, [{ j: result.rows[0].j, r1: result.rows[0].q1 }]));
  throwsCode(() => reglue(result, [{ j: result.rows[0].j, rho: 1 }]));
  const t = reglue(result, [{ j: result.rows[0].j, rho: result.rows[0].rho + 7n }]);
  assert.equal(t.tampered, true);
  assert.equal(typeof t.pass, "boolean");
});
