// Formulas of the Construction Lab: every $...$ of both content files (steps 0 to 4, steps 5 to 7 with the extras)
// is typeset by the vendored KaTeX without error, no dollar sign is left without its partner, the old plain-text
// notation (<span class="math">) is gone, and the panels that steps 0 to 4 build (rendered here with a DOM-free stand-in
// for the page's kit, on every position of S_3 green) carry only formulas that typeset. The page typesets the panel
// with renderMathIn, which works on one text node at a time, so every string child and every piece of an html string
// between two tags is checked on its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { splitMath, texToHtml } from "../../src/ui/widgets/math.mjs";
import { runToEnd } from "../../src/construct/pipeline.mjs";
import { buildLabView } from "../../src/construct/lab_view.mjs";
import { shapeS, seedS } from "../../src/core/shapes.mjs";
import * as step0 from "../../src/ui/pages/lab/step0.mjs";
import * as step1 from "../../src/ui/pages/lab/step1.mjs";
import * as step2 from "../../src/ui/pages/lab/step2.mjs";
import * as step3 from "../../src/ui/pages/lab/step3.mjs";
import * as step4 from "../../src/ui/pages/lab/step4.mjs";
import { runToEnd as runToEndAny } from "../../src/construct/index.mjs";
import { buildBlueView } from "../../src/construct/blue/lab_view.mjs";
import { shapeZ, seedZ } from "../../src/core/shapes.mjs";
import * as blue0 from "../../src/ui/pages/lab/blue/step0.mjs";
import * as blue1 from "../../src/ui/pages/lab/blue/step1.mjs";
import * as blue2 from "../../src/ui/pages/lab/blue/step2.mjs";
import * as blue3 from "../../src/ui/pages/lab/blue/step3.mjs";
import * as blue4 from "../../src/ui/pages/lab/blue/step4.mjs";

const readJson = (rel) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));
const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// textPieces(html): the texts between the tags of an html string (each one becomes its own text node in the page)
const textPieces = (html) => html.split(/<[^>]*>/).map(decode).filter((t) => t !== "");

// checkText(where, text, out): every formula of text typesets, no lone dollar sign remains
function checkText(where, text, out) {
  const parts = splitMath(text);
  for (const p of parts) {
    if (p.type === "math") {
      out.formulas++;
      const r = texToHtml(p.tex, p.display);
      if (!r.ok) out.bad.push(`${where}: ${JSON.stringify(p.tex)}: ${r.error}`);
      if (p.tex.includes("\\,")) out.bad.push(`${where}: thin space in ${JSON.stringify(p.tex)}`);
      if (/\^[0-9a-zA-Z]{2,}/.test(p.tex)) out.bad.push(`${where}: unbraced exponent in ${JSON.stringify(p.tex)}`);
    } else if (p.value.includes("$")) {
      out.bad.push(`${where}: a dollar sign without its partner in ${JSON.stringify(p.value)}`);
    }
  }
}

test("content files: every formula typesets with KaTeX, no raw dollar sign, no plain-text math spans", () => {
  // the texts are one sentence or two per step, in the words of the answer (39, 22 and 34 formulas)
  for (const [file, minFormulas] of [["steps0_4.json", 39], ["steps5_7.json", 22], ["blue_steps.json", 34]]) {
    const text = readJson(`../../content/lab/${file}`);
    const out = { formulas: 0, bad: [] };
    for (const [id, html] of Object.entries(text)) {
      assert.equal(/class="math"/.test(html), false, `${file} ${id}: plain-text math span`);
      for (const piece of textPieces(html)) checkText(`${file} ${id}`, piece, out);
    }
    assert.deepEqual(out.bad, [], file);
    assert.ok(out.formulas >= minFormulas, `${file}: ${out.formulas} formulas`);
  }
});

// A DOM-free stand-in for the kit of the Lab page: h builds plain nodes, the canvas calls are recorded and ignored.
function fakeNode(tag, attrs, children) {
  const node = { tag, attrs: attrs || {}, children: [], dataset: {} };
  const add = (c) => {
    if (c === null || c === undefined || c === false || c === true) return;
    if (Array.isArray(c)) c.forEach(add);
    else node.children.push(c);
  };
  children.forEach(add);
  node.append = (...more) => more.forEach(add);
  node.replaceChildren = (...more) => {
    node.children = [];
    more.forEach(add);
  };
  return node;
}
const fakeKit = (content) => ({
  h: (tag, attrs, ...children) => fakeNode(tag, attrs, children),
  text: (id) => (Object.prototype.hasOwnProperty.call(content, id) ? content[id] : ""),
  bigNumber: () => ({ parts: {}, update() {} }),
  hex: { setSource() {}, setOverlays() {}, fit() {}, onCellHover: () => () => {}, onCellClick: () => () => {} },
  table: { highlight() {}, onLineClick: () => () => {} },
  result: null,
});

// walk(node, where, out): check every string child and every html attribute of the tree
function walk(node, where, out) {
  if (typeof node === "string" || typeof node === "number") {
    checkText(where, String(node), out);
    return;
  }
  if (node.attrs && typeof node.attrs.html === "string") for (const piece of textPieces(node.attrs.html)) checkText(`${where} (html)`, piece, out);
  for (const c of node.children) walk(c, where, out);
}

test("steps 0 to 4 on every position of S_3 green: every formula in the panel typesets, no raw dollar sign", () => {
  const content = readJson("../../content/lab/steps0_4.json");
  const { events, result } = runToEnd({ shape: shapeS(3), seed: seedS(3), colour: 1, lift: 1 });
  assert.equal(result.pass, true);
  const view = buildLabView(events);
  const kit = fakeKit(content);
  const out = { formulas: 0, bad: [] };
  let positions = 0;
  const conds = new Set();
  for (const [k, m] of [step0, step1, step2, step3, step4].entries()) {
    for (let sub = 0; sub <= m.subCount(view); sub++) {
      const panel = fakeNode("section", null, []);
      m.render(panel, view, sub, kit);
      walk(panel, `step ${k} sub ${sub}`, out);
      positions++;
      const scan = (n) => {
        if (typeof n !== "object" || n === null) return;
        if (n.attrs && (n.attrs.class === "lab-cond" || n.attrs.class === "lab-focus-head")) conds.add(`${k}:${n.children.filter((c) => typeof c === "string").join("")}`);
        n.children.forEach(scan);
      };
      scan(panel);
    }
  }
  assert.deepEqual(out.bad.slice(0, 5), []);
  assert.ok(positions > 40, `${positions} positions`);
  assert.ok(out.formulas > 200, `${out.formulas} formulas`);
  // the conditions that steps 1, 3 and 4 write themselves are TeX now
  assert.ok([...conds].some((c) => /^1:\$x\\equiv -\d+ \\pmod\{\d+\}\$/.test(c)), "step 1 condition");
  assert.ok([...conds].some((c) => /^3:\$d\\equiv -?\d+ \\pmod\{q_1 q_2\}\$/.test(c)), "step 3 condition");
  assert.ok([...conds].some((c) => /^4:row j = -?\d+: \$d([+-]\d+)?=u_jq_1q_2c_j\$/.test(c)), "step 4 factorisation");
});

test("blue steps 0 to 4 on every position of Z_3 and of Z_2: every formula in the panel typesets, no raw dollar sign", () => {
  const content = readJson("../../content/lab/blue_steps.json");
  const kit = fakeKit(content);
  const out = { formulas: 0, bad: [] };
  let positions = 0;
  for (const g of [2, 3]) {
    const { events, result } = runToEndAny({ shape: shapeZ(g), seed: seedZ(g), colour: 0 });
    assert.equal(result.pass, true);
    const view = buildBlueView(events);
    for (const [k, m] of [blue0, blue1, blue2, blue3, blue4].entries()) {
      for (let sub = 0; sub <= m.subCount(view); sub++) {
        const panel = fakeNode("section", null, []);
        m.render(panel, view, sub, kit);
        walk(panel, `Z_${g} blue step ${k} sub ${sub}`, out);
        positions++;
      }
    }
  }
  assert.deepEqual(out.bad.slice(0, 5), []);
  assert.ok(positions > 60, `${positions} positions`);
  assert.ok(out.formulas > 100, `${out.formulas} formulas`);
});
