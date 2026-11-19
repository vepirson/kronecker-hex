// The names of the shapes as a visitor reads them: the two families are named as in the Gallery, a formula
// (typeset by KaTeX) where the element holds markup and a plain form without TeX braces where only text is possible
// (a tooltip, an option, a status sentence), the compact shapes in words. No raw TeX source such as "^{" is left
// outside a formula in the presets, the box "any genus", the Gallery headings or the strings of the page code.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import * as model from "../../src/ui/pages/lab/model.mjs";
import { splitMath, texToHtml } from "../../src/ui/widgets/math.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

// a text that may hold $...$ formulas: every formula typesets, the text around them has no TeX source
function checkMathText(t, what) {
  const parts = splitMath(t);
  for (const p of parts) {
    if (p.type === "math") assert.equal(texToHtml(p.tex, false).ok, true, `${what}: ${p.tex}`);
    else assert.equal(/\^\{|_\{|\\pm|[{}$]/.test(p.value), false, `${what}: ${JSON.stringify(p.value)}`);
  }
  return parts.filter((p) => p.type === "math").length;
}

// a plain text: no formula, no TeX source, no name that no page defines
function checkPlain(t, what) {
  assert.equal(/\^\{|[{}$\\]/.test(t), false, `${what}: ${JSON.stringify(t)}`);
  assert.equal(/\bC_100?\b/.test(t), false, `${what}: ${JSON.stringify(t)}`);
}

test("familyName gives the name of a family member as a formula and in plain words", () => {
  assert.deepEqual({ ...model.familyName("s", 3) }, { tex: "S_{3}^{\\pm1}", text: "S_3 (type +-1)" });
  assert.deepEqual({ ...model.familyName("z", 12) }, { tex: "S_{12}^{0}", text: "S_12 (type 0)" });
  assert.deepEqual({ ...model.familyName("s", "g") }, { tex: "S_{g}^{\\pm1}", text: "S_g (type +-1)" });
  for (const f of ["s", "z"]) for (const g of [1, 25, "g"]) {
    assert.equal(texToHtml(model.familyName(f, g).tex).ok, true);
    checkPlain(model.familyName(f, g).text, `${f} ${g}`);
  }
});

test("the presets: plain title and menu text, typeset forms, the compact shapes in words", () => {
  for (const p of model.LAB_PRESETS) {
    checkPlain(p.title, `${p.name} title`);
    checkPlain(p.short, `${p.name} short`);
    const n = checkMathText(p.titleTex, `${p.name} titleTex`);
    assert.equal(checkMathText(p.shortTex, `${p.name} shortTex`), n);
    assert.equal(n, p.family ? 1 : 0, p.name);
  }
  const byName = Object.fromEntries(model.LAB_PRESETS.map((p) => [p.name, p]));
  assert.deepEqual([byName.s1.title, byName.s1.titleTex, byName.s1.short, byName.s1.shortTex], ["S_1 (type +-1), genus 1", "$S_{1}^{\\pm1}$, genus 1", "S_1 (type +-1)", "$S_{1}^{\\pm1}$"]);
  assert.deepEqual([byName.z10.title, byName.z10.titleTex], ["S_10 (type 0), genus 10", "$S_{10}^{0}$, genus 10"]);
  assert.deepEqual([byName.c10.title, byName.c10.short, byName.c100.title, byName.c100.short],
    ["compact shape, genus 10", "compact shape, genus 10", "compact shape, genus 100", "compact shape, genus 100"]);
});

test("the colour check and the box any genus: the start panel's sentence typesets, the plain sentence has no TeX", () => {
  for (const p of model.LAB_PRESETS.filter((x) => x.family)) {
    for (const colour of ["green", "red", "blue"]) {
      const plan = model.resolvePreset(p.name, colour);
      if (!plan.blocked) continue;
      assert.equal(checkMathText(plan.blocked.text, `${p.name} ${colour}`), 1);
      checkPlain(plan.blocked.plain, `${p.name} ${colour} plain`);
    }
  }
  assert.equal(checkMathText(model.genusLimitsText(), "limits"), 2);
  // the first genus above each limit of the box (GENUS_LIMITS 70 and 1200), and one far above
  for (const [g, colour] of [[71, "green"], [9999, "red"], [1201, "blue"]]) {
    const plan = model.resolveGenus(String(g), colour);
    assert.ok(plan.blocked, `${g} ${colour}`);
    checkPlain(plan.name, "name");
    assert.equal(checkMathText(plan.nameTex, "nameTex"), 1);
    assert.equal(checkMathText(plan.blocked.text, `${g} ${colour}`), 2);
    checkPlain(plan.blocked.plain, `${g} ${colour} plain`);
    assert.equal(model.resolveInput({ query: { genus: String(g), colour } }).problem, plan.blocked.text);
  }
  checkPlain(model.resolveGenus("3", "green").name, "g 3 name");
  assert.equal(model.presetTitle(model.resolveGenus("3", "green").name), "S_3 (type +-1)");
});

test("the Gallery's section titles typeset, with no TeX source outside a formula", async () => {
  const { SECTIONS } = await import("../../src/ui/gallery/model.mjs");
  const titles = SECTIONS.map((g) => g.title);
  let n = 0;
  for (const t of titles) n += checkMathText(t, t);
  assert.equal(n, 5);
  assert.ok(titles.includes("$S_{g}^{\\pm1}$, genus 1 to 25") && titles.includes("$S_{g}^{0}$, genus 1 to 25"));
});

test("the code of the pages writes no family name as raw TeX source and no undefined name C_10 or C_100", () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(new URL(`../../src/${dir}`, import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}${e.name}/`);
      else if (e.name.endsWith(".mjs")) files.push(`src/${dir}${e.name}`);
    }
  };
  walk("ui/");
  const bad = [];
  for (const rel of files) {
    const code = read(rel).replace(/\/\/[^\n]*/g, "");
    if (/S_[0-9g$]*\^\{\+-1\}|\^\{\+-1\}|\bC_100?\b/.test(code)) bad.push(rel);
  }
  assert.deepEqual(bad, []);
});
