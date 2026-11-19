// The three examples of the answer on the site: the first three cards of the Gallery's first section, Featured (in the
// answer's order: genus 100 of region type +1, genus 0 of region type -1, genus 0 of region type 0, then the second and
// the first in their other region type, five cards in all), the witness of
// the filled star (433 cells, x0 of 656 digits, d0 of 658 digits, recomputed here), and the Lab preset g0star, whose
// live blue build gives the same x0 and d0 as the witness file and whose green and red are refused by the colour check.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { checkGallery, captionText, cardHref, SECTIONS } from "../../src/ui/gallery/model.mjs";
import { openToken } from "../../src/formats/token.mjs";
import { verifyWitness, makeWitness } from "../../src/formats/witness.mjs";
import { runToEnd, runPlace } from "../../src/construct/index.mjs";
import { sha256Hex } from "../../src/core/sha256.mjs";
import { genusOfCells } from "../../src/core/regions.mjs";
import * as model from "../../src/ui/pages/lab/model.mjs";
import { kindEntry } from "../../src/ui/pages/lab/kinds.mjs";

const abs = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p) => JSON.parse(fs.readFileSync(abs(p), "utf8"));
const gallery = read("data/gallery.json");
const tokens = read("data/tokens.json");
const naturals = read("data/natural_examples.json").examples;
const listNames = (dir) => fs.readdirSync(abs(dir)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
const star = read("data/witnesses/star_genus0.json");
const starShape = read("data/shapes/star_genus0.json");

// the facts a card's caption is computed from (as the Gallery page does: verifyWitness of the token or the file)
function factsOf(card) {
  let w;
  if (card.kind === "token") {
    const o = openToken(tokens[card.label]);
    w = makeWitness({ id: card.label, colour: o.data.colour, x0: o.x0, d0: o.d0, seed: o.data.seed, shape: o.data.shape });
  } else {
    w = read(`data/witnesses/${card.file}.json`);
  }
  const v = verifyWitness(w);
  assert.equal(v.pass, true, `${card.label || card.file}: ${v.reasons.join(" | ")}`);
  return { colour: w.colour, x0: w.x0, d0: w.d0, facts: { genus: v.info.flood.genus, area: v.info.flood.area, digits: v.info.digits.x0 } };
}

test("the star witness: written by makeWitness, passes verifyWitness, x0 656 digits and d0 658 digits recomputed", () => {
  assert.equal(star.format, "kron_hex_witness_v1");
  assert.equal(star.id, "star_genus0");
  assert.equal(star.construction, undefined);
  assert.deepEqual(Object.keys(star), ["format", "id", "colour", "genus", "area", "x0", "d0", "seed", "shape", "window", "digits"]);
  const x0 = BigInt(star.x0), d0 = BigInt(star.d0);
  assert.equal((x0 < 0n ? -x0 : x0).toString().length, 656);
  assert.equal((d0 < 0n ? -d0 : d0).toString().length, 658);
  const v = verifyWitness(star);
  assert.equal(v.pass, true, v.reasons.join(" | "));
  assert.deepEqual(v.warnings, []);
  assert.deepEqual(v.info.digits, { x0: 656, d0: 658 });
  assert.deepEqual([v.info.flood.colour, v.info.flood.genus, v.info.flood.area], [0, 0, 433]);
  // makeWitness of the same numbers gives the same file content
  assert.deepEqual(makeWitness({ id: star.id, colour: 0, x0, d0, seed: star.seed, shape: star.shape }), star);
  // the shape file holds the same cells and seed, in the format of its neighbours
  assert.deepEqual(Object.keys(starShape), ["genus", "area", "seed", "shape"]);
  assert.deepEqual(starShape.shape, star.shape);
  assert.deepEqual(starShape.seed, star.seed);
  assert.equal(starShape.area, 433);
  assert.equal(starShape.genus, genusOfCells(starShape.shape).genus);
  assert.equal(starShape.genus, 0);
});

test("the preset g0star: blue only by the colour check, live in the worker, the same x0 and d0 as the witness file", () => {
  const p = model.LAB_PRESETS.find((q) => q.name === "g0star");
  assert.ok(p);
  assert.deepEqual([p.title, p.short, p.file, p.family], ["star, genus 0", "star, genus 0", "star_genus0.json", null]);
  // green and red: the page's check of the loaded shape refuses them with the prime 2
  for (const word of ["green", "red"]) {
    const plan = model.resolvePreset("g0star", word);
    const chk = kindEntry(plan).check(starShape.shape);
    assert.equal(chk.p, 2);
    assert.equal(model.blockedText(p.title, plan.colour, chk), `Star, genus 0 cannot have region type ${plan.colour > 0 ? "+1" : "-1"}: the shape meets every class modulo 2.`);
  }
  // blue: the steps of the page for a shipped shape without a stored construction
  const plan = model.resolvePreset("g0star", "blue", "replay");
  assert.deepEqual(plan, { kind: "preset", name: "g0star", colour: 0, shapeKind: "file", file: "star_genus0.json", tokenLabel: null, mode: "live", runOn: null });
  const ent = kindEntry(plan);
  const input = ent.inputRecord({ shape: starShape.shape, seed: starShape.seed, colour: plan.colour, lift: plan.lift, id: null });
  assert.ok(input);
  assert.equal(ent.check(input.shape), null);
  assert.equal(plan.runOn || runPlace(input), "worker");
  const t0 = Date.now();
  const { result } = runToEnd(input);
  const ms = Date.now() - t0;
  assert.ok(result, "the blue construction gives a result");
  assert.equal(result.pass, true);
  assert.equal(result.x0.toString(), star.x0);
  assert.equal(result.d0.toString(), star.d0);
  assert.equal(result.sha256.x0, sha256Hex(star.x0));
  assert.equal(result.sha256.d0, sha256Hex(star.d0));
  assert.deepEqual(result.digits, { x0: 656, d0: 658 });
  console.log(`g0star blue live: PASS in ${ms} ms, x0 ${result.digits.x0} digits (sha256 ${result.sha256.x0.slice(0, 16)}...), d0 ${result.digits.d0} digits`);
});

test("the examples of the answer: the first three cards of the first section, in the answer's order, captions computed, each shown once", () => {
  assert.deepEqual(checkGallery(gallery, { tokens, witnessFiles: listNames("data/witnesses"), naturals }), []);
  assert.equal(SECTIONS[0].id, "featured");
  assert.equal(SECTIONS[0].title, "Featured");
  assert.equal(SECTIONS[0].colours, null);
  // five cards: the three examples of the answer, then the second and the first in their other region type
  assert.deepEqual(gallery.featured.map((c) => [c.label || c.file, c.colour]), [
    ["genus100_green", 1], ["genus0_hexagon_red", -1], ["star_genus0", 0], ["genus0_hexagon_green", 1], ["genus100_red", -1],
  ]);
  const g = { cards: gallery.featured.slice(0, 3) };
  assert.deepEqual(g.cards.map((c) => [c.kind, c.label || c.file]), [["token", "genus100_green"], ["token", "genus0_hexagon_red"], ["witness", "star_genus0"]]);
  const want = [
    { colour: 1, caption: "541 cells | genus 100 | x 10437 digits" },
    { colour: -1, caption: "541 cells | genus 0 | x 11586 digits" },
    { colour: 0, caption: "433 cells | genus 0 | x 656 digits" },
  ];
  g.cards.forEach((c, k) => {
    const f = factsOf(c);
    assert.equal(f.colour, want[k].colour, `card ${k}`);
    assert.equal(f.facts.genus, c.genus, `card ${k}`);
    assert.equal(f.facts.area, c.area, `card ${k}`);
    assert.equal(captionText(c, f.facts), want[k].caption, `card ${k}`);
  });
  assert.equal(cardHref(g.cards[2]), "#/explore?w=star_genus0");
  // each of them is shown once on the page (no other card refers to the same token or file)
  const others = gallery.featured.slice(3).concat(gallery.found);
  assert.equal(others.filter((c) => c.label === "genus100_green" || c.label === "genus0_hexagon_red" || c.file === "star_genus0").length, 0);
  assert.equal(Object.keys(tokens).filter((k) => k === "genus100_green" || k === "genus0_hexagon_red").length, 2);
});
