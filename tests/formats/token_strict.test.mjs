// The token reader accepts only what the writer writes, and only a connected shape, in both versions: a token whose
// shape origin is moved to the left (the same cells, row 0 and the seed moved to match, tagged again with the same x0)
// is not canonical, and a token whose shape is not connected is refused before anything is rebuilt. Also the opening
// of a long link in the construct worker (its messages).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { runToEnd } from "../../src/construct/index.mjs";
import { buildWindow } from "../../src/construct/window.mjs";
import { chooseClasses } from "../../src/construct/blue/classes.mjs";
import { rebuildBlueIter } from "../../src/construct/blue/steps.mjs";
import { drain } from "../../src/construct/events.mjs";
import { decodeToken, openToken, encodeToken } from "../../src/formats/token.mjs";
import { openWithProgress } from "../../src/workers/construct.worker.mjs";
import { sha256Bytes } from "../../src/core/sha256.mjs";
import { shapeZ, seedZ } from "../../src/core/shapes.mjs";
import { genusOfCells, isConnected } from "../../src/core/regions.mjs";
import { compareCells } from "../../src/core/geometry.mjs";
import { CodedError } from "../../src/core/bigint_utils.mjs";

const url = (rel) => new URL(rel, import.meta.url);
const readJson = (rel) => JSON.parse(fs.readFileSync(url(rel), "ascii"));

const errorOf = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    if (!(e instanceof CodedError)) throw e;
    return e;
  }
};

const bitsOf = (bytes) => [...bytes].map((b) => b.toString(2).padStart(8, "0")).join("");
const bytesOf = (s) => Uint8Array.from({ length: s.length / 8 }, (_, k) => parseInt(s.slice(8 * k, 8 * k + 8), 2));
const gBits = (n) => {
  const s = n.toString(2);
  return "0".repeat(s.length - 1) + s;
};
const sgBits = (n) => gBits(n >= 0 ? 2 * n + 1 : -2 * n);

function tagged(body, x0) {
  const tail = new TextEncoder().encode("|" + x0.toString());
  const buf = new Uint8Array(body.length + tail.length);
  buf.set(body);
  buf.set(tail, body.length);
  const all = new Uint8Array(body.length + 4);
  all.set(body);
  all.set(sha256Bytes(buf).slice(0, 4), body.length);
  return Buffer.from(all).toString("base64url");
}

// movedOrigin(token, x0) reads the body of a token with a reader of its own (the fields of docs/formats.md up to the
// seed) and writes it again with the shape origin i0 moved k columns to the left, lo of row 0 and the seed column
// raised by k (the same cells, the same seed), for the smallest k >= 1 that changes the bit length by a multiple of 8
// (so that the padding stays as it was), tagged again with x0. Returns { token, k }.
function movedOrigin(token, x0) {
  const s = bitsOf(decodeToken(token).body);
  let pos = 0;
  const take = (n) => {
    const v = s.slice(pos, pos + n);
    pos += n;
    return v;
  };
  const g = () => {
    const z = s.indexOf("1", pos) - pos;
    take(z);
    return parseInt(take(z + 1), 2);
  };
  const sg = () => {
    const z = g() - 1;
    return z % 2 === 0 ? z / 2 : -(z + 1) / 2;
  };
  const version = parseInt(take(4), 2);
  if (version === 1) take(1);
  if (take(1) === "1") take(7 * g());
  g();
  g();
  const head = s.slice(0, pos);
  const i0 = sg();
  const atJ0 = pos;
  sg();
  const R = g();
  const atLo = pos;
  let lo = g() - 1;
  const atW = pos;
  let hi = lo + g() - 1;
  take(Math.max(hi - lo - 1, 0));
  for (let r = 1; r < R; r++) {
    lo += sg();
    hi += sg();
    take(Math.max(hi - lo - 1, 0));
  }
  const atSeed = pos;
  const si = g();
  const tail = s.slice(pos);
  const lo0 = parseInt(s.slice(atLo, atW).replace(/^0+/, ""), 2);
  for (let k = 1; k < 64; k++) {
    const out = head + sgBits(i0 - k) + s.slice(atJ0, atLo) + gBits(lo0 + k) + s.slice(atW, atSeed) + gBits(si + k) + tail;
    if ((out.length - s.length) % 8 === 0) return { token: tagged(bytesOf(out), x0), k };
  }
  throw new Error("no shift keeps the bit length");
}

test("a token with its shape origin moved to the left is not canonical (versions 1 and 2)", () => {
  const cases = [];
  const stored = readJson("../../data/tokens.json");
  for (const label of ["genus100_green", "genus0_hexagon_red", "hexagon_genus117_green"]) {
    cases.push({ label, token: stored[label], x0: openToken(stored[label]).x0 });
  }
  for (const g of [1, 3]) {
    const r = runToEnd({ shape: shapeZ(g), seed: seedZ(g), colour: 0 }).result;
    cases.push({ label: `Z_${g}`, token: r.token, x0: r.x0 });
  }
  for (const c of cases) {
    const moved = movedOrigin(c.token, c.x0);
    assert.notEqual(moved.token, c.token, c.label);
    const e = errorOf(() => openToken(moved.token));
    assert.ok(e, `${c.label}: the token with the origin moved by ${moved.k} columns opens`);
    assert.equal(e.code, "not_canonical", `${c.label}: ${e.code} ${e.message}`);
    assert.match(e.message, /not written as the writer writes it/, c.label);
    assert.equal(errorOf(() => decodeToken(moved.token)).code, "not_canonical", c.label);
  }
});

// two copies of Z_1, the second moved six columns to the right: they do not touch, every row holds a cell, N(S) is
// admissible, the genus field is 1 - chi
function twoLadders() {
  const z = shapeZ(1);
  const shape = [...z, ...z.map(([i, j]) => [i + 6, j])].sort(compareCells);
  assert.equal(isConnected(shape), false);
  const win = buildWindow(shape);
  const classes = chooseClasses(win).classes.map(({ p, xRes, dRes }) => ({ p, xRes, dRes }));
  const data = { id: null, colour: 0, genus: genusOfCells(shape).genus, B: win.B, seed: seedZ(1), shape, classes };
  return { data, x0: drain(rebuildBlueIter(data)).x0 };
}

test("a version 2 token whose shape is not connected is refused (not_connected)", () => {
  const { data, x0 } = twoLadders();
  const tok = encodeToken(data, x0);
  assert.equal(decodeToken(tok).data.shape.length, 2 * shapeZ(1).length);
  const e = errorOf(() => openToken(tok));
  assert.ok(e, `the token ${tok} of two separate ladders opens`);
  assert.equal(e.code, "not_connected", `${e.code} ${e.message}`);
});

test("the construct worker opens a long link with its steps as progress, then the numbers of openToken or the error", () => {
  const r = runToEnd({ shape: shapeZ(14), seed: seedZ(14), colour: 0 }).result;
  assert.ok(r.area > 100);
  const msgs = [];
  openWithProgress(r.token, (m) => msgs.push(m), 7);
  const last = msgs[msgs.length - 1];
  assert.ok(msgs.every((m) => m.id === 7));
  const steps = msgs.filter((m) => m.progress).map((m) => m.progress.step);
  assert.deepEqual([...new Set(steps)], [0, 1, 2, 3, 4]);
  assert.equal(last.finished, true);
  assert.equal(last.opened.x0, r.x0);
  assert.equal(last.opened.d0, r.d0);
  assert.deepEqual(last.opened, openToken(r.token));
  const bad = [];
  openWithProgress(encodeToken(r.data, r.x0 + 1n), (m) => bad.push(m), 8);
  assert.deepEqual(bad[bad.length - 1].error.code, "tag_mismatch");
  assert.equal(bad[bad.length - 1].finished, true);
  const cut = [];
  openWithProgress(r.token.slice(0, 20), (m) => cut.push(m), 9);
  assert.equal(cut.length, 1);
  assert.ok(cut[0].finished && cut[0].error.code);
});

test("a version 1 token whose shape is not connected is refused (not_connected)", () => {
  const stored = readJson("../../data/tokens.json");
  for (const label of ["genus100_green", "hexagon_genus117_red"]) {
    const o = openToken(stored[label]);
    const imax = Math.max(...o.data.shape.map(([i]) => i));
    const jmin = Math.min(...o.data.shape.map(([, j]) => j));
    // one more cell far to the right of the lowest row: the rows stay non-empty, the shape is no longer connected
    const shape = [...o.data.shape, [imax + 5, jmin]];
    const tok = encodeToken({ ...o.data, shape, genus: genusOfCells(shape).genus }, o.x0, { withId: o.data.id !== null });
    const e = errorOf(() => openToken(tok));
    assert.ok(e, `${label}: the token with a separate cell opens`);
    assert.equal(e.code, "not_connected", `${label}: ${e.code} ${e.message}`);
  }
});
