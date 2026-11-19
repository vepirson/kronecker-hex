// Tests of the three file formats: witnesses, packed files, URL tokens (with the mutation test), and the manifest of
// the copied fixtures and data.
//
// FULL=1 also runs every one of the 63 replacements at every position of one token (26586 cases, a few minutes).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

import { CodedError } from "../../src/core/bigint_utils.mjs";
import { sha256Hex } from "../../src/core/sha256.mjs";
import { shapeS, seedS } from "../../src/core/shapes.mjs";
import { kronecker } from "../../src/core/kronecker.mjs";
import { crt } from "../../src/core/crt.mjs";
import { floodFill, genusOfCells } from "../../src/core/regions.mjs";
import { verifyWitness, makeWitness } from "../../src/formats/witness.mjs";
import { parsePacked, rebuildPacked, checkPackedHashes, formatPacked, packedToWitness, FORMAT_NOTE } from "../../src/formats/packed.mjs";
import {
  decodeToken, openToken, encodeToken, tokenToWitness, base64urlEncode, base64urlDecode, BASE64URL_ALPHABET,
} from "../../src/formats/token.mjs";

const url = (rel) => new URL(rel, import.meta.url);
const readText = (rel) => fs.readFileSync(url(rel), "ascii");
const readJson = (rel) => JSON.parse(readText(rel));
const listJson = (rel) => fs.readdirSync(url(rel)).filter((f) => f.endsWith(".json")).sort();
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof CodedError && e.code === code);

const expected = readJson("../fixtures/expected.json");
const tokens = readJson("../fixtures/tokens.json");
const PACKED = [
  ...listJson("../fixtures/packed/").map((f) => `../fixtures/packed/${f}`),
  ...listJson("../fixtures/packed_thin/").map((f) => `../fixtures/packed_thin/${f}`),
];

// ---------- manifest ----------

test("every fixture and data file matches the manifest", () => {
  const m = readJson("../fixtures/MANIFEST.json");
  assert.ok(m.files.length >= 66);
  for (const e of m.files) {
    const buf = fs.readFileSync(url(`../../${e.path}`));
    assert.equal(buf.length, e.bytes, e.path);
    assert.equal(crypto.createHash("sha256").update(buf).digest("hex"), e.sha256, e.path);
  }
});

// ---------- witnesses ----------

test("the 10 genuine witness fixtures pass, the 8 tampered ones fail for the expected reason", () => {
  const files = listJson("../fixtures/witnesses/");
  const genuine = files.filter((f) => !f.startsWith("tampered_"));
  const tampered = files.filter((f) => f.startsWith("tampered_"));
  assert.equal(genuine.length, 10);
  assert.equal(tampered.length, 8);
  for (const f of genuine) {
    const w = readJson(`../fixtures/witnesses/${f}`);
    assert.equal(w.construction, undefined);
    const v = verifyWitness(w);
    assert.equal(v.pass, true, `${f}: ${v.reasons.join("; ")}`);
    assert.deepEqual(v.warnings, [], f);
  }
  const why = {
    tampered_area: "area", tampered_shape_drop: "region differs", tampered_colour: "colour", tampered_genus: "genus",
    tampered_digits: "digits", tampered_x0: "", tampered_big_x0: "", tampered_format: "format",
  };
  for (const f of tampered) {
    const w = readJson(`../fixtures/witnesses/${f}`);
    const v = verifyWitness(w);
    assert.equal(v.pass, false, f);
    assert.ok(v.reasons.length > 0, f);
    assert.ok(v.reasons.join("; ").includes(why[f.slice(0, -5)]), `${f}: ${v.reasons.join("; ")}`);
  }
});

test("the shipped witnesses pass", () => {
  const files = listJson("../../data/witnesses/");
  assert.equal(files.length, 14);
  for (const f of files) {
    const w = readJson(`../../data/witnesses/${f}`);
    assert.equal(w.construction, undefined, f);
    const v = verifyWitness(w);
    assert.equal(v.pass, true, `${f}: ${v.reasons.join("; ")}`);
  }
});

test("verifyWitness never throws on malformed input, makeWitness fills the derived fields", () => {
  for (const bad of [null, 5, "x", [], {}, { format: "kron_hex_witness_v1", x0: "1", d0: "1" }]) {
    const v = verifyWitness(bad);
    assert.equal(v.pass, false);
    assert.ok(v.reasons.length > 0);
  }
  const ff = readJson("../fixtures/witnesses/green_g004_fixture_known1.json");
  const w = makeWitness({ id: "x", colour: 1, x0: BigInt(ff.x0), d0: ff.d0, seed: ff.seed, shape: ff.shape });
  assert.equal(w.genus, 4);
  assert.equal(w.area, 70);
  assert.deepEqual(w.digits, { x0: 4, d0: 3 });
  assert.equal(verifyWitness(w).pass, true);
  throwsCode(() => makeWitness({ colour: 1, x0: "1.5", d0: "1", seed: [0, 0], shape: [[0, 0]] }), "bad_format");
});

// ---------- packed ----------

test("all 28 packed fixtures parse, rebuild and match their stored sha256 and digit counts", () => {
  assert.equal(PACKED.length, 28);
  let compact = 0, thin = 0;
  for (const rel of PACKED) {
    const text = readText(rel);
    const obj = JSON.parse(text);
    const parsed = parsePacked(obj);
    const { x0, d0, rows } = rebuildPacked(parsed.data);
    checkPackedHashes(parsed, x0, d0);
    const e = expected[obj.id];
    assert.ok(e, rel);
    assert.equal(sha256Hex(x0.toString()), e.sha256.x0, rel);
    assert.equal(sha256Hex(d0.toString()), e.sha256.d0, rel);
    assert.equal(x0.toString().length, e.digits.x0, rel);
    assert.equal(d0.toString().length, e.digits.d0, rel);
    assert.equal(parsed.data.shape.length, e.area, rel);
    assert.equal(parsed.data.genus, e.genus, rel);
    assert.ok(x0 > 0n && d0 > 0n);
    for (const r of rows) assert.equal(r.u * BigInt(r.q1) * BigInt(r.q2) * r.c, d0 + BigInt(r.j), rel);
    // the writer reproduces the file byte for byte
    assert.equal(JSON.stringify(formatPacked(parsed.data, x0, d0)), text.trim(), rel);
    assert.equal(obj.format_note, FORMAT_NOTE);
    const w = packedToWitness(obj);
    assert.equal(w.id, obj.id);
    if (rel.includes("packed_thin")) thin++;
    else compact++;
  }
  assert.equal(compact, 6);
  assert.equal(thin, 22);
});

test("rebuilt packed fixtures are genuine regions (witness verification of a compact and three thin ones)", () => {
  for (const rel of ["../fixtures/packed/green_compact_g100_small.packed.json", "../fixtures/packed_thin/red_s03.packed.json",
    "../fixtures/packed_thin/green_s09.packed.json", "../fixtures/packed_thin/green_strip3.packed.json"]) {
    const w = packedToWitness(readJson(rel), "check");
    const v = verifyWitness(w);
    assert.equal(v.pass, true, `${rel}: ${v.reasons.join("; ")}`);
    assert.deepEqual(v.warnings, []);
  }
  // S_g fixtures hold the standard shapes
  for (let g = 1; g <= 10; g++) {
    const p = parsePacked(readJson(`../fixtures/packed_thin/green_s${String(g).padStart(2, "0")}.packed.json`));
    assert.deepEqual(p.data.shape, shapeS(g));
    assert.deepEqual(p.data.seed, seedS(g));
  }
});

test("the thin fixtures cover rejected d0 candidates", () => {
  assert.equal(parsePacked(readJson("../fixtures/packed_thin/green_s09.packed.json")).data.dIndex, 3n);
  assert.equal(parsePacked(readJson("../fixtures/packed_thin/green_strip3.packed.json")).data.dIndex, 1n);
});

test("packed objects with numbers above 2^53 or other defects are rejected", () => {
  const text = readText("../fixtures/packed/green_compact_g100_small.packed.json");
  const base = JSON.parse(text);
  const clone = () => JSON.parse(text);
  // a rho written as a JSON number above 2^53 (JSON.parse cannot keep it exact): out_of_range
  {
    const o = JSON.parse(text.replace("[19,41,43,15,0,0]", "[19,41,43,15,0,9007199254740993]"));
    throwsCode(() => parsePacked(o), "out_of_range");
  }
  {
    const o = JSON.parse(text.replace('"d0_index":0', '"d0_index":18014398509481984'));
    throwsCode(() => parsePacked(o), "out_of_range");
  }
  // the same values as decimal strings are accepted and stay exact
  {
    const o = clone();
    o.rows[o.rows.length - 1][5] = "9007199254740993";
    const p = parsePacked(o);
    assert.equal(p.data.rows[p.data.rows.length - 1].rho, 9007199254740993n);
    assert.equal(formatPacked(p.data, 1n, 1n).rows[p.data.rows.length - 1][5], "9007199254740993");
  }
  { const o = clone(); o.B = 2 ** 53; throwsCode(() => parsePacked(o), "out_of_range"); }
  { const o = clone(); o.genus = 1.5; throwsCode(() => parsePacked(o), "bad_format"); }
  { const o = clone(); o.genus = 99; throwsCode(() => parsePacked(o), "bad_format"); }
  { const o = clone(); o.area = 540; throwsCode(() => parsePacked(o), "bad_format"); }
  { const o = clone(); o.format = "x"; throwsCode(() => parsePacked(o), "bad_format"); }
  { const o = clone(); o.seed = [100, 100]; throwsCode(() => parsePacked(o), "bad_format"); }
  { const o = clone(); delete o.small_primes["37"]; throwsCode(() => parsePacked(o), "bad_format"); }
  { const o = clone(); o.small_primes["3"] = [3, null]; throwsCode(() => parsePacked(o), "out_of_range"); }
  { const o = clone(); o.rows[0][3] = 67; throwsCode(() => parsePacked(o), "out_of_range"); }
  { const o = clone(); o.rows[0][5] = "-1"; throwsCode(() => parsePacked(o), "bad_format"); }
  { const o = clone(); o.rows.reverse(); throwsCode(() => parsePacked(o), "bad_format"); }
  { const o = clone(); o.window.imin = -20; throwsCode(() => parsePacked(o), "bad_format"); }
  throwsCode(() => parsePacked(null), "bad_format");
  // rebuild and hash defects
  {
    // a row prime 7 <= B is stripped with the small primes, so q1 q2 cannot divide the rest of d0 + j
    const o = readJson("../fixtures/packed_thin/green_s09.packed.json");
    assert.deepEqual(o.rows[1], [0, 67, 71, 5, 0, 0]);
    o.rows[1][1] = 7;
    throwsCode(() => rebuildPacked(parsePacked(o).data), "row_primes_do_not_divide");
  }
  {
    // d0 = 5 and a row j = -5: d0 + j = 0
    const data = {
      id: null, colour: 1, genus: 0, B: 2, seed: [0, 0], shape: [[0, 0]], smallPrimes: [{ p: 2, xRes: 1, dRes: null }],
      dIndex: 0n, rows: [{ j: -5, q1: 3, q2: 5, r1: 1, r2: 1, rho: 0n }],
    };
    throwsCode(() => rebuildPacked(data), "not_positive");
    data.rows.push({ j: -4, q1: 5, q2: 7, r1: 1, r2: 1, rho: 0n });
    throwsCode(() => rebuildPacked(data), "not_coprime");
  }
  {
    const o = clone();
    o.rows[3][3] = (o.rows[3][3] + 1) % o.rows[3][1];
    const p = parsePacked(o);
    const { x0, d0 } = rebuildPacked(p.data);
    throwsCode(() => checkPackedHashes(p, x0, d0), "hash_mismatch");
  }
  {
    const p = parsePacked(clone());
    const { x0, d0 } = rebuildPacked(p.data);
    p.digits.x0 += 1;
    p.sha256 = null;
    throwsCode(() => checkPackedHashes(p, x0, d0), "digits_mismatch");
  }
  {
    const o = JSON.parse(readText("../fixtures/packed_thin/red_strip3.packed.json"));
    o.d0_index = 0;
    // index 0 is the candidate the construction rejected: it must not rebuild to the stored numbers
    let code = null;
    try {
      const p = parsePacked(o);
      const { x0, d0 } = rebuildPacked(p.data);
      checkPackedHashes(p, x0, d0);
    } catch (e) {
      code = e.code;
    }
    assert.ok(["not_positive", "not_coprime", "hash_mismatch"].includes(code), String(code));
  }
  assert.equal(base.id, "green_compact_g100_small");
});

// ---------- tokens ----------

test("the 6 tokens open to the numbers of their packed files, encodeToken reproduces them", () => {
  const ids = Object.keys(tokens).sort();
  assert.equal(ids.length, 6);
  const lengths = ids.map((id) => tokens[id].length).sort((a, b) => a - b);
  assert.deepEqual(lengths, [422, 422, 454, 454, 459, 459]);
  for (const id of ids) {
    const t = tokens[id];
    const opened = openToken(t);
    const parsed = parsePacked(readJson(`../fixtures/packed/${id}.packed.json`));
    const rb = rebuildPacked(parsed.data);
    assert.equal(opened.x0, rb.x0, id);
    assert.equal(opened.d0, rb.d0, id);
    assert.equal(sha256Hex(opened.x0.toString()), expected[id].sha256.x0, id);
    assert.equal(sha256Hex(opened.d0.toString()), expected[id].sha256.d0, id);
    const { id: tokenId, ...restToken } = opened.data;
    const { id: fileId, ...restFile } = parsed.data;
    assert.deepEqual(restToken, restFile, id);
    assert.ok(tokenId === null || tokenId === fileId, id);
    assert.equal(encodeToken(opened.data, opened.x0, { withId: tokenId !== null }), t, id);
    assert.equal(encodeToken(parsed.data, rb.x0, { withId: tokenId !== null }), t, id);
    const w = tokenToWitness(t, "w");
    assert.equal(w.id, "w");
    assert.equal(w.x0, rb.x0.toString());
    // decodeToken alone reads the structure, the tag is reported as hex
    const dec = decodeToken(t);
    assert.equal(dec.tagHex, opened.tagHex);
    assert.match(dec.tagHex, /^[0-9a-f]{8}$/);
  }
});

test("thin fixtures round-trip through the token (single-cell rows included)", () => {
  for (const rel of PACKED) {
    const parsed = parsePacked(readJson(rel));
    const { x0, d0 } = rebuildPacked(parsed.data);
    for (const withId of [false, true]) {
      const t = encodeToken(parsed.data, x0, { withId });
      const o = openToken(t);
      assert.equal(o.x0, x0, rel);
      assert.equal(o.d0, d0, rel);
      assert.deepEqual(o.data, { ...parsed.data, id: withId ? parsed.data.id : null }, rel);
    }
  }
});

test("base64url helpers", () => {
  for (let n = 0; n < 40; n++) {
    const b = new Uint8Array(n).map((_, k) => (k * 97 + n * 31) & 255);
    const s = base64urlEncode(b);
    assert.equal(s, Buffer.from(b).toString("base64url"));
    assert.deepEqual(base64urlDecode(s), b);
  }
  throwsCode(() => base64urlDecode("ab=c"), "bad_alphabet");
  throwsCode(() => base64urlDecode("abcde"), "not_canonical");
  throwsCode(() => base64urlDecode("AB"), "not_canonical");
  throwsCode(() => decodeToken("AAAA"), "truncated");
  throwsCode(() => decodeToken("AAAAAAAAAAA"), "unknown_version");
  assert.equal(BASE64URL_ALPHABET.length, 64);
});

// ---------- the worked examples of docs/formats.md ----------

const DOC = readText("../../docs/formats.md");
function docBlock(name) {
  const m = new RegExp(`<!-- check:${name} -->\\s*\`\`\`[a-z]*\\n([\\s\\S]*?)\\n\`\`\``).exec(DOC);
  assert.ok(m, `block ${name} in docs/formats.md`);
  return m[1];
}

test("docs/formats.md: the witness example", () => {
  const w = JSON.parse(docBlock("witness-example"));
  const v = verifyWitness(w);
  assert.equal(v.pass, true, v.reasons.join("; "));
  const ff = floodFill(-34n, -54n, 1000);
  assert.deepEqual(w, makeWitness({ id: w.id, colour: ff.colour, x0: -34n, d0: -54n, seed: [0, 0], shape: ff.cells }));
  const g = genusOfCells(w.shape);
  const nums = docBlock("witness-chi").match(/-?\d+/g).map(Number);
  assert.deepEqual(nums, [g.vertices, g.edges, g.triangles, g.chi, g.genus]);
});

test("docs/formats.md: the packed example and its numbers", () => {
  const shown = JSON.parse(docBlock("packed-example"));
  const fixture = readJson("../fixtures/packed_thin/red_strip3.packed.json");
  assert.deepEqual({ ...shown, format_note: FORMAT_NOTE }, fixture);
  const p = parsePacked(fixture);
  const dPairs = [];
  for (const { p: q, dRes } of p.data.smallPrimes) if (dRes !== null) dPairs.push([BigInt(dRes), BigInt(q)]);
  for (const r of p.data.rows) dPairs.push([BigInt(-r.j), BigInt(r.q1) * BigInt(r.q2)]);
  const { x: D, M: Md } = crt(dPairs);
  const rb = rebuildPacked(p.data);
  const lines = docBlock("packed-numbers").split("\n");
  const want = [`D = ${D}`, `M_d = ${Md}`, `d0 = ${rb.d0}`, ...rb.rows.map((r) => `row ${r.j}: u = ${r.u}, c = ${r.c}`), `x0 = ${rb.x0}`];
  assert.deepEqual(lines, want);
  const ch = { "-1": "-", "0": "0", "1": "+" };
  for (const line of docBlock("packed-window").split("\n")) {
    const m = /^j = (-?\d+), i = (-?\d+) \.\. (-?\d+): (.*)$/.exec(line);
    assert.ok(m, line);
    const j = BigInt(m[1]);
    const got = [];
    for (let i = Number(m[2]); i <= Number(m[3]); i++) got.push(ch[String(kronecker(rb.x0 + BigInt(i), rb.d0 + j))]);
    assert.equal(got.join(" "), m[4], line);
  }
  const strip = floodFill(rb.x0, rb.d0, 100);
  assert.deepEqual(strip.cells, [[0, 0], [1, 0], [2, 0]]);
  assert.equal(strip.colour, -1);
});

test("docs/formats.md: the token example and its bit fields", () => {
  const p = parsePacked(readJson("../fixtures/packed_thin/red_strip3.packed.json"));
  const rb = rebuildPacked(p.data);
  const tok = docBlock("token-example").trim();
  assert.equal(encodeToken(p.data, rb.x0, { withId: false }), tok);
  const o = openToken(tok);
  assert.equal(o.x0, rb.x0);
  const dec = decodeToken(tok);
  const bits = [...dec.body].map((b) => b.toString(2).padStart(8, "0")).join("");
  const shown = docBlock("token-bits").split("\n").map((l) => l.split(/\s+/)[0]).join("");
  assert.equal(shown, bits);
  assert.equal(dec.body.length, 13);
  assert.ok(DOC.includes(`\`${dec.tagHex}\``));
  assert.ok(DOC.includes(`|${rb.x0}`));
});

// ---------- mutation test ----------

const nextChar = (c, k = 1) => BASE64URL_ALPHABET[(BASE64URL_ALPHABET.indexOf(c) + k) % 64];

function rejection(text) {
  try {
    openToken(text);
    return null;
  } catch (e) {
    if (!(e instanceof CodedError)) throw e;
    return e.code;
  }
}

test("mutation test through openToken: every position replaced by the next character, one dropped, one added", (t) => {
  let cases = 0, byTag = 0, earlier = 0;
  const codes = {};
  for (const id of Object.keys(tokens).sort()) {
    const tok = tokens[id];
    const variants = [];
    for (let k = 0; k < tok.length; k++) variants.push(tok.slice(0, k) + nextChar(tok[k]) + tok.slice(k + 1));
    const mid = tok.length >> 1;
    variants.push(tok.slice(0, mid) + tok.slice(mid + 1));
    variants.push(tok.slice(0, mid) + "A" + tok.slice(mid));
    for (const v of variants) {
      cases++;
      const code = rejection(v);
      assert.notEqual(code, null, `${id}: a changed token was accepted`);
      codes[code] = (codes[code] || 0) + 1;
      if (code === "tag_mismatch") byTag++;
      else earlier++;
    }
  }
  t.diagnostic(`mutation: ${cases} cases, all rejected, ${byTag} by the tag, ${earlier} earlier, codes ${JSON.stringify(codes)}`);
  assert.equal(cases, 422 * 2 + 454 * 2 + 459 * 2 + 12);
});

test("FULL mutation test: all 63 replacements at every position of one token", { skip: process.env.FULL !== "1" }, (t) => {
  const id = "green_compact_g100_small";
  const tok = tokens[id];
  let cases = 0, byTag = 0, earlier = 0, structureOnly = 0;
  const t0 = Date.now();
  const step = Math.max(1, Math.floor(tok.length / 100));
  for (let k = 0; k < tok.length; k++) {
    for (let s = 1; s < 64; s++) {
      cases++;
      const v = tok.slice(0, k) + nextChar(tok[k], s) + tok.slice(k + 1);
      try {
        decodeToken(v);
        structureOnly++;
      } catch (e) {
        if (!(e instanceof CodedError)) throw e;
      }
      const code = rejection(v);
      assert.notEqual(code, null, `${id}: position ${k} shift ${s} accepted`);
      if (code === "tag_mismatch") byTag++;
      else earlier++;
    }
    if (k % step === 0) process.stderr.write(`FULL mutation ${Math.round((100 * (k + 1)) / tok.length)}% ${cases} cases, ${byTag} by the tag, ${earlier} earlier, ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
  }
  t.diagnostic(`FULL mutation: ${cases} cases, all rejected, ${byTag} by the tag, ${earlier} earlier, ` +
    `${structureOnly} pass decodeToken alone, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  assert.equal(cases, 26586);
});
