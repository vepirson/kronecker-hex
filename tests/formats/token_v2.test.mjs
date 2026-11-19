// Token version 2 (blue regions): round trips of the 21 reference constructions, the layout against an independent
// writer of the documented fields, the rejections (every single-character change, a residue equal to p, a wrong
// genus, classes that do not fit the shape), the worked example of docs/formats.md, version 1 unchanged, and the
// shared helper that finds a token in a pasted text.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { runToEnd } from "../../src/construct/index.mjs";
import { decodeToken, openToken, encodeToken, tokenToWitness, tokenInText, BASE64URL_ALPHABET, TOKEN_VERSION_BLUE } from "../../src/formats/token.mjs";
import { verifyWitness } from "../../src/formats/witness.mjs";
import { sha256Bytes, bytesToHex } from "../../src/core/sha256.mjs";
import { primesUpTo } from "../../src/core/primes.mjs";
import { boundingWindow } from "../../src/core/geometry.mjs";
import { CodedError } from "../../src/core/bigint_utils.mjs";
import { tokenInLink as tokenFromText } from "../../src/ui/actions.mjs";
import { classifyPaste } from "../../src/ui/pages/explore.mjs";

const url = (rel) => new URL(rel, import.meta.url);
const readJson = (rel) => JSON.parse(fs.readFileSync(url(rel), "ascii"));
const dir = url("../fixtures/blue_ref/");
const NAMES = fs.readdirSync(dir).filter((f) => f.endsWith(".ref.json")).sort().map((f) => f.replace(".ref.json", ""));
const REFS = Object.fromEntries(NAMES.map((n) => [n, readJson(`../fixtures/blue_ref/${n}.ref.json`)]));
const RESULTS = {};
const resultOf = (name) => {
  if (!RESULTS[name]) RESULTS[name] = runToEnd({ shape: REFS[name].shape, seed: REFS[name].seed, colour: 0 }).result;
  return RESULTS[name];
};
const codeOf = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    if (!(e instanceof CodedError)) throw e;
    return e.code;
  }
};

// An independent writer of the version 2 fields as docs/formats.md lists them: the body as a bit string.
function documentedBits(data, value = (p, k, v) => v) {
  const out = [];
  const u = (v, w) => {
    if (w) out.push(v.toString(2).padStart(w, "0"));
  };
  const g = (n) => {
    const s = n.toString(2);
    out.push("0".repeat(s.length - 1) + s);
  };
  const sg = (n) => g(n >= 0 ? 2 * n + 1 : -2 * n);
  const width = (m) => (m <= 1 ? 0 : (m - 1).toString(2).length);
  u(2, 4);
  u(0, 1);
  g(data.genus + 1);
  g(data.B);
  const box = boundingWindow(data.shape, 0);
  sg(box.imin);
  sg(box.jmin);
  const R = box.jmax - box.jmin + 1;
  g(R);
  let plo = 0, phi = 0;
  for (let r = 0; r < R; r++) {
    const ts = data.shape.filter(([, j]) => j === box.jmin + r).map(([i]) => i - box.imin).sort((a, b) => a - b);
    const lo = ts[0], hi = ts[ts.length - 1];
    if (r === 0) {
      g(lo + 1);
      g(hi - lo + 1);
    } else {
      sg(lo - plo);
      sg(hi - phi);
    }
    for (let t = lo + 1; t < hi; t++) out.push(ts.includes(t) ? "1" : "0");
    plo = lo;
    phi = hi;
  }
  g(data.seed[0] - box.imin + 1);
  g(data.seed[1] - box.jmin + 1);
  data.classes.forEach(({ p, xRes, dRes }, k) => {
    u(value(p, k, xRes), width(p));
    u(dRes, width(p));
  });
  let s = out.join("");
  s += "0".repeat((8 - (s.length % 8)) % 8);
  return s;
}

const bitsToBytes = (s) => Uint8Array.from({ length: s.length / 8 }, (_, k) => parseInt(s.slice(8 * k, 8 * k + 8), 2));
function tagged(bodyBytes, x0) {
  const tail = new TextEncoder().encode("|" + x0.toString());
  const buf = new Uint8Array(bodyBytes.length + tail.length);
  buf.set(bodyBytes);
  buf.set(tail, bodyBytes.length);
  const all = new Uint8Array(bodyBytes.length + 4);
  all.set(bodyBytes);
  all.set(sha256Bytes(buf).slice(0, 4), bodyBytes.length);
  return Buffer.from(all).toString("base64url");
}

test("the 21 references round-trip through a version 2 token, with and without id", () => {
  const lengths = {};
  for (const name of NAMES) {
    const ref = REFS[name];
    const r = resultOf(name);
    assert.equal(r.token, encodeToken(r.data, r.x0, { withId: false }));
    const o = openToken(r.token);
    assert.deepEqual(Object.keys(o).sort(), ["d0", "data", "tagHex", "x0"]);
    assert.equal(o.x0.toString(), ref.x0, name);
    assert.equal(o.d0.toString(), ref.d0, name);
    assert.deepEqual(o.data, r.data, name);
    assert.equal(o.data.colour, 0);
    assert.equal(encodeToken(o.data, o.x0), r.token, name);
    assert.match(r.token[0], /[IJKL]/, name);
    const withId = encodeToken({ ...r.data, id: ref.id }, r.x0, { withId: true });
    assert.equal(openToken(withId).data.id, ref.id, name);
    assert.equal(openToken(withId).x0, r.x0, name);
    const w = tokenToWitness(r.token, "w");
    assert.equal(w.colour, 0);
    assert.equal(verifyWitness(w).pass, true, name);
    lengths[name] = r.token.length;
  }
  assert.equal(lengths.t6, 15);
  assert.equal(lengths.z10, 42);
  assert.equal(lengths.hex18, 218);
});

test("the encoder writes exactly the documented fields", () => {
  for (const name of NAMES) {
    const r = resultOf(name);
    const dec = decodeToken(r.token);
    const bits = [...dec.body].map((b) => b.toString(2).padStart(8, "0")).join("");
    assert.equal(bits, documentedBits(r.data), name);
  }
});

test("a re-tagged token with a residue equal to p is out of range", () => {
  for (const name of ["z03", "t6", "rnd02"]) {
    const r = resultOf(name);
    const k3 = r.data.classes.findIndex((c) => c.p === 3);
    const body = bitsToBytes(documentedBits(r.data, (p, k, v) => (k === k3 ? 3 : v)));
    const tok = tagged(body, r.x0);
    assert.equal(codeOf(() => decodeToken(tok)), "out_of_range", name);
    assert.equal(codeOf(() => openToken(tok)), "out_of_range", name);
    // the same writer with the true residue gives the true token
    assert.equal(tagged(bitsToBytes(documentedBits(r.data)), r.x0), r.token, name);
  }
});

test("a wrong genus, a wrong B and a class holding a neighbour are rejected", () => {
  const r = resultOf("z03");
  assert.equal(codeOf(() => openToken(encodeToken({ ...r.data, genus: r.data.genus + 1 }, r.x0))), "bad_format");
  // a stored B that is not the B of the shape (the classes extended to the primes up to B + 1)
  const wrongB ={ ...r.data, B: r.data.B + 1, classes: primesUpTo(r.data.B + 1).map((p) => r.data.classes.find((c) => c.p === p) || { p, xRes: 0, dRes: 0 }) };
  assert.equal(codeOf(() => openToken(encodeToken(wrongB, r.x0))), "replay_mismatch");
  // the class of the neighbour (-1, 0) mod 3
  const bad = { ...r.data, classes: r.data.classes.map((c) => (c.p === 3 ? { p: 3, xRes: 1, dRes: 0 } : c)) };
  assert.equal(codeOf(() => openToken(encodeToken(bad, r.x0))), "replay_mismatch");
  // the encoder refuses what the format cannot hold
  assert.equal(codeOf(() => encodeToken({ ...r.data, classes: r.data.classes.slice(1) }, r.x0)), "bad_format");
  assert.equal(codeOf(() => encodeToken({ ...r.data, classes: r.data.classes.map((c) => (c.p === 5 ? { ...c, xRes: 5 } : c)) }, r.x0)), "out_of_range");
  // a structurally valid token with another x0 in its tag
  assert.equal(codeOf(() => openToken(encodeToken(r.data, r.x0 + 1n))), "tag_mismatch");
});

const nextChar = (c, k) => BASE64URL_ALPHABET[(BASE64URL_ALPHABET.indexOf(c) + k) % 64];

test("every single-character change of a version 2 token is rejected", (t) => {
  let cases = 0, byTag = 0;
  const codes = {};
  for (const name of ["z03", "t6"]) {
    const tok = resultOf(name).token;
    const variants = [];
    for (let k = 0; k < tok.length; k++) for (let s = 1; s < 64; s++) variants.push(tok.slice(0, k) + nextChar(tok[k], s) + tok.slice(k + 1));
    for (let k = 0; k <= tok.length; k++) {
      if (k < tok.length) variants.push(tok.slice(0, k) + tok.slice(k + 1));
      variants.push(tok.slice(0, k) + "A" + tok.slice(k));
    }
    for (const v of variants) {
      if (v === tok) continue;
      cases++;
      const code = codeOf(() => openToken(v));
      assert.notEqual(code, null, `${name}: ${v} was accepted`);
      codes[code] = (codes[code] || 0) + 1;
      if (code === "tag_mismatch") byTag++;
    }
  }
  t.diagnostic(`version 2 mutation: ${cases} cases, all rejected, ${byTag} by the tag, codes ${JSON.stringify(codes)}`);
  assert.ok(cases > 63 * (23 + 15));
});

test("docs/formats.md: the version 2 token example and its bit fields", () => {
  const DOC = fs.readFileSync(url("../../docs/formats.md"), "ascii");
  const block = (name) => {
    const m = new RegExp(`<!-- check:${name} -->\\s*\`\`\`[a-z]*\\n([\\s\\S]*?)\\n\`\`\``).exec(DOC);
    assert.ok(m, name);
    return m[1];
  };
  const r = resultOf("t6");
  const tok = block("token2-example").trim();
  assert.equal(r.token, tok);
  const o = openToken(tok);
  assert.equal(o.x0, 194n);
  assert.equal(o.d0, 174n);
  const dec = decodeToken(tok);
  const bits = [...dec.body].map((b) => b.toString(2).padStart(8, "0")).join("");
  const shown = block("token2-bits").split("\n").map((l) => l.split(/\s+/)[0]).join("");
  assert.equal(shown, bits);
  assert.equal(dec.body.length, 7);
  assert.ok(DOC.includes(`\`${dec.tagHex}\``));
  assert.ok(DOC.includes(`|${o.x0}\``));
  assert.equal(r.privates.length, 0);
  assert.deepEqual(r.classes.map((c) => [c.p, c.a, c.b]), [[2, 0, 0], [3, 1, 0], [5, 1, 1], [7, 2, 1]]);
});

test("version 1 tokens are unchanged: every stored token opens and re-encodes to itself", () => {
  let n = 0;
  for (const rel of ["../../data/tokens.json", "../fixtures/tokens.json"]) {
    const table = readJson(rel);
    for (const [label, tok] of Object.entries(table)) {
      const o = openToken(tok);
      assert.ok(o.rows.length > 0, label);
      assert.notEqual(o.data.colour, 0, label);
      assert.match(tok[0], /[EFGH]/, label);
      assert.equal(encodeToken(o.data, o.x0, { withId: o.data.id !== null }), tok, label);
      n++;
    }
  }
  assert.ok(n >= 12);
  // a version other than 1 and 2
  assert.equal(codeOf(() => decodeToken(Buffer.from([0x30, 0, 0, 0, 0, 0, 0, 0]).toString("base64url"))), "unknown_version");
  assert.equal(TOKEN_VERSION_BLUE, 2);
});

test("the shared helper finds a bare token of 8 characters, in the Lab and in the Explorer", () => {
  assert.equal(tokenInText(" ABCDEFGH "), "ABCDEFGH");
  assert.equal(tokenInText("ABCDEFG"), null);
  assert.equal(tokenInText("ABCD EFGH"), null);
  assert.equal(tokenInText("https://example.org/kronecker-hex/#/lab/w/JPu7vkSXAH5HSdE"), "JPu7vkSXAH5HSdE");
  assert.equal(tokenInText(""), null);
  assert.equal(tokenInText(null), null);
  const t6 = resultOf("t6").token;
  assert.equal(tokenFromText(t6), t6);
  assert.equal(tokenFromText("ABCDEFGH"), "ABCDEFGH");
  assert.deepEqual(classifyPaste("ABCDEFGH"), { kind: "token", text: "ABCDEFGH" });
  assert.deepEqual(classifyPaste(`  ${t6}\n`), { kind: "token", text: t6 });
  assert.equal(classifyPaste("ABCDEFG").kind, "unknown");
});
