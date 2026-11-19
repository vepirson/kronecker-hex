// Gallery data: data/gallery.json (format gallery_v2) is well formed, every reference resolves and no card is shown
// twice; every token card opens with openToken to its stated type, genus and area and passes verifyWitness; every
// witness card passes verifyWitness with its stated numbers; every natural example (data/natural_examples.json) gives
// its area, genus and colour by flood fill; a sample of the family members (the first and the last member of each
// family, every region type of the section) is built by the construction, passes its final check and verifyWitness
// with the stated genus and area, and its token opens again to the same x0 and d0.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { checkGallery, SECTIONS, sectionCards, statedOf, familyInput, familyMembers, cardHref, cardRef, typeText } from "../../src/ui/gallery/model.mjs";
import { openToken } from "../../src/formats/token.mjs";
import { verifyWitness, makeWitness } from "../../src/formats/witness.mjs";
import { floodFill } from "../../src/core/regions.mjs";
import { runToEnd } from "../../src/construct/index.mjs";

const abs = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p) => JSON.parse(fs.readFileSync(abs(p), "utf8"));
const gallery = read("data/gallery.json");
const tokens = read("data/tokens.json");
const naturals = read("data/natural_examples.json").examples;
const witnessFiles = fs.readdirSync(abs("data/witnesses")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
const cardSections = SECTIONS.filter((s) => s.kind === "cards");
const cards = cardSections.flatMap((s) => gallery[s.id].map((c) => ({ ...c, section: s.id })));

test("data/gallery.json is well formed, every reference resolves, no card twice on the page", () => {
  assert.equal(gallery.format, "gallery_v2");
  assert.deepEqual(checkGallery(gallery, { tokens, witnessFiles, naturals }), []);
  assert.deepEqual(Object.keys(gallery).sort(), ["featured", "format", "found", "note"]);
  assert.equal(gallery.featured.length, 5);
  assert.equal(gallery.found.length, 30);
  // the family members are distinct from each other and from the stored cards (other kinds)
  const refs = cards.map(cardRef);
  for (const s of SECTIONS.filter((x) => x.kind === "family")) {
    for (const member of familyMembers(s)) refs.push(cardRef({ kind: "family", section: s.id, member }));
  }
  assert.equal(new Set(refs).size, refs.length);
  // a broken file is found: a card twice, an unknown token, the old format
  const twice = { ...gallery, featured: gallery.featured.concat([gallery.featured[0]]) };
  assert.ok(checkGallery(twice, { tokens, witnessFiles, naturals }).some((p) => /shown twice/.test(p)));
  const lost = { ...gallery, featured: [{ ...gallery.featured[0], label: "nope" }] };
  assert.ok(checkGallery(lost, { tokens, witnessFiles, naturals }).some((p) => /token label nope/.test(p)));
  assert.deepEqual(checkGallery({ groups: [] }), ["format is not gallery_v2"]);
  console.log(`cards: featured ${gallery.featured.length}, found ${gallery.found.length}, family members ${refs.length - cards.length}`);
});

test("the note of data/gallery.json names the two card sections and the kinds it holds", () => {
  for (const word of ["featured", "found", "kind token", "kind witness", "kind natural", "symmetry", "text"]) assert.ok(gallery.note.includes(word), word);
  assert.match(gallery.note, /^[\x20-\x7e]+$/);
  assert.equal(gallery.note.includes(";"), false);
});

test("token cards: openToken gives the stated type, genus and area, verifyWitness passes", () => {
  for (const c of cards.filter((k) => k.kind === "token")) {
    const o = openToken(tokens[c.label]);
    const w = makeWitness({ id: c.label, colour: o.data.colour, x0: o.x0, d0: o.d0, seed: o.data.seed, shape: o.data.shape });
    assert.equal(o.data.colour, c.colour, c.label);
    assert.equal(o.data.genus, c.genus, c.label);
    assert.equal(o.data.shape.length, c.area, c.label);
    const v = verifyWitness(w);
    assert.equal(v.pass, true, `${c.label}: ${v.reasons.join(" | ")}`);
    assert.equal(v.info.flood.genus, c.genus);
    assert.equal(v.info.flood.area, c.area);
    assert.equal(cardHref(c, tokens[c.label]), `#/w/${tokens[c.label]}`);
    console.log(`token ${c.label}: type ${typeText(o.data.colour)}, genus ${v.info.flood.genus}, area ${v.info.flood.area}, x0 ${v.info.digits.x0} digits, flood ${v.info.flood_ms} ms`);
  }
});

test("witness cards: verifyWitness passes with the stated type, genus and area", () => {
  for (const c of cards.filter((k) => k.kind === "witness")) {
    const w = read(`data/witnesses/${c.file}.json`);
    const v = verifyWitness(w);
    assert.equal(v.pass, true, `${c.file}: ${v.reasons.join(" | ")}`);
    assert.equal(w.colour, c.colour, c.file);
    assert.equal(v.info.flood.genus, c.genus, c.file);
    assert.equal(v.info.flood.area, c.area, c.file);
    console.log(`witness ${c.file}: genus ${v.info.flood.genus}, area ${v.info.flood.area}, x0 ${v.info.digits.x0} digits, flood ${v.info.flood_ms} ms`);
  }
});

test("natural examples: flood fill gives the stated colour, area and genus", () => {
  assert.ok(naturals.length >= 25 && naturals.length <= 60);
  for (const n of naturals) {
    assert.deepEqual(Object.keys(n).sort(), ["area", "colour", "d", "genus", "x"]);
    assert.match(n.x, /^-?[0-9]+$/);
    assert.match(n.d, /^-?[0-9]+$/);
    const t0 = Date.now();
    const f = floodFill(BigInt(n.x), BigInt(n.d), 200000);
    assert.equal(f.complete, true, `${n.x}, ${n.d}`);
    assert.equal(f.colour, n.colour, `${n.x}, ${n.d}`);
    assert.equal(f.area, n.area, `${n.x}, ${n.d}`);
    assert.equal(f.genus, n.genus, `${n.x}, ${n.d}`);
    if (n.area > 1000) console.log(`natural (${n.x}, ${n.d}): genus ${f.genus}, area ${f.area}, ${Date.now() - t0} ms`);
  }
  // every natural card of the page is one of them (checkGallery compares its numbers)
  for (const c of cards.filter((k) => k.kind === "natural")) assert.ok(naturals.some((n) => n.x === c.x && n.d === c.d), `${c.x}, ${c.d}`);
  console.log(`natural examples: ${naturals.length} filled, all equal`);
});

function checkBuilt(card) {
  const what = `${card.section} member ${card.member} type ${typeText(card.colour)}`;
  const t0 = Date.now();
  const { result } = runToEnd(familyInput(card));
  const ms = Date.now() - t0;
  assert.ok(result, `${what}: construction failed`);
  assert.equal(result.pass, true, what);
  const stated = statedOf(card);
  const v = verifyWitness(result.witness);
  assert.equal(v.pass, true, `${what}: ${v.reasons.join(" | ")}`);
  assert.equal(v.info.flood.colour, card.colour, what);
  assert.equal(v.info.flood.genus, stated.genus, what);
  assert.equal(v.info.flood.area, stated.area, what);
  const o = openToken(result.token);
  assert.equal(o.x0, result.x0, `${what}: token round trip x0`);
  assert.equal(o.d0, result.d0, `${what}: token round trip d0`);
  assert.equal(cardHref(card, result.token), `#/w/${result.token}`);
  return `${what}: ${stated.area} cells, x ${v.info.digits.x0} digits, ${ms} ms`;
}

test("family members built by the construction: the first and the last member of each family, every region type, final check, verifyWitness and token round trip", () => {
  const lines = [];
  for (const s of SECTIONS.filter((x) => x.kind === "family")) {
    const ms = familyMembers(s);
    for (const member of [ms[0], ms[ms.length - 1]]) {
      for (const colour of s.colours) lines.push(checkBuilt({ kind: "family", section: s.id, member, colour }));
    }
  }
  assert.equal(lines.length, 2 * 2 + 2 + 2 * 2 + 2);
  console.log(lines.join("\n"));
});

test("the cards of a card section: all of them, or those of the chosen type", () => {
  const found = SECTIONS.find((s) => s.id === "found");
  // the types in the switch order +1, -1, 0: ten cards each
  assert.deepEqual(found.colours.map((c) => sectionCards(found, gallery, { colour: c }).length), [10, 10, 10]);
  const featured = SECTIONS.find((s) => s.id === "featured");
  assert.equal(sectionCards(featured, gallery).length, 5);
});
