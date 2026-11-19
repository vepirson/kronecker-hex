// Tests of the math typesetting helper and of the article text: the delimiters are found, a bad formula does not
// throw, KaTeX (run here in Node) typesets every formula of every section, and the text keeps the writing rules
// (ASCII, braced exponents, no thin space, no semicolon in the prose, no claim the page must not make).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { splitMath, texToHtml, KATEX_VERSION } from "../../src/ui/widgets/math.mjs";
import { SECTIONS } from "../../src/ui/pages/proof.mjs";

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const textOf = (html) => decode(html.replace(/<[^>]*>/g, " "));

test("splitMath finds inline and display formulas and keeps the rest as text", () => {
  assert.deepEqual(splitMath("a $x$ b"), [{ type: "text", value: "a " }, { type: "math", tex: "x", display: false }, { type: "text", value: " b" }]);
  assert.deepEqual(splitMath("$$y^{2}$$"), [{ type: "math", tex: "y^{2}", display: true }]);
  assert.deepEqual(splitMath("costs \\$5 and $a$"), [{ type: "text", value: "costs $5 and " }, { type: "math", tex: "a", display: false }]);
  assert.deepEqual(splitMath("one $ alone"), [{ type: "text", value: "one $ alone" }]);
  assert.deepEqual(splitMath("$\\$$"), [{ type: "math", tex: "\\$", display: false }]);
  assert.deepEqual(splitMath("$a$$b$"), [{ type: "math", tex: "a", display: false }, { type: "math", tex: "b", display: false }]);
  assert.deepEqual(splitMath("no math"), [{ type: "text", value: "no math" }]);
  assert.deepEqual(splitMath("$$ $$"), [{ type: "text", value: "$$ $$" }]);
});

test("texToHtml typesets with the vendored KaTeX and never throws on a bad formula", () => {
  assert.match(KATEX_VERSION, /^0\.16\.\d+$/);
  const version = JSON.parse(read("../../vendor/katex/VERSION.json")).version;
  assert.equal(KATEX_VERSION, version);
  const ok = texToHtml("\\left(\\frac xd\\right)", false);
  assert.equal(ok.ok, true);
  assert.match(ok.html, /katex/);
  for (const bad of ["\\frac{", "x^", "\\undefinedmacro{1}", "}"]) {
    let r;
    assert.doesNotThrow(() => { r = texToHtml(bad, false); });
    assert.equal(r.ok, false);
    assert.ok(r.error.length > 0);
  }
});

test("every formula of every section typesets", () => {
  let n = 0;
  for (const s of SECTIONS) {
    const html = read(`../../content/proof/${s.file}`);
    for (const seg of splitMath(textOf(html))) {
      if (seg.type !== "math") continue;
      n++;
      const r = texToHtml(seg.tex, seg.display);
      assert.equal(r.ok, true, `${s.file}: ${seg.tex}: ${r.error}`);
    }
  }
  assert.ok(n > 200, `${n} formulas`);
});

test("the article keeps the writing rules", () => {
  for (const s of SECTIONS) {
    const html = read(`../../content/proof/${s.file}`);
    assert.ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(html), `${s.file}: ASCII only`);
    assert.ok(!html.includes("\\,"), `${s.file}: no thin space`);
    for (const seg of splitMath(textOf(html))) {
      if (seg.type === "math") {
        assert.ok(!/\^[A-Za-z0-9]/.test(seg.tex), `${s.file}: braced exponent in ${seg.tex}`);
      } else {
        assert.ok(!seg.value.includes(";"), `${s.file}: semicolon in the prose: ${seg.value.slice(0, 80)}`);
        assert.ok(!/\b(largest possible|smallest possible|optimal|minimal area|infinite region|we believe)\b/i.test(seg.value), `${s.file}: forbidden claim`);
      }
    }
  }
});

test("the vendored KaTeX files match their recorded sha256", async () => {
  const { createHash } = await import("node:crypto");
  const info = JSON.parse(read("../../vendor/katex/VERSION.json"));
  const names = Object.keys(info.files);
  assert.ok(names.includes("katex.mjs") && names.includes("katex.min.css") && names.includes("LICENSE"));
  assert.ok(names.filter((n) => n.endsWith(".woff2")).length >= 20);
  for (const [name, { sha256, bytes }] of Object.entries(info.files)) {
    const buf = fs.readFileSync(fileURLToPath(new URL(`../../vendor/katex/${name}`, import.meta.url)));
    assert.equal(buf.length, bytes, name);
    assert.equal(createHash("sha256").update(buf).digest("hex"), sha256, name);
  }
  // every woff2 font the stylesheet names first is vendored
  const css = read("../../vendor/katex/katex.min.css");
  for (const m of css.matchAll(/url\((fonts\/[^)]+\.woff2)\)/g)) assert.ok(names.includes(m[1]), m[1]);
});
