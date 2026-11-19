// The outline of the checked rows on the Check step (verifiedOutline of src/ui/pages/lab/step7.mjs): the accent colour
// of the timeline's progress (--select of styles/base.css) at the width of a selected region's outline, over a halo
// in the theme's outline colour. On every fill, full and soft, in both themes and both palettes, the line or its halo
// reaches a contrast of 3 to 1 (WCAG 2 relative luminance), the rule of the site's marks. The drawn overlay uses
// outline() itself: its line has the default width of outline(), its halo is OUTLINE_HALO px wider on each side.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { PALETTES, THEMES, DARK_FILLS } from "../../src/render/hex_canvas.mjs";
import { softFillsOf, OUTLINE_HALO } from "../../src/render/overlays.mjs";
import { verifiedOutline, VERIFIED_COLOUR_VAR } from "../../src/ui/pages/lab/step7.mjs";

function luminance(hex) {
  const lin = (k) => {
    const c = parseInt(hex.slice(k, k + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// the accent of each theme in styles/base.css: the light one first, then the dark one (by choice)
const css = fs.readFileSync(new URL("../../styles/base.css", import.meta.url), "utf8");
const accents = [...css.matchAll(/--select:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());

test("the checked rows' outline: the accent or its dark halo at 3 to 1 on every fill, full and soft, both themes, both palettes", (t) => {
  assert.equal(VERIFIED_COLOUR_VAR, "--select");
  assert.equal(accents.length, 2);
  const accentOf = { light: accents[0], dark: accents[1] };
  const fillsOf = (theme, palette) => (palette === "colourblind" ? PALETTES.colourblind : theme === "dark" ? DARK_FILLS : PALETTES.standard);
  let worst = Infinity;
  let accentFails = 0;
  for (const theme of ["light", "dark"]) {
    const th = THEMES[theme];
    for (const palette of ["standard", "colourblind"]) {
      const full = fillsOf(theme, palette);
      const soft = softFillsOf({ fills: full, softTo: th.softTo, softFraction: th.softFraction });
      for (const c of [...Object.values(full), ...Object.values(soft)]) {
        const line = contrast(accentOf[theme], c);
        const halo = contrast(th.outline, c);
        if (line < 3) accentFails++;
        worst = Math.min(worst, Math.max(line, halo));
        t.diagnostic(`${theme} ${palette} on ${c}: accent ${accentOf[theme]} ${line.toFixed(2)}, halo ${th.outline} ${halo.toFixed(2)}`);
        assert.ok(Math.max(line, halo) >= 3, `${theme} ${palette}: on ${c}: accent ${line.toFixed(2)}, halo ${halo.toFixed(2)}`);
      }
    }
  }
  // the halo is needed: the accent alone fails somewhere
  assert.ok(accentFails > 0);
  t.diagnostic(`smallest contrast of the better colour: ${worst.toFixed(2)}`);
});

test("the checked rows' outline is drawn by outline(): the line at its default width in the accent, the halo wider in the theme's outline colour", () => {
  globalThis.document ??= {};
  // a path that only records nothing: the canvas of Node has no Path2D
  globalThis.Path2D ??= class { moveTo() {} lineTo() {} };
  const saved = { gcs: globalThis.getComputedStyle, root: globalThis.document.documentElement };
  globalThis.document.documentElement = {};
  globalThis.getComputedStyle = () => ({ getPropertyValue: (v) => (v === "--select" ? " #7a3cc8" : "") });
  try {
    const strokes = [];
    const ctx = { lineWidth: 1, strokeStyle: "", lineCap: "", stroke() { strokes.push([this.strokeStyle, this.lineWidth]); } };
    const view = { R: 10, cell: 20, colours: { outline: "#111111", canvas: "#ffffff", text: "#1d1d1b" }, toScreen: (i, j) => [100 + 20 * i, 100 + 17 * j] };
    const o = verifiedOutline([[0, 0], [1, 0]]);
    assert.deepEqual([o.id, o.layer], ["verified", 45]);
    o.draw(ctx, view);
    // outline() of no cell strokes nothing visible but sets the default width: max(1.5, 0.14 cell) = 2.8 here
    const w = Math.max(1.5, view.cell * 0.14);
    assert.deepEqual(strokes.slice(1), [["#111111", w + 2 * OUTLINE_HALO], ["#7a3cc8", w]]);
  } finally {
    globalThis.getComputedStyle = saved.gcs;
    globalThis.document.documentElement = saved.root;
  }
});
