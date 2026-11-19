// The notation of the section on sufficiency of the Proof page: one meaning per letter (the count of the lemma on
// sign patterns is A, N is the neighbour set), the figures lettered in page order, and the code of the figures
// naming them with the same letters.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { notationProblems } from "./notation_checks.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("section 3 of the Proof page: the count A, N only as N(S), figures A and B in page order", () => {
  assert.deepEqual(notationProblems(read("content/proof/03_sufficiency.html")), []);
});

test("the checks fire on the old notation", () => {
  const html = read("content/proof/03_sufficiency.html");
  const old = html.replace("let $A$ be the number", "let $N$ be the number");
  assert.ok(notationProblems(old).some((p) => p.startsWith("N alone")));
  const swapped = html.replace("<b>Figure A.</b>", "<b>Figure X.</b>").replace("<b>Figure B.</b>", "<b>Figure A.</b>").replace("<b>Figure X.</b>", "<b>Figure B.</b>");
  assert.ok(notationProblems(swapped).some((p) => p.startsWith("figure letters")));
});

test("the code of the figures names them with the letters of the page", () => {
  assert.match(read("src/ui/pages/proof.mjs"), /figure B: the factors of a cell/);
  assert.match(read("src/ui/widgets/weil_plot.mjs"), /its figure A/);
  assert.equal(/\bN >= q/.test(read("src/ui/widgets/weil_plot.mjs")), false);
});
