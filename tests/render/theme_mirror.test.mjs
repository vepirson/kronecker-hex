// The theme values that src/render/hex_canvas.mjs mirrors from styles/base.css (for use outside a browser and for
// missing variables): THEMES, PALETTES and DARK_FILLS equal the variables of the stylesheet, read from its text.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { THEMES, PALETTES, DARK_FILLS } from "../../src/render/hex_canvas.mjs";

const css = fs.readFileSync(new URL("../../styles/base.css", import.meta.url), "utf8");

// vars(selector) is the custom properties of the first rule whose selector starts with selector
function vars(selector) {
  const k = css.indexOf(`${selector} {`);
  assert.ok(k >= 0, selector);
  const body = css.slice(k, css.indexOf("}", k));
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const themeOf = (v) => ({ canvas: v.canvas, outline: v.outline, pending: v.pending, empty: v.empty, text: v.text, softTo: v["soft-to"], softFraction: Number(v.soft) });
const fillsOf = (v) => ({ "-1": v["fill-red"], 0: v["fill-blue"], 1: v["fill-green"] });

test("THEMES, PALETTES and DARK_FILLS of the hex canvas equal the variables of styles/base.css", () => {
  const light = vars(":root");
  const dark = vars(':root[data-theme="dark"]');
  const cb = vars(':root[data-palette="colourblind"]');
  assert.deepEqual(themeOf(light), { ...THEMES.light });
  assert.deepEqual(themeOf(dark), { ...THEMES.dark });
  assert.deepEqual(fillsOf(light), { ...PALETTES.standard });
  assert.deepEqual(fillsOf(dark), { ...DARK_FILLS });
  assert.deepEqual(fillsOf(cb), { ...PALETTES.colourblind });
  // the page without a chosen theme is light whatever the system prefers: no rule of the stylesheet reads the
  // system's colour scheme
  assert.equal(css.includes("prefers-color-scheme"), false);
  assert.equal(css.includes(':root:not([data-theme="light"])'), false);
});
