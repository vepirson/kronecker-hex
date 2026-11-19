// The stored tokens of the Gallery's family cards (FAMILY_TOKENS_FILE, written by tools/build_family_tokens.mjs) and
// the Gallery's memory of a visit (src/ui/gallery/memory.mjs): the data file holds exactly the members of the pages from
// the first stored page on (none of the first page), every token opens to its family shape, seed and type and passes
// its check, the one loader of a family card takes a stored token, else the visit's result, else a live build, and the
// keys and bounds of the kept checks and pictures.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  SECTIONS, PAGE_SIZE, FIRST_STORED_PAGE, FAMILY_TOKENS_FILE, FAMILY_TOKENS_FORMAT, familyShape, familyKey, familyMembers, storedMembers,
} from "../../src/ui/gallery/model.mjs";
import { loadFamilyCard, cardKey, pictureKey, keepPicture, showPicture, memoryStats, keepChecked, checkedOf, PICTURE_LIMIT_BYTES } from "../../src/ui/gallery/memory.mjs";
import { openToken } from "../../src/formats/token.mjs";
import { makeWitness, verifyWitness } from "../../src/formats/witness.mjs";
import { cellKey } from "../../src/core/geometry.mjs";
import { hexDisc } from "../../src/core/shapes.mjs";

const FILE = new URL(`../../${FAMILY_TOKENS_FILE}`, import.meta.url);
const DATA = JSON.parse(fs.readFileSync(FILE, "ascii"));
const FAMILIES = SECTIONS.filter((s) => s.kind === "family");
const sortedKeys = (cells) => cells.map(([i, j]) => cellKey(i, j)).sort((a, b) => a - b);
// the solid hexagons of radius 12 to 50 (type 0): stored when the family C_0^0 had five pages, unused since it keeps its
// first page only (the page never asks for them)
const UNUSED = Array.from({ length: 20 }, (_, k) => `c00:${12 + 2 * k}:0`);
const used = ([key]) => !UNUSED.includes(key);

test("the data file: its format, the first stored page right after the first page, exactly the keys of the members from there on", () => {
  assert.equal(FAMILY_TOKENS_FILE, "data/family_tokens_v2.json");
  assert.equal(DATA.format, FAMILY_TOKENS_FORMAT);
  assert.equal(FIRST_STORED_PAGE, 1);
  assert.equal(DATA.fromPage, FIRST_STORED_PAGE + 1);
  const want = [];
  for (const s of FAMILIES) for (const member of storedMembers(s)) for (const colour of s.colours) want.push(familyKey({ section: s.id, member, colour }));
  assert.deepEqual(Object.keys(DATA.tokens), want.concat(UNUSED), "the keys, in the order of the sections, the member and the types, then the unused ones");
  // genus 6 to 25 of S^{+-1} (two types), S^0, C^{+-1} (two types)
  assert.equal(want.length, 40 + 20 + 40);
  for (const s of FAMILIES) {
    for (const member of familyMembers(s).slice(0, PAGE_SIZE)) for (const colour of s.colours) assert.equal(DATA.tokens[familyKey({ section: s.id, member, colour })], undefined);
  }
  assert.match(fs.readFileSync(FILE, "latin1"), /^[\x00-\x7f]*$/);
});

test("every stored token opens to its family member: shape, seed and region type of its key", () => {
  for (const [key, token] of Object.entries(DATA.tokens)) {
    const [section, g, c] = key.split(":");
    const { shape, seed } = used([key]) ? familyShape(section, Number(g)) : { shape: hexDisc(Number(g)), seed: [0, 0] };
    const o = openToken(token);
    assert.equal(o.data.colour, Number(c), key);
    assert.deepEqual(o.data.seed, seed, key);
    assert.deepEqual(sortedKeys(o.data.shape), sortedKeys(shape), key);
  }
});

test("every stored token the page uses: its region passes its check (verifyWitness)", () => {
  const t0 = Date.now();
  for (const [key, token] of Object.entries(DATA.tokens).filter(used)) {
    const o = openToken(token);
    const w = makeWitness({ id: null, colour: o.data.colour, x0: o.x0, d0: o.d0, seed: o.data.seed, shape: o.data.shape });
    const v = verifyWitness(w);
    assert.equal(v.pass, true, `${key}: ${v.reasons}`);
  }
  console.log(`checked ${Object.entries(DATA.tokens).filter(used).length} stored regions in ${Date.now() - t0} ms`);
});

test("the loader of a family card: a stored token first, else the result of this visit, else a live build kept for the visit", async () => {
  let builds = 0;
  const build = async (input) => {
    builds++;
    return { x0: 7n, d0: 11n, witness: { shape: input.shape }, token: "BUILT" };
  };
  const open = (token) => ({ x0: 1n, d0: 2n, witness: { token } });
  const card = { kind: "family", section: "s", member: 7, colour: -1 };
  const key = familyKey(card);
  const stored = { tokens: { [key]: DATA.tokens[key] } };
  const a = await loadFamilyCard(card, { stored, open, build });
  assert.equal(a.from, "stored");
  assert.equal(a.token, DATA.tokens[key]);
  assert.equal(builds, 0);
  // the page opens a stored token in a worker: an opener that returns a promise gives the same record
  const later = await loadFamilyCard(card, { stored, open: async (token) => open(token), build });
  assert.deepEqual(later, a);
  // the same key removed from the data: a live build, then the visit's result
  const b = await loadFamilyCard(card, { stored: { tokens: {} }, open, build });
  assert.equal(b.from, "built");
  assert.equal(builds, 1);
  const c = await loadFamilyCard(card, { stored: { tokens: {} }, open, build });
  assert.equal(c.from, "visit");
  assert.equal(c.token, "BUILT");
  assert.equal(builds, 1, "no second build");
  // no data at all behaves as a missing key
  const d = await loadFamilyCard({ ...card, member: 2 }, { stored: null, open, build });
  assert.equal(d.from, "built");
  assert.equal(builds, 2);
});

test("keys of a card's check and picture: another card, type, size, pixel ratio or colours is another key", () => {
  const fam = { kind: "family", section: "s", member: 3, colour: 1 };
  assert.equal(cardKey(fam), "family:s:3:1");
  assert.notEqual(cardKey(fam), cardKey({ ...fam, colour: -1 }));
  assert.equal(cardKey({ kind: "token", label: "a" }), "token:a");
  assert.equal(cardKey({ kind: "witness", file: "b" }), "witness:b");
  assert.equal(cardKey({ kind: "natural", x: "5", d: "7" }), "natural:5,7");
  const light = { fills: { "-1": "#d9534f" }, canvas: "#ffffff" };
  const dark = { fills: { "-1": "#e2605b" }, canvas: "#14151a" };
  const base = pictureKey(fam, { side: 200, dpr: 1, colours: light });
  assert.equal(base, pictureKey({ ...fam }, { side: 200, dpr: 1, colours: { ...light } }), "the same card and drawing: a hit");
  assert.notEqual(base, pictureKey(fam, { side: 201, dpr: 1, colours: light }), "another size");
  assert.notEqual(base, pictureKey(fam, { side: 200, dpr: 2, colours: light }), "another pixel ratio");
  assert.notEqual(base, pictureKey(fam, { side: 200, dpr: 1, colours: dark }), "another theme or palette");
  assert.notEqual(base, pictureKey({ ...fam, member: 4 }, { side: 200, dpr: 1, colours: light }), "another card");
  keepChecked(fam, { facts: { pass: true } });
  assert.deepEqual(checkedOf({ ...fam }), { facts: { pass: true } });
  assert.equal(checkedOf({ ...fam, colour: -1 }), null);
});

test("the kept pictures stay within PICTURE_LIMIT_BYTES, the least recently used dropped first", () => {
  // a stand-in for the canvases of a page (memory.mjs copies a picture with document.createElement and drawImage)
  const canvas = (w, h) => ({ width: w, height: h, style: { width: `${w}px` }, getContext: () => ({ drawImage() {} }) });
  globalThis.document = { createElement: () => canvas(0, 0) };
  try {
    const side = 1024; // 4 MiB a picture
    const n = Math.floor(PICTURE_LIMIT_BYTES / (4 * side * side));
    for (let k = 0; k < n; k++) assert.equal(keepPicture(`p${k}`, canvas(side, side), { k }), true);
    assert.equal(memoryStats().pictureBytes, n * 4 * side * side);
    assert.deepEqual(showPicture("p0", canvas(0, 0)), { k: 0 }, "p0 used now");
    keepPicture("extra", canvas(side, side), { k: "extra" });
    assert.ok(memoryStats().pictureBytes <= PICTURE_LIMIT_BYTES);
    assert.equal(showPicture("p1", canvas(0, 0)), null, "the least recently used went");
    assert.deepEqual(showPicture("p0", canvas(0, 0)), { k: 0 }, "a picture used again stays");
    assert.equal(keepPicture("huge", canvas(5000, 5000), {}), false, "a picture above the bound alone is not kept");
    const shown = canvas(0, 0);
    showPicture("extra", shown);
    assert.deepEqual([shown.width, shown.height, shown.style.width], [side, side, `${side}px`], "drawn back at its size");
  } finally {
    delete globalThis.document;
  }
});
