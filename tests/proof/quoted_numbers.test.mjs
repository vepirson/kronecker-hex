// The numbers quoted in the texts: the proof fragments (content/proof/*.html) against the facts computed here from
// the data files. Every number of the last section's text is accounted for, so a changed or an added number fails a
// test.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { genusOfCells, holeCount } from "../../src/core/regions.mjs";
import { primesUpTo } from "../../src/core/primes.mjs";
import { WEIL_THRESHOLDS } from "../../src/ui/widgets/weil_plot.mjs";

const readText = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
const readJson = (rel) => JSON.parse(readText(rel));
// the visible text of an HTML fragment (tags and their attributes removed)
const visible = (html) => html.replace(/<[^>]*>/g, " ");
// the numbers of a text, not counting subscripts such as the 0 of x_0
const numbersIn = (text) => [...text.matchAll(/(?<![_\w])\d+/g)].map((m) => Number(m[0]));
const one = (text, re, what) => {
  const m = [...text.matchAll(re)];
  assert.equal(m.length, 1, `${what}: expected exactly one match of ${re}, found ${m.length}`);
  return Number(m[0][1]);
};
const shapeFacts = (shape) => ({
  area: shape.length,
  genus: genusOfCells(shape).genus,
  holes: holeCount(shape),
  columns: new Set(shape.map(([i]) => i)).size,
});

test("proof, last section: genus, cells, P and columns of the Lab's compact shape, every number accounted for", () => {
  const html = readText("content/proof/06_numbers.html");
  const text = visible(html);
  // the shape of the Lab preset the text links to
  const links = [...html.matchAll(/#\/algorithm\?preset=([a-z0-9]+)/g)].map((m) => m[1]);
  assert.deepEqual(links, ["c100"]);
  const { shape } = readJson("data/shapes/c100.json");
  const f = shapeFacts(shape);
  const genus = one(text, /genus \$(\d+)\$/g, "genus");
  const cells = one(text, /\$(\d+)\$ cells/g, "cells");
  const P = one(text, /\$P=(\d+)\$/g, "P");
  const columns = one(text, /\$(\d+)\$ columns/g, "columns");
  const lemma = one(text, /Lemma (\d+)/g, "lemma");
  assert.equal(genus, f.genus, `genus ${genus} in the text, ${f.genus} computed`);
  assert.equal(genus, f.holes);
  assert.equal(cells, f.area, `${cells} cells in the text, ${f.area} computed`);
  assert.equal(columns, f.columns, `${columns} columns in the text, ${f.columns} computed`);
  // "lies in a sieved set with P": P is prime and the shape misses a class modulo every prime p <= P, and Lemma 10
  // needs at most P columns
  assert.ok(primesUpTo(P).includes(P), `P = ${P} is prime`);
  for (const p of primesUpTo(P)) {
    const seen = new Set(shape.map(([i, j]) => (((i % p) + p) % p) * p + (((j % p) + p) % p)));
    assert.ok(seen.size < p * p, `the shape misses a class modulo ${p}`);
  }
  assert.ok(f.columns <= P);
  // the lemma quoted is the lemma on sieved sets
  assert.match(readText("content/proof/05_compact.html"), new RegExp(`<b>Lemma ${lemma} \\(sieved sets are admissible\\)`));
  // every number of the visible text is one of the above
  assert.deepEqual(numbersIn(text).sort((a, b) => a - b), [genus, cells, P, columns, lemma].sort((a, b) => a - b));
});

test("proof: the thresholds 7, 19, 59, 197 quoted for m = 2 .. 5 and the limit 6 / pi^2 of the sieve density", () => {
  const t3 = visible(readText("content/proof/03_sufficiency.html"));
  const m = t3.match(/for \$m=(\d+),(\d+),(\d+),(\d+)\$ consecutive cells .*? from \$(\d+)\$, \$(\d+)\$, \$(\d+)\$, \$(\d+)\$ on/);
  assert.ok(m, "the sentence with the thresholds");
  const ks = m.slice(1, 5).map(Number);
  const qs = m.slice(5, 9).map(Number);
  assert.deepEqual(ks, [2, 3, 4, 5]);
  assert.deepEqual(qs, ks.map((k) => WEIL_THRESHOLDS[k]));
  const t5 = visible(readText("content/proof/05_compact.html"));
  const d = t5.match(/6\/\\pi\^\{2\}=(0\.\d+)\\ldots/);
  assert.ok(d, "the limit of the density");
  assert.equal(d[1], (Math.floor((6 / Math.PI ** 2) * 10 ** (d[1].length - 2)) / 10 ** (d[1].length - 2)).toFixed(d[1].length - 2));
});

test("proof: every Theorem, Lemma and Corollary quoted is defined once, numbered 1, 2, 3 ... in page order", () => {
  const files = fs.readdirSync(new URL("../../content/proof/", import.meta.url)).filter((n) => n.endsWith(".html")).sort();
  const all = files.map((n) => readText(`content/proof/${n}`)).join("\n");
  const defined = [...all.matchAll(/<b>(Theorem|Lemma|Corollary) (\d+)/g)].map((m) => [m[1], Number(m[2])]);
  assert.deepEqual(defined.map(([, n]) => n), defined.map((_, k) => k + 1));
  const kindOf = new Map(defined.map(([kind, n]) => [n, kind]));
  for (const m of visible(all).matchAll(/(Theorem|Lemma|Corollary) (\d+)/g)) {
    const n = Number(m[2]);
    assert.equal(kindOf.get(n), m[1], `${m[1]} ${n} is quoted, defined: ${kindOf.get(n) || "nothing"} ${n}`);
  }
});
