// The sections of the Gallery (SECTIONS of src/ui/gallery/model.mjs): six in page order, each with its title only (a
// title that typesets), the four families with their members and region types, every member a connected shape of the
// genus of its member with its seed (cheap, no construction), the solid hexagons of C_0^0 only of even radius (the
// residue test of their ring of neighbours), the pages of five members, and the page widget's model (page count,
// ranges, the last page shorter when the range is not a multiple of the page size, a step between members).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECTIONS, PAGE_SIZE, sectionById, sectionPages, sectionCards, sectionSlots, pageName, familyShape, familyInput, statedOf,
  familyMembers, storedMembers,
} from "../../src/ui/gallery/model.mjs";
import { pagesOf, pageCount, clampPage } from "../../src/ui/widgets/pager.mjs";
import { genusOfCells, holeCount, isConnected } from "../../src/core/regions.mjs";
import { cellKey, neighbourhood } from "../../src/core/geometry.mjs";
import { residueTest } from "../../src/core/admissible.mjs";
import { shapeS, shapeZ, hexDisc } from "../../src/core/shapes.mjs";
import { shapeC } from "../../src/core/shapes_compact.mjs";
import { splitMath, texToHtml } from "../../src/ui/widgets/math.mjs";

const even = Array.from({ length: 25 }, (_, k) => 2 * k + 2);

test("six sections in page order, the families with their members, generators and region types", () => {
  assert.deepEqual(SECTIONS.map((s) => s.id), ["featured", "s", "s0", "c", "c00", "found"]);
  assert.deepEqual(SECTIONS.map((s) => s.kind), ["cards", "family", "family", "family", "family", "cards"]);
  const fam = Object.fromEntries(SECTIONS.filter((s) => s.kind === "family").map((s) => [s.id, [s.param, s.from, s.to, s.step, s.colours, s.shape, s.title]]));
  assert.deepEqual(fam, {
    s: ["genus", 1, 25, 1, [1, -1], shapeS, "$S_{g}^{\\pm1}$, genus 1 to 25"],
    s0: ["genus", 1, 25, 1, [0], shapeZ, "$S_{g}^{0}$, genus 1 to 25"],
    c: ["genus", 1, 25, 1, [1, -1], shapeC, "$C_{g}^{\\pm1}$, genus 1 to 25"],
    c00: ["radius", 2, 10, 2, [0], hexDisc, "$C_{0}^{0}$, radius 2 to 10"],
  });
  assert.deepEqual(familyMembers(sectionById("c00")), [2, 4, 6, 8, 10]);
  assert.deepEqual(familyMembers(sectionById("s")), Array.from({ length: 25 }, (_, k) => k + 1));
  assert.deepEqual(sectionById("featured").colours, null);
  // (its cards lie inside |x|, |d| <= 4000, found_regions.test.mjs, the title states the round bound 5000)
  assert.equal(sectionById("found").title, "Symmetric with $|x|, |d| \\le 5000$");
  // the order of the region types everywhere: +1, -1, 0
  assert.deepEqual(sectionById("found").colours, [1, -1, 0]);
  assert.equal(PAGE_SIZE, 5);
});

test("every section has its title only: no sentence, ASCII, no semicolon, formulas typeset, no TeX source outside them", () => {
  for (const s of SECTIONS) {
    assert.equal("sentence" in s, false, s.id);
    const t = s.title;
    assert.match(t, /^[\x20-\x7e]+$/, t);
    assert.equal(t.includes(";") || /\.$/.test(t), false, t);
    for (const p of splitMath(t)) {
      if (p.type === "math") assert.equal(texToHtml(p.tex, false).ok, true, p.tex);
      else assert.equal(/\^\{|_\{|\\pm|\\le|[{}$]/.test(p.value), false, JSON.stringify(p.value));
    }
    assert.equal(/\b(largest|smallest|nearest|most)\b/i.test(t), false, t);
    assert.equal(/\b(green|red|blue)\b/i.test(t), false, `region types, not colour words: ${t}`);
  }
});

test("every member of every family: a connected shape of the genus of its member (two ways), its seed a cell of it", () => {
  for (const s of SECTIONS.filter((x) => x.kind === "family")) {
    const t0 = Date.now();
    for (const m of familyMembers(s)) {
      const { shape, seed } = familyShape(s.id, m);
      const what = `${s.id} ${s.param} ${m}`;
      const g = s.genusOf(m);
      assert.ok(isConnected(shape), what);
      assert.equal(genusOfCells(shape).genus, g, what);
      assert.equal(holeCount(shape), g, what);
      assert.ok(shape.some(([i, j]) => cellKey(i, j) === cellKey(seed[0], seed[1])), what);
      assert.deepEqual(statedOf({ kind: "family", section: s.id, member: m }), { genus: g, area: shape.length });
    }
    console.log(`${s.id}: ${s.param} ${s.from} .. ${s.to} connected, genus as stated, ${Date.now() - t0} ms`);
  }
  assert.deepEqual(statedOf({ kind: "family", section: "c00", member: 10 }), { genus: 0, area: 3 * 10 * 11 + 1 });
  assert.throws(() => familyShape("s", 26), { code: "bad_format" });
  assert.throws(() => familyShape("s0", 26), { code: "bad_format" });
  assert.throws(() => familyShape("c00", 3), { code: "bad_format" }, "an odd radius is no member");
  assert.throws(() => familyShape("c00", 12), { code: "bad_format" }, "the family keeps its first page only");
  assert.throws(() => familyShape("c00", 0), { code: "bad_format" });
  assert.throws(() => familyShape("c0", 1), { code: "bad_format" }, "the family C_g^0 left the Gallery");
  assert.throws(() => familyShape("found", 1), { code: "bad_format" });
});

test("C_0^0: the ring of neighbours of the solid hexagon of radius R misses a class modulo every prime for every even R up to 50 (the family's radii 2 to 10 among them), and meets every class modulo 2 for an odd R", () => {
  for (const R of familyMembers(sectionById("c00"))) assert.ok(even.includes(R));
  for (const R of even) {
    const ring = neighbourhood(hexDisc(R));
    assert.equal(ring.length, 6 * (R + 1), `R = ${R}`);
    const fails = residueTest(ring).filter((r) => r.missed === null).map((r) => r.p);
    assert.deepEqual(fails, [], `R = ${R}`);
  }
  for (const R of [1, 3, 5, 9, 25, 49]) {
    const two = residueTest(neighbourhood(hexDisc(R))).find((r) => r.p === 2);
    assert.equal(two.missed, null, `R = ${R}: the ring meets every class modulo 2`);
  }
});

test("construction inputs of a family card: lift 1 for +1 and -1, none for 0, a type the section does not build refused", () => {
  assert.deepEqual(Object.keys(familyInput({ section: "c", member: 3, colour: -1 })).sort(), ["colour", "id", "lift", "seed", "shape"]);
  assert.equal(familyInput({ section: "s", member: 2, colour: 1 }).lift, 1);
  const b = familyInput({ section: "c00", member: 4, colour: 0 });
  assert.equal(b.lift, undefined);
  assert.equal(b.colour, 0);
  assert.deepEqual(b.seed, [0, 0]);
  assert.deepEqual(b.shape, hexDisc(4));
  assert.throws(() => familyInput({ section: "s0", member: 3, colour: 1 }), { code: "bad_colour" });
  assert.throws(() => familyInput({ section: "c", member: 3, colour: 0 }), { code: "bad_colour" });
  assert.throws(() => familyInput({ section: "c00", member: 4, colour: 1 }), { code: "bad_colour" });
});

test("the pages of a family: five pages of five members each (one page for C_0^0), named genus a to b or radius a to b, every member once", () => {
  for (const s of SECTIONS.filter((x) => x.kind === "family")) {
    const pages = sectionPages(s);
    assert.equal(pages.length, s.id === "c00" ? 1 : 5, s.id);
    const seen = [];
    for (const p of pages) {
      const cards = sectionCards(s, null, { page: p.index, colour: s.colours[0] });
      assert.equal(cards.length, PAGE_SIZE);
      assert.deepEqual(cards.map((c) => c.member), Array.from({ length: PAGE_SIZE }, (_, k) => p.from + k * s.step));
      seen.push(...cards.map((c) => c.member));
    }
    assert.deepEqual(seen, familyMembers(s));
    assert.equal(sectionSlots(s, null), PAGE_SIZE);
    // the first page is built in the browser, the others are stored
    assert.deepEqual(storedMembers(s), familyMembers(s).slice(PAGE_SIZE));
  }
  assert.equal(pageName(sectionById("s"), sectionPages(sectionById("s"))[1]), "Genus 6 to 10");
  assert.deepEqual(sectionPages(sectionById("c00")).map((p) => pageName(sectionById("c00"), p)), ["Radius 2 to 10"]);
  assert.deepEqual(storedMembers(sectionById("c00")), [], "C_0^0 has its first page only, built in the browser");
  assert.equal(pageName(sectionById("s0"), { from: 7, to: 7 }), "Genus 7");
  assert.throws(() => sectionCards(sectionById("s"), null, { page: 5, colour: 1 }), { code: "bad_format" });
});

test("the page widget's model: page count, ranges, the last page shorter, a step between the numbers", () => {
  assert.deepEqual(pagesOf(1, 25, 5).map((p) => [p.index, p.from, p.to]), [[0, 1, 5], [1, 6, 10], [2, 11, 15], [3, 16, 20], [4, 21, 25]]);
  assert.equal(pagesOf(1, 50, 5).length, 10);
  assert.deepEqual(pagesOf(1, 23, 5).map((p) => [p.from, p.to]), [[1, 5], [6, 10], [11, 15], [16, 20], [21, 23]]);
  assert.deepEqual(pagesOf(3, 3, 5).map((p) => [p.from, p.to]), [[3, 3]]);
  assert.deepEqual(pagesOf(1, 6, 5).map((p) => p.to - p.from + 1), [5, 1]);
  assert.deepEqual(pagesOf(2, 50, 5, 2).map((p) => [p.from, p.to]), [[2, 10], [12, 20], [22, 30], [32, 40], [42, 50]]);
  assert.deepEqual(pagesOf(2, 15, 5, 2).map((p) => [p.from, p.to]), [[2, 10], [12, 14]], "the last number is the last step at most to");
  assert.equal(pageCount(25, 5), 5);
  assert.equal(pageCount(23, 5), 5);
  assert.equal(pageCount(0, 5), 1);
  assert.equal(clampPage(3, 5), 3);
  assert.equal(clampPage(5, 5), 0);
  assert.equal(clampPage(-1, 5), 0);
  assert.equal(clampPage(undefined, 5), 0);
  assert.throws(() => pagesOf(5, 4, 5), RangeError);
  assert.throws(() => pagesOf(1, 4, 0), RangeError);
  assert.throws(() => pagesOf(1, 4, 5, 0), RangeError);
});
