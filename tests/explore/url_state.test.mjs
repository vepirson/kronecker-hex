// Tests of the pure parts of the Explorer page: the address state (encode and decode with bigint strings, the
// 2000-digit rule), the reading of typed and pasted input, and no link to another viewer.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import * as explore from "../../src/ui/pages/explore.mjs";
import { parseIntegerInput, parseCoordinates, classifyPaste } from "../../src/ui/pages/explore.mjs";
import { viewQuery, readViewQuery, URL_DIGIT_LIMIT, SEL_LIMIT } from "../../src/ui/pages/explore/state.mjs";
import { buildHash, parseHash } from "../../src/ui/router.mjs";
import { CELL_MIN, CELL_MAX } from "../../src/render/hex_canvas.mjs";
import * as galleryModel from "../../src/ui/gallery/model.mjs";

const digits = (n, lead = "7") => lead + "3".repeat(n - 2) + "1";

test("viewQuery writes decimal strings, the rounded zoom and the selection offset", () => {
  const r = viewQuery({ x: -422n, d: "-951", cell: 22.3456, sel: [3, -2] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.query, { x: "-422", d: "-951", z: "22.35", sel: "3,-2" });
  const r2 = viewQuery({ x: "1080", d: "517", cell: 22, sel: null });
  assert.deepEqual(r2.query, { x: "1080", d: "517", z: "22" });
  const r3 = viewQuery({ x: "1", d: "2", cell: 10, sel: [SEL_LIMIT + 1, 0] });
  assert.equal(r3.query.sel, undefined);
  assert.throws(() => viewQuery({ x: "1.5", d: "2", cell: 10 }), (e) => e.code === "bad_integer");
});

test("address round trip keeps bigint coordinates exact (address text, then parse)", () => {
  const cases = [
    { x: 1080n, d: 517n, cell: 22, sel: [1, 2] },
    { x: -(10n ** 1999n) - 7n, d: 10n ** 1500n + 3n, cell: 4, sel: [-5, 0] },
    { x: BigInt(digits(URL_DIGIT_LIMIT)), d: -BigInt(digits(URL_DIGIT_LIMIT, "9")), cell: 160, sel: null },
    { x: 0n, d: 0n, cell: 9.5, sel: [0, 0] },
  ];
  for (const c of cases) {
    const q = viewQuery(c);
    assert.equal(q.ok, true);
    const hash = buildHash("#/explore", q.query);
    const { path, query } = parseHash(hash);
    assert.equal(path, "#/explore");
    const back = readViewQuery(query);
    assert.equal(back.x, c.x);
    assert.equal(back.d, c.d);
    assert.equal(back.cell, c.cell);
    assert.deepEqual(back.sel, c.sel);
    assert.deepEqual(back.problems, []);
  }
});

test("the 2000-digit rule: 2000 digits go into the address, 2001 do not (the minus sign does not count)", () => {
  const x2000 = "-" + digits(2000);
  const ok = viewQuery({ x: x2000, d: "5", cell: 22 });
  assert.equal(ok.ok, true);
  assert.equal(ok.digits.x, 2000);
  const tooLong = viewQuery({ x: digits(2001), d: "5", cell: 22 });
  assert.deepEqual(tooLong, { ok: false, reason: "too_long", digits: { x: 2001, d: 1 } });
  const dLong = viewQuery({ x: "5", d: "-" + digits(10437), cell: 22 });
  assert.equal(dLong.ok, false);
  assert.equal(dLong.digits.d, 10437);
});

test("readViewQuery: defaults, clamped zoom, bad parts reported and ignored", () => {
  assert.deepEqual(readViewQuery({}), { x: null, d: null, cell: null, sel: null, problems: [] });
  const r = readViewQuery({ x: "12a", d: "3", z: "1000", sel: "1;2" });
  assert.equal(r.x, null);
  assert.equal(r.d, null);
  assert.equal(r.cell, CELL_MAX);
  assert.equal(r.sel, null);
  assert.equal(r.problems.length, 2);
  assert.equal(readViewQuery({ z: "1" }).cell, CELL_MIN);
  assert.equal(readViewQuery({ z: "abc" }).problems.length, 1);
  assert.equal(readViewQuery({ x: "5" }).x, null, "x without d is not a view");
  assert.equal(readViewQuery({ x: " -0012 ", d: "7" }).x, -12n);
});

test("typed and pasted integers: white space and a leading plus are ignored, x,d in one field", () => {
  assert.equal(parseIntegerInput("  -123 456\n789 "), -123456789n);
  assert.equal(parseIntegerInput("+42"), 42n);
  assert.equal(parseIntegerInput("4.2"), null);
  assert.equal(parseIntegerInput("1e9"), null);
  assert.equal(parseIntegerInput(""), null);
  const big = digits(12000);
  assert.equal(parseIntegerInput(` ${big} `), BigInt(big));
  assert.deepEqual(parseCoordinates("1080, 517", "ignored"), { x: 1080n, d: 517n });
  assert.deepEqual(parseCoordinates("-2500", "24990001"), { x: -2500n, d: 24990001n });
  assert.ok(parseCoordinates("x", "1").error);
});

test("the Explorer's details link to no other viewer: the helper of that link is gone from every module", () => {
  for (const name of ["authorViewerLink", "authorViewerHref", "AUTHOR_VIEWER_LIMIT"]) {
    assert.equal(name in explore, false, name);
    assert.equal(name in galleryModel, false, name);
  }
  for (const rel of ["src/ui/pages/explore.mjs", "src/ui/gallery/model.mjs", "src/ui/pages/explore/state.mjs"]) {
    const src = fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
    assert.equal(/ai-me\.fr|alternative website|authorViewer/.test(src), false, rel);
  }
});

test("classifyPaste tells JSON, tokens and links apart", () => {
  assert.equal(classifyPaste('  {"format": "x"} ').kind, "json");
  assert.deepEqual(classifyPaste(" GAygnBICQEpR38Noo "), { kind: "token", text: "GAygnBICQEpR38Noo" });
  assert.deepEqual(classifyPaste("https://example.org/kronecker-hex/#/w/GAygnBICQEpR38Noo"), { kind: "token", text: "GAygnBICQEpR38Noo" });
  // the Algorithm page's link, and its old address
  assert.deepEqual(classifyPaste("https://example.org/kronecker-hex/#/algorithm/w/EAygnBICQEpR"), { kind: "token", text: "EAygnBICQEpR" });
  assert.deepEqual(classifyPaste("#/lab/w/EAygnBICQEpR"), { kind: "token", text: "EAygnBICQEpR" });
  assert.equal(classifyPaste("hello world").kind, "unknown");
  assert.deepEqual(classifyPaste("JPu7vkSX"), { kind: "token", text: "JPu7vkSX" });
  assert.equal(classifyPaste("JPu7vkS").kind, "unknown");
});
