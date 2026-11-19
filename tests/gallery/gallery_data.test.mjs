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
import { checkGallery, SECTIONS, CARD_PAGE_SIZE, sectionCards, sectionPages, sectionSlots, pageName, statedOf, familyInput, familyMembers, cardHref, cardRef, typeText } from "../../src/ui/gallery/model.mjs";
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
  assert.equal(gallery.found.length, 751 + 727 + 184);
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
  // every natural card of the page outside the section found is one of them (checkGallery compares its numbers), the
  // cards of found are checked by their own flood fill (found_regions.test.mjs)
  for (const c of cards.filter((k) => k.kind === "natural" && k.section !== "found")) assert.ok(naturals.some((n) => n.x === c.x && n.d === c.d), `${c.x}, ${c.d}`);
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

test("the cards of a card section: all of them, or those of the chosen type, the section found in pages of 15 per type", () => {
  const found = SECTIONS.find((s) => s.id === "found");
  const featured = SECTIONS.find((s) => s.id === "featured");
  assert.equal(sectionCards(featured, gallery).length, 5);
  assert.deepEqual(sectionPages(featured, gallery), []);
  // the types in the switch order +1, -1, 0: every shape of the census, 751, 727 and 184 cards (no cut)
  const byType = found.colours.map((c) => gallery.found.filter((x) => x.colour === c));
  assert.deepEqual(byType.map((l) => l.length), [751, 727, 184]);
  // pages of 15, their count from the number of cards: 51 (the last with one card), 49 (the last with 7) and 13 (the
  // last with 4)
  assert.deepEqual(found.colours.map((c) => sectionPages(found, gallery, c).length), byType.map((l) => Math.ceil(l.length / CARD_PAGE_SIZE)));
  assert.deepEqual(found.colours.map((c) => sectionPages(found, gallery, c).length), [51, 49, 13]);
  assert.deepEqual([[50, 1], [48, -1], [12, 0]].map(([page, colour]) => sectionCards(found, gallery, { page, colour }).length), [1, 7, 4]);
  assert.equal(sectionSlots(found, gallery), CARD_PAGE_SIZE);
  for (const [k, c] of found.colours.entries()) {
    const pages = sectionPages(found, gallery, c);
    const shown = [];
    for (const p of pages) {
      const cs = sectionCards(found, gallery, { page: p.index, colour: c });
      assert.equal(cs.length, p.index < pages.length - 1 ? CARD_PAGE_SIZE : byType[k].length - CARD_PAGE_SIZE * (pages.length - 1));
      assert.ok(cs.every((x) => x.colour === c));
      shown.push(...cs);
    }
    // every card of the type once, in the order of the file
    assert.deepEqual(shown, byType[k]);
    assert.throws(() => sectionCards(found, gallery, { page: pages.length, colour: c }), { code: "bad_format" });
  }
  assert.equal(pageName(found, sectionPages(found, gallery, 1)[1]), "Shapes 16 to 30");
  assert.equal(pageName(found, sectionPages(found, gallery, -1)[48]), "Shapes 721 to 727");
  assert.equal(pageName(found, sectionPages(found, gallery, 1)[50]), "Shape 751");
  // ordered within each type by area ascending (smallest first), then genus ascending, then symmetry descending
  for (const l of byType) {
    for (let i = 1; i < l.length; i++) {
      const a = [l[i - 1].area, l[i - 1].genus, l[i - 1].symmetry];
      const b = [l[i].area, l[i].genus, l[i].symmetry];
      assert.ok(a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] >= b[2]))), `${l[i].x}, ${l[i].d}`);
    }
  }
  // no cut: each type starts with its single cell (symmetry 12) and ends with its largest shape
  assert.deepEqual(byType.map((l) => [l[0].area, l[0].symmetry]), [[1, 12], [1, 12], [1, 12]]);
  assert.deepEqual(byType.map((l) => l[l.length - 1].area), [24, 21, 47]);
  assert.ok(gallery.found.some((x) => x.x === "-1" && x.d === "-3" && x.colour === 1));
  // the page buttons (up to 51) wrap into further rows when they do not fit the width
  assert.match(fs.readFileSync(abs("styles/gallery.css"), "utf8"), /\.gal-pages \{[^}]*flex-wrap: wrap/);
  // the section with no cards of a type: no page, nothing shown
  assert.deepEqual(sectionPages(found, { found: [] }, 1), []);
  assert.deepEqual(sectionCards(found, { found: [] }, { page: 0, colour: 1 }), []);
});
