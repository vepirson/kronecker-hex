// The two tables of a construction (src/ui/pages/lab/import_tables.mjs): parse and format round trip, the accepted
// spellings (commas or white space, header lines, blank lines, the whole text in one box, the index of d), export
// then import gives the same x0, d0, shape and colour for the six shipped tokens, S_3 and C_10 in both colours, and
// damaged tables are rejected with a code.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { runToEnd } from "../../src/construct/pipeline.mjs";
import { openToken } from "../../src/formats/token.mjs";
import { shapeS, seedS } from "../../src/core/shapes.mjs";
import * as T from "../../src/ui/pages/lab/import_tables.mjs";

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), "utf8"));
const tokens = readJson("../../data/tokens.json");
const c10 = readJson("../../data/shapes/c10.json");

const g100 = () => runToEnd({ replay: openToken(tokens.genus100_green).data }).result;

test("parse and format round trip of the genus-100 green tables", () => {
  const res = g100();
  const t = T.formatTables(res.data);
  assert.ok(t.rows.startsWith(`${T.ROWS_HEADER}\n`));
  assert.ok(t.primes.startsWith(`${T.PRIMES_HEADER}\n`));
  assert.equal(t.rows.split("\n").length, 1 + res.rows.length);
  assert.equal(t.primes.split("\n").length, 1 + res.smallPrimes.length);
  const back = T.parseTables(t);
  assert.deepEqual(back.rows, res.data.rows);
  assert.deepEqual(back.smallPrimes, res.data.smallPrimes);
  assert.equal(back.dIndex, res.data.dIndex);
  assert.deepEqual(T.parseTables({ rows: T.tablesText(res.data) }), back);
  // a free d is written "-"
  for (const s of res.data.smallPrimes) assert.ok(t.primes.split("\n").includes(`${s.p}, ${s.xRes}, ${s.dRes === null ? "-" : s.dRes}`));
});

test("spellings: white space or commas, no header, blank lines, CRLF, the index of d as a line or a field", () => {
  const rows = "\r\n 3 , 5 7  11 13 0\r\n\r\n-1\t2\t0\t11\t13\t12345678901234567890123\n";
  const primes = "p x d\n2 3 1\n3, 1, -\n5 4 2\n7 0 -\n";
  const t = T.parseTables({ rows, primes });
  assert.deepEqual(t.rows.map((r) => r.j), [-1, 3]);
  assert.equal(t.rows[0].rho, 12345678901234567890123n);
  assert.deepEqual(t.smallPrimes, [{ p: 2, xRes: 3, dRes: 1 }, { p: 3, xRes: 1, dRes: null }, { p: 5, xRes: 4, dRes: 2 }, { p: 7, xRes: 0, dRes: null }]);
  assert.equal(t.dIndex, 0n);
  assert.equal(T.parseTables({ rows: rows + "d index, 4\n", primes }).dIndex, 4n);
  assert.equal(T.parseTables({ rows: rows + "d index, 4\n", primes, dIndex: " 9 " }).dIndex, 9n);
  const code = (inp) => {
    try {
      T.parseTables(inp);
      return "none";
    } catch (e) {
      return e.code;
    }
  };
  assert.equal(code({ rows: "", primes }), "no_rows");
  assert.equal(code({ rows, primes: "2 3 1\n3 1 -\n7 0 -" }), "missing_prime");
  assert.equal(code({ rows, primes: "2 3 1\n3 1 -\n5 4 2" }), "missing_prime");
  assert.equal(code({ rows, primes: primes + "9 1 -\n" }), "bad_table");
  assert.equal(code({ rows: rows + "4 5\n", primes }), "bad_table");
  assert.equal(code({ rows: rows + "hello 1 2 3 4 5\n", primes }), "bad_table");
  assert.equal(code({ rows: "3 13 0 11 13 0\n", primes }), "out_of_range");
  assert.equal(code({ rows, primes: "2 8 1\n3 1 -\n5 4 2\n7 0 -" }), "out_of_range");
  assert.equal(code({ rows: rows + "3 1 1 11 13 0\n", primes }), "duplicate");
  assert.equal(code({ rows, primes, dIndex: "-1" }), "bad_table");
  assert.equal(code({ rows: "3 5 7 11 13 99999999999999999999 \n", primes }), "none");
  assert.equal(code({ rows: "3 5 7 11 99999999999999999999 0\n", primes }), "out_of_range");
});

const ROUND = [
  ...Object.keys(tokens).map((k) => [k, () => runToEnd({ replay: openToken(tokens[k]).data }).result]),
  ...[1, -1].flatMap((c) => [
    [`S_3 ${c === 1 ? "green" : "red"}`, () => runToEnd({ shape: shapeS(3), seed: seedS(3), colour: c, lift: 1 }).result],
    [`C_10 ${c === 1 ? "green" : "red"}`, () => runToEnd({ shape: c10.shape, seed: c10.seed, colour: c, lift: 1 }).result],
  ]),
];

test("export then import gives the same x0, d0, shape and colour (six tokens, S_3 and C_10 in both colours)", () => {
  for (const [name, mk] of ROUND) {
    const res = mk();
    assert.equal(res.pass, true, name);
    const out = T.importTables(T.formatTables(res.data));
    assert.equal(out.ok, true, `${name}: ${out.code} ${out.message}`);
    assert.equal(out.x0, res.x0, name);
    assert.equal(out.d0, res.d0, name);
    assert.deepEqual(out.data.shape, res.shape, name);
    assert.equal(out.data.colour, res.colour, name);
    assert.equal(out.data.genus, res.genus, name);
    assert.equal(out.result.pass, true, name);
    assert.equal(out.result.sha256.x0, res.sha256.x0, name);
    // the seed is the first cell of the shape in (j, i) order
    assert.deepEqual(out.data.seed, res.shape[0], name);
    // and the whole text in one box
    const whole = T.importTables({ rows: T.tablesText(res.data) });
    assert.equal(whole.ok, true, name);
    assert.equal(whole.x0, res.x0, name);
  }
});

test("damaged tables are rejected with a code: one residue changed, a row prime changed, a small prime missing", () => {
  const res = g100();
  const t = T.formatTables(res.data);
  const row = res.rows.find((r) => r.j === -19);
  const lineOld = `-19, ${row.r1}, ${row.r2}, ${row.q1}, ${row.q2}, ${row.rho}`;
  assert.ok(t.rows.includes(lineOld));
  const r1 = T.importTables({ ...t, rows: t.rows.replace(lineOld, `-19, ${(row.r1 + 1) % row.q1}, ${row.r2}, ${row.q1}, ${row.q2}, ${row.rho}`) });
  assert.equal(r1.ok, false);
  assert.equal(typeof r1.code, "string");
  assert.ok(r1.x0 !== null && r1.d0 !== null, "the rebuilt cell is known (for the link to the Explorer)");
  assert.equal(r1.d0, res.d0);
  assert.notEqual(r1.x0, res.x0);
  const q = T.importTables({ ...t, rows: t.rows.replace(lineOld, `-19, ${row.r1}, ${row.r2}, 71, ${row.q2}, ${row.rho}`) });
  assert.equal(q.ok, false);
  assert.equal(typeof q.code, "string");
  const noFive = T.importTables({ ...t, primes: t.primes.split("\n").filter((l) => !l.startsWith("5,")).join("\n") });
  assert.equal(noFive.ok, false);
  assert.equal(noFive.code, "missing_prime");
  assert.equal(noFive.x0, null);
  const junk = T.importTables({ rows: "1 2 3 4", primes: "" });
  assert.equal(junk.ok, false);
  assert.equal(junk.code, "bad_table");
});

test("the region search: blue cells are skipped, a fill that meets a capped region is not complete", () => {
  const res = g100();
  const s = T.findRegions(res.x0, res.d0, 10, [0], T.FILL_CAP);
  assert.ok(s.regions.length > 0);
  for (const r of s.regions) assert.ok(r.colour === 1 || r.colour === -1);
  const tiny = T.findRegions(res.x0, res.d0, 10, [0], 3);
  assert.ok(tiny.regions.some((r) => !r.complete));
  for (const r of tiny.regions) assert.ok(r.cells.length <= 3);
});
