// The Gallery's section of the squares of OEIS A052157 (the section "a052157" of SECTIONS, src/ui/gallery/model.mjs):
// its five terms a(1) .. a(5) with their s, well formed (checkSquares), every one of the n^2 cells (r - i, s - j) of type
// 0 by an exact gcd (and by the card's own check squareFacts), the cards, their captions, and the Explorer address each
// opens (the custom highlight b of the square, no flood fill).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SECTIONS, sectionById, sectionCards, sectionSlots, sectionPages, statedOf, cardRef, cardHref, captionParts, captionText,
  checkSquares, squareCorners, squareOf, squareHref, squareFacts, squareZoom, squareIsRegion, squareSubject, A052157_TERMS, KINDS,
} from "../../src/ui/gallery/model.mjs";
import { regionActions, NOT_A_REGION } from "../../src/ui/actions.mjs";
import { floodFill } from "../../src/core/regions.mjs";
import { cardKey } from "../../src/ui/gallery/memory.mjs";
import { readViewQuery } from "../../src/ui/pages/explore/state.mjs";
import { parseHash } from "../../src/ui/router.mjs";
import { gcdBig } from "../../src/core/bigint_utils.mjs";
import { NEIGHBOURS } from "../../src/core/geometry.mjs";

const SEC = sectionById("a052157");
const WANT = [
  [1, "2", "0"],
  [2, "21", "15"],
  [3, "1310", "1276"],
  [4, "10199373", "7247646"],
  [5, "131487690156", "37945747192"],
];
const HREFS = [
  "#/explore?x=2&d=0&z=40&b=0,0",
  "#/explore?x=21&d=15&z=40&b=0,0,-1,0,-1,-1,0,-1",
  "#/explore?x=1310&d=1276&z=40&b=0,0,-2,0,-2,-2,0,-2",
  "#/explore?x=10199373&d=7247646&z=40&b=0,0,-3,0,-3,-3,0,-3",
  "#/explore?x=131487690156&d=37945747192&z=33&b=0,0,-4,0,-4,-4,0,-4",
];

test("the section: before the symmetric shapes, five terms in order, well formed, one page, no switch", () => {
  const ids = SECTIONS.map((s) => s.id);
  assert.equal(ids.indexOf("a052157") + 1, ids.indexOf("found"));
  assert.equal(SEC.kind, "squares");
  assert.equal(SEC.colours, null);
  assert.deepEqual(A052157_TERMS.map((t) => [t.n, t.r, t.s]), WANT);
  assert.deepEqual(checkSquares(SEC), []);
  assert.ok(KINDS.includes("square"));
  assert.deepEqual(sectionPages(SEC), []);
  assert.equal(sectionSlots(SEC, null), 5);
  const cards = sectionCards(SEC, null);
  assert.deepEqual(cards.map((c) => [c.kind, c.section, c.n, c.r, c.s]), WANT.map(([n, r, s]) => ["square", "a052157", n, r, s]));
  assert.throws(() => sectionCards(SEC, null, { page: 1 }), { code: "bad_format" });
  // every card its own reference and memory key
  assert.equal(new Set(cards.map(cardRef)).size, 5);
  assert.equal(new Set(cards.map(cardKey)).size, 5);
  for (const c of cards) {
    assert.match(c.text, /^[\x20-\x7e]+$/);
    assert.equal(c.text.includes(";"), false);
  }
});

test("checkSquares refuses a term out of order, a malformed number, s not below r", () => {
  const bad = (terms) => checkSquares({ id: "t", terms });
  assert.deepEqual(bad([]), ["t: no terms"]);
  assert.equal(bad([{ n: 2, r: "21", s: "15" }]).length, 1);
  assert.equal(bad([{ n: 1, r: "2", s: "x" }]).length, 1);
  assert.equal(bad([{ n: 1, r: "02", s: "0" }]).length, 1, "a decimal string as written by String");
  assert.equal(bad([{ n: 1, r: "2", s: "2" }]).length, 1);
  assert.equal(bad([{ n: 1, r: "2", s: "-1" }]).length, 1);
});

test("every cell of every square has gcd(x, d) > 1 (exact), and the card's own check passes", () => {
  for (const [n, r, s] of WANT) {
    const card = sectionCards(SEC, null)[n - 1];
    const { x0, d0, corners, cells } = squareOf(card);
    assert.deepEqual(corners, squareCorners(n));
    assert.equal(cells.length, n * n);
    const want = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) want.push(`${-i},${-j}`);
    assert.deepEqual(cells.map(([i, j]) => `${i},${j}`).sort(), want.sort(), `a(${n}): the cells (r - i, s - j)`);
    for (const [i, j] of cells) {
      const x = BigInt(r) + BigInt(i);
      const d = BigInt(s) + BigInt(j);
      assert.ok(gcdBig(x, d) > 1n, `a(${n}): gcd(${x}, ${d})`);
    }
    assert.equal(x0, BigInt(r));
    assert.equal(d0, BigInt(s));
    const facts = squareFacts(card);
    assert.deepEqual(facts, { pass: true, reasons: [], genus: null, area: n * n, digits: null });
    assert.deepEqual(statedOf(card), { genus: null, area: n * n });
  }
  // a wrong s fails the check, with its reason
  const wrong = squareFacts({ kind: "square", section: "a052157", n: 2, r: "21", s: "14" });
  assert.equal(wrong.pass, false);
  assert.deepEqual(wrong.reasons, ["2 of the cells not of type 0"], "(21, 13) and (20, 13)");
});

test("why the custom highlight: the a(5) square has no neighbour of type 0, every smaller one has one", () => {
  for (const [n, r, s] of WANT) {
    const inSquare = new Set();
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) inSquare.add(`${-i},${-j}`);
    let blue = 0;
    const seen = new Set();
    for (const key of inSquare) {
      const [i, j] = key.split(",").map(Number);
      for (const [di, dj] of NEIGHBOURS) {
        const k = `${i + di},${j + dj}`;
        if (inSquare.has(k) || seen.has(k)) continue;
        seen.add(k);
        if (gcdBig(BigInt(r) + BigInt(i + di), BigInt(s) + BigInt(j + dj)) > 1n) blue++;
      }
    }
    if (n === 5) assert.equal(blue, 0, "a(5)");
    else assert.ok(blue > 0, `a(${n})`);
  }
});

test("captions and the Explorer address of each card: the square highlighted by b, centred on (r, s)", () => {
  const cards = sectionCards(SEC, null);
  // the one-line caption of every card: n x n and the term, no s (s is in the card's tooltip text)
  assert.deepEqual(captionParts(cards[4], {}), ["5 x 5", "a(5) = 131487690156"]);
  assert.equal(captionText(cards[0], {}), "1 x 1 | a(1) = 2");
  assert.equal(cards[4].text, "cells (a(5) - i, s - j) for 0 <= i, j < 5, s = 37945747192");
  assert.deepEqual(cards.map((c) => cardHref(c)), HREFS);
  assert.deepEqual(cards.map(squareHref), HREFS);
  assert.deepEqual([1, 2, 3, 4, 5].map(squareZoom), [40, 40, 40, 40, 33]);
  // each address reads back as its square: x = r, d = s, the corners of the square, no selection, nothing ignored
  for (const [k, href] of HREFS.entries()) {
    const { path, query } = parseHash(href);
    assert.equal(path, "#/explore");
    const q = readViewQuery(query);
    const [n, r, s] = WANT[k];
    assert.deepEqual([q.x, q.d, q.b, q.sel, q.problems], [BigInt(r), BigInt(s), squareCorners(n), null, []]);
  }
  assert.deepEqual(squareCorners(1), [[0, 0]]);
  assert.throws(() => squareCorners(0), { code: "bad_format" });
});

test("pencil and flask of a square card: enabled exactly when the fill of (r, s) is complete and is the square", () => {
  // the rule on made-up fills: complete and the same cells (any order), nothing else
  const c2 = sectionCards(SEC, null)[1];
  const own = squareOf(c2).cells;
  assert.equal(squareIsRegion(c2, { complete: true, cells: own.slice().reverse(), colour: 0 }), true);
  assert.equal(squareIsRegion(c2, { complete: false, cells: own, colour: 0 }), false, "not complete");
  assert.equal(squareIsRegion(c2, { complete: true, cells: [...own, [1, 0]], colour: 0 }), false, "more cells");
  assert.equal(squareIsRegion(c2, { complete: true, cells: [...own.slice(1), [1, 0]], colour: 0 }), false, "other cells");
  assert.equal(squareIsRegion(c2, null), false, "a failed fill");
  // the five terms with the fill and cap of a region card (200000): only a(5) is a whole region (25 cells); a(1) lies
  // on the line d = 0 (the fill hits the cap), a(2), a(3), a(4) have regions of 7, 11 and 30 cells
  const want = [[false, false], [true, 7], [true, 11], [true, 30], [true, 25]];
  for (const [k, card] of sectionCards(SEC, null).entries()) {
    const R = floodFill(BigInt(card.r), BigInt(card.s), 200000);
    const fill = { complete: R.complete, cells: R.cells, colour: R.colour };
    assert.equal(R.complete, want[k][0], `a(${card.n}) complete`);
    if (R.complete) assert.equal(R.cells.length, want[k][1], `a(${card.n}) area`);
    const acts = regionActions(squareSubject(card, fill));
    if (card.n === 5) {
      assert.equal(squareIsRegion(card, fill), true);
      assert.equal(acts.edit.cells, R.cells, "the pencil opens the region, which is the square");
      assert.equal(acts.edit.colour, 0);
      assert.ok(acts.lab || acts.labWhy);
    } else {
      assert.equal(squareIsRegion(card, fill), false, `a(${card.n})`);
      assert.deepEqual([acts.edit, acts.lab, acts.editWhy, acts.labWhy], [null, null, NOT_A_REGION, NOT_A_REGION], `a(${card.n})`);
    }
  }
  assert.equal(NOT_A_REGION, "Not a region");
});
