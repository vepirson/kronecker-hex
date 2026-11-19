// Gallery: the pure helpers (captions, links, the names of the region types, fitting a region into a card) and the
// credits of README.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  captionParts, captionText, cardHref, fitCard, statedOf, familyInput, typeText,
  checkGallery, MIN_CELL, CROP_CELL,
} from "../../src/ui/gallery/model.mjs";
import { fittedWindow } from "../../src/render/hex_canvas.mjs";
import { shapeS, hexDisc } from "../../src/core/shapes.mjs";

test("caption builder for each kind", () => {
  const facts = { genus: 100, area: 541, digits: 10437 };
  assert.equal(captionText({ kind: "token", label: "genus100_green" }, facts), "541 cells | genus 100 | x 10437 digits");
  assert.equal(captionText({ kind: "witness", file: "blue_g004" }, { genus: 4, area: 31, digits: 266 }), "31 cells | genus 4 | x 266 digits");
  assert.equal(captionText({ kind: "family", section: "s", member: 3, colour: 1 }, { genus: 3, area: 26, digits: 57 }), "26 cells | genus 3 | x 57 digits");
  assert.equal(captionText({ kind: "family", section: "c00", member: 2, colour: 0 }, { genus: 0, area: 19, digits: 12 }), "19 cells | genus 0 | x 12 digits");
  assert.equal(captionText({ kind: "natural", x: "-2500", d: "24990001" }, { genus: 100, area: 10687, digits: null }), "10687 cells | genus 100 | (-2500, 24990001)");
  assert.equal(captionText({ kind: "natural", x: "84", d: "-190", symmetry: 12 }, { genus: 1, area: 12, symmetry: 12 }), "12 cells | genus 1 | symmetry 12 | (84, -190)");
  assert.equal(captionParts({ kind: "natural", x: "1", d: "2" }, { genus: 0, area: 1 }).length, 3);
  // one order on every page: the cells before the genus, as the Explorer's chip ("541 cells | genus 100")
  for (const card of [{ kind: "token", label: "t" }, { kind: "witness", file: "w" }, { kind: "family", section: "c", member: 3, colour: -1 }, { kind: "natural", x: "1", d: "2" }, { kind: "natural", x: "1", d: "2", symmetry: 3 }]) {
    const text = captionText(card, { genus: 7, area: 66, digits: 12, symmetry: 3 });
    assert.ok(text.indexOf("66 cells") >= 0 && text.indexOf("66 cells") < text.indexOf("genus 7"), text);
  }
});

test("the names of the region types", () => {
  assert.deepEqual([1, -1, 0].map(typeText), ["+1", "-1", "0"]);
});

test("card links of each kind", () => {
  assert.equal(cardHref({ kind: "token", label: "a" }, "TOK"), "#/w/TOK");
  assert.equal(cardHref({ kind: "family", section: "s", member: 2, colour: 1 }), null);
  assert.equal(cardHref({ kind: "family", section: "s", member: 2, colour: 1 }, "T2"), "#/w/T2");
  assert.equal(cardHref({ kind: "family", section: "c00", member: 4, colour: 0 }, "T3"), "#/w/T3");
  assert.equal(cardHref({ kind: "witness", file: "blue_g001" }), "#/explore?w=blue_g001");
  assert.equal(cardHref({ kind: "natural", x: "-142", d: "354" }), "#/explore?x=-142&d=354&sel=0,0");
  assert.throws(() => cardHref({ kind: "token", label: "a" }), { code: "bad_format" });
  assert.throws(() => cardHref({ kind: "other" }), { code: "bad_format" });
});

test("stated numbers and construction inputs", () => {
  assert.deepEqual(statedOf({ kind: "family", section: "s", member: 7, colour: 1 }), { genus: 7, area: 66 });
  assert.deepEqual(statedOf({ kind: "family", section: "s0", member: 4, colour: 0 }), { genus: 4, area: 31 });
  assert.deepEqual(statedOf({ kind: "family", section: "c00", member: 6, colour: 0 }), { genus: 0, area: 127 });
  assert.deepEqual(statedOf({ kind: "token", genus: 117, area: 656 }), { genus: 117, area: 656 });
  const t = familyInput({ kind: "family", section: "s", member: 3, colour: -1 });
  assert.deepEqual(t.seed, [1, 0]);
  assert.equal(t.shape.length, 26);
  assert.equal(t.lift, 1);
  assert.equal(t.id, null);
  assert.throws(() => familyInput({ kind: "family", section: "s", member: 3, colour: 0 }), { code: "bad_colour" });
  const z = familyInput({ kind: "family", section: "s0", member: 1, colour: 0 });
  assert.deepEqual([z.seed, z.shape.length, z.colour, "lift" in z], [[0, 0], 12, 0, false]);
});

// visible(fw, i, j, side): the hexagon of cell (i, j) lies inside the middle square of side pixels of the window fw
const visible = (fw, i, j, side) => {
  const X = fw.originX + (i - j / 2) * fw.cell;
  const Y = fw.originY - j * (Math.sqrt(3) / 2) * fw.cell;
  const R = fw.cell / Math.sqrt(3);
  const x0 = (fw.width - side) / 2;
  const y0 = (fw.height - side) / 2;
  return X - fw.cell / 2 >= x0 - 1e-6 && X + fw.cell / 2 <= x0 + side + 1e-6 && Y - R >= y0 - 1e-6 && Y + R <= y0 + side + 1e-6;
};

test("fitCard: the window covers the whole square, the whole region inside its middle square, a long region cropped around its middle", () => {
  const row = Array.from({ length: 8 }, (_, i) => [i, 0]);
  for (const side of [165, 212, 266]) {
    for (const cells of [shapeS(1), shapeS(10), hexDisc(18), [[0, 0]], row]) {
      const f = fitCard(cells, side);
      assert.equal(f.cropped, false);
      const fw = fittedWindow(f.bounds, f.cell, f.pad);
      assert.ok(fw.width >= side && fw.height >= side, `window ${fw.width} x ${fw.height} covers ${side}`);
      assert.ok(fw.width <= side + 2 * f.cell + 1 && fw.height <= side + 2 * f.cell + 1, `window ${fw.width} x ${fw.height} at most two cells more than ${side}`);
      assert.ok(cells.every(([i, j]) => visible(fw, i, j, side)), `every cell inside the middle square of ${side} px`);
      assert.ok(f.cell >= MIN_CELL);
    }
    const long = shapeS(100);
    const f = fitCard(long, side);
    assert.equal(f.cropped, true);
    assert.equal(f.cell, CROP_CELL);
    const fw = fittedWindow(f.bounds, f.cell, f.pad);
    assert.ok(fw.width >= side && fw.height >= side && fw.width <= side + 2 * CROP_CELL + 1, `cropped window ${fw.width} x ${fw.height} covers ${side}`);
    assert.ok(long.some(([i, j]) => i === f.centre[0] && j === f.centre[1]), "the crop is centred on a cell of the region");
    assert.ok(visible(fw, f.centre[0], f.centre[1], side), "the centre cell is shown");
  }
});

test("checkGallery finds broken references", () => {
  const nat = { x: "1", d: "2", colour: 1, genus: 0, area: 1 };
  const ok = {
    format: "gallery_v2",
    featured: [{ kind: "token", label: "t", colour: 1, genus: 1, area: 2 }],
    found: [{ kind: "natural", ...nat, symmetry: 2, text: "a cell" }],
  };
  assert.deepEqual(checkGallery(ok, { tokens: { t: "x" }, naturals: [nat] }), []);
  assert.equal(checkGallery(ok, { tokens: {}, naturals: [nat] }).length, 1);
  const bad = {
    format: "gallery_v2",
    featured: [{ kind: "family", genus: 2 }, { kind: "witness", file: "q", genus: 1, area: 1 }, { kind: "natural", ...nat }],
    found: [{ kind: "natural", ...nat, colour: 1, symmetry: 13 }, { kind: "natural", x: "5", d: "6", colour: 2, genus: 0, area: 1, symmetry: 1, text: "x;y" }],
  };
  const p = checkGallery(bad, { naturals: [] });
  assert.ok(p.some((s) => /unknown kind family/.test(s)));
  assert.ok(p.some((s) => /witness file q/.test(s)));
  assert.ok(p.some((s) => /natural_examples/.test(s)));
  assert.ok(p.some((s) => /shown twice/.test(s)));
  assert.ok(p.some((s) => /symmetry must be/.test(s)));
  assert.ok(p.some((s) => /found card 1: the description text must be ASCII without a semicolon/.test(s)));
  assert.ok(p.some((s) => /region type 2 is not one of the switch/.test(s)));
  assert.ok(checkGallery({ ...ok, found: [] }, { tokens: { t: "x" }, naturals: [nat] }).some((s) => /found: no cards/.test(s)));
  // a card of found needs no description text and no entry in data/natural_examples.json (its flood fill checks it),
  // a featured natural card still needs its entry, and an entry with other numbers is still a problem
  const plain = { ...ok, found: [{ kind: "natural", x: "7", d: "-9", colour: 1, genus: 1, area: 6, symmetry: 12 }] };
  assert.deepEqual(checkGallery(plain, { tokens: { t: "x" }, naturals: [] }), []);
  const lonely = { ...plain, featured: [{ kind: "natural", ...nat }] };
  assert.deepEqual(checkGallery(lonely, { naturals: [] }), ["featured card 0: (1, 2) not in data/natural_examples.json"]);
  assert.ok(checkGallery(plain, { tokens: { t: "x" }, naturals: [{ x: "7", d: "-9", colour: 1, genus: 1, area: 7 }] }).some((s) => /differ from data\/natural_examples/.test(s)));
});

test("README.md: a section Credits with the link to the question, no licence line", () => {
  const readme = fs.readFileSync(fileURLToPath(new URL("../../README.md", import.meta.url)), "utf8");
  const k = readme.indexOf("\n## Credits\n");
  assert.ok(k >= 0, "a section Credits");
  const next = readme.indexOf("\n## ", k + 1);
  const section = readme.slice(k, next < 0 ? undefined : next);
  assert.match(section, /\]\(https:\/\/math\.stackexchange\.com\/(questions|q)\/5145414[^)]*\)/, "the link to the question");
  assert.equal(/licen[cs]e/i.test(section), false);
});
