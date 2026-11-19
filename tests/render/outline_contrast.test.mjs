// The outline of a shown region against the three full fills: a contrast of at least 3 to 1 (WCAG 2 relative
// luminance) in both themes and both palettes, computed from the palette constants of src/render/hex_canvas.mjs,
// the outline colours of styles/base.css equal to those constants, and the cell marker and the hollow mark against
// every fill.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { PALETTES, THEMES, DARK_FILLS } from "../../src/render/hex_canvas.mjs";
import { softFillsOf, lighterOf, haloOf, haloNeeded, contrastOf, MARKER_EDGE, HOLLOW_LINE, HOLLOW_HALO, OUTLINE_HALO } from "../../src/render/overlays.mjs";

// relative luminance of a colour #rrggbb
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

test("contrast helper on known pairs", () => {
  assert.equal(contrast("#000000", "#ffffff"), 21);
  assert.equal(contrast("#777777", "#777777"), 1);
  assert.ok(Math.abs(contrast("#767676", "#ffffff") - 4.54) < 0.01);
});

test("the region outline has a contrast of at least 3 to 1 against each full fill, both themes, both palettes", (t) => {
  const fillsOf = (theme, palette) => (palette === "colourblind" ? PALETTES.colourblind : theme === "dark" ? DARK_FILLS : PALETTES.standard);
  for (const theme of ["light", "dark"]) {
    for (const palette of ["standard", "colourblind"]) {
      const outline = THEMES[theme].outline;
      const fills = fillsOf(theme, palette);
      const ratios = Object.fromEntries(["-1", "0", "1"].map((s) => [s, Math.round(contrast(outline, fills[s]) * 100) / 100]));
      t.diagnostic(`${theme} ${palette}: outline ${outline}, contrast against red ${ratios["-1"]}, blue ${ratios["0"]}, green ${ratios["1"]}`);
      for (const s of ["-1", "0", "1"]) assert.ok(contrast(outline, fills[s]) >= 3, `${theme} ${palette}: outline ${outline} against ${fills[s]} is ${ratios[s]}`);
    }
  }
});

// The cell marker is a small hexagon in the theme's text colour (its body) with an edge of MARKER_EDGE px in the
// canvas colour. No single body colour reaches 3 to 1 against both the full and the soft fills of the dark theme, so
// the marker reads by the better of its two colours. The rule: against every fill, full and soft, in both themes and
// both palettes, the body or the edge reaches 3 to 1 AS DRAWN. This test checks it on the palette constants, which
// holds as drawn only when the edge shows its own colour on at least one whole device pixel: a 1 px line centred on
// the hexagon's sides is spread over two antialiased pixels at device pixel ratio 1 (measured: 2.3 to 2.8 against the
// full dark fills), so the edge must be at least 2 px. The drawn pixels themselves are read by a browser check.
test("the cell marker against every fill, full and soft, both themes, both palettes: body or edge at least 3 to 1", (t) => {
  assert.ok(MARKER_EDGE >= 2, `marker edge ${MARKER_EDGE} px`);
  const fillsOf = (theme, palette) => (palette === "colourblind" ? PALETTES.colourblind : theme === "dark" ? DARK_FILLS : PALETTES.standard);
  let worst = Infinity;
  for (const theme of ["light", "dark"]) {
    const th = THEMES[theme];
    assert.ok(contrast(th.text, th.canvas) >= 3, `${theme}: body ${th.text} against edge ${th.canvas}`);
    for (const palette of ["standard", "colourblind"]) {
      const full = fillsOf(theme, palette);
      const soft = softFillsOf({ fills: full, softTo: th.softTo, softFraction: th.softFraction });
      for (const [look, fills] of [["full", full], ["soft", soft]]) {
        for (const s of ["-1", "0", "1"]) {
          const body = contrast(th.text, fills[s]);
          const edge = contrast(th.canvas, fills[s]);
          worst = Math.min(worst, Math.max(body, edge));
          t.diagnostic(`${theme} ${palette} ${look} ${fills[s]}: body ${th.text} ${body.toFixed(2)}, edge ${th.canvas} ${edge.toFixed(2)}`);
          assert.ok(Math.max(body, edge) >= 3, `${theme} ${palette} ${look}: marker against ${fills[s]}: body ${body.toFixed(2)}, edge ${edge.toFixed(2)}`);
        }
      }
    }
  }
  t.diagnostic(`smallest contrast of the better marker colour: ${worst.toFixed(2)}`);
});

// The hollow mark of a fix cell is a line in the theme's text colour with a halo in the canvas colour, both at least
// 2 px across (whole device pixels of their own colour), drawn on a filled cell (remove it) or on an empty cell (add
// it). The same rule as the marker: on every fill, full and soft, and on the empty colour, in both themes and both
// palettes, the line or the halo reaches 3 to 1.
test("the hollow mark against every fill and the empty colour, both themes, both palettes: line or halo at least 3 to 1", (t) => {
  assert.ok(HOLLOW_LINE >= 2 && HOLLOW_HALO >= 2, `line ${HOLLOW_LINE} px, halo ${HOLLOW_HALO} px`);
  const fillsOf = (theme, palette) => (palette === "colourblind" ? PALETTES.colourblind : theme === "dark" ? DARK_FILLS : PALETTES.standard);
  let worst = Infinity;
  for (const theme of ["light", "dark"]) {
    const th = THEMES[theme];
    for (const palette of ["standard", "colourblind"]) {
      const full = fillsOf(theme, palette);
      const soft = softFillsOf({ fills: full, softTo: th.softTo, softFraction: th.softFraction });
      const under = [...Object.values(full), ...Object.values(soft), th.empty];
      for (const c of under) {
        const line = contrast(th.text, c);
        const halo = contrast(th.canvas, c);
        worst = Math.min(worst, Math.max(line, halo));
        assert.ok(Math.max(line, halo) >= 3, `${theme} ${palette}: hollow mark on ${c}: line ${line.toFixed(2)}, halo ${halo.toFixed(2)}`);
      }
    }
  }
  t.diagnostic(`smallest contrast of the better colour of the hollow mark: ${worst.toFixed(2)}`);
});

// The outline of the shape editor is drawn with the halo "auto" (style.halo of outline): the dark line of the theme
// and, only where haloNeeded of the theme says the plain line does not reach 3 to 1 against the empty grid,
// OUTLINE_HALO px on each side in haloOf its colours (the lighter of canvas and text, never the text colour). So the
// light theme draws the Explorer's plain line and the dark theme keeps the halo. The line sits on the edge between a
// cell of the shape (a full fill) and an empty cell, so on each of the two the line or the halo (when drawn) must
// reach 3 to 1.
test("the editor's outline, halo only where needed, against every full fill and the empty colour, both themes, both palettes", (t) => {
  assert.ok(OUTLINE_HALO >= 2, `halo ${OUTLINE_HALO} px`);
  assert.equal(haloNeeded(THEMES.light), false, "light theme: the plain line, as in the Explorer");
  assert.equal(haloNeeded(THEMES.dark), true, "dark theme: the halo stays");
  assert.ok(Math.abs(contrastOf("#000000", "#ffffff") - 21) < 1e-9);
  assert.ok(Math.abs(contrastOf(THEMES.dark.outline, THEMES.dark.empty) - contrast(THEMES.dark.outline, THEMES.dark.empty)) < 1e-9);
  const editor = fs.readFileSync(new URL("../../src/ui/editor/editor.mjs", import.meta.url), "utf8");
  assert.match(editor, /outline\(cells, \{ halo: "auto" \}\)/, "the editor asks for the auto halo, no theme test of its own");
  assert.equal(/dataset\.theme|"dark"/.test(editor), false, "no theme name in the editor");
  const fillsOf = (theme, palette) => (palette === "colourblind" ? PALETTES.colourblind : theme === "dark" ? DARK_FILLS : PALETTES.standard);
  for (const theme of ["light", "dark"]) {
    const th = THEMES[theme];
    const halo = haloOf(th);
    const drawn = haloNeeded(th);
    assert.equal(lighterOf(th.canvas, th.text), theme === "light" ? th.canvas : th.text);
    assert.notEqual(halo, th.text, "never the colour of a cell mark's line");
    for (const palette of ["standard", "colourblind"]) {
      for (const c of [...Object.values(fillsOf(theme, palette)), th.empty]) {
        const a = contrast(th.outline, c);
        const b = drawn ? contrast(halo, c) : 0;
        t.diagnostic(`${theme} ${palette} on ${c}: line ${th.outline} ${a.toFixed(2)}, halo ${drawn ? `${halo} ${b.toFixed(2)}` : "not drawn"}`);
        assert.ok(Math.max(a, b) >= 3, `${theme} ${palette}: editor outline on ${c}: line ${a.toFixed(2)}, halo ${drawn ? b.toFixed(2) : "none"}`);
      }
    }
  }
});

// The interface accent (--select of styles/base.css: focus rings, pressed and current buttons, the timeline) is not a
// colour of the hex canvas: no module draws with it, except the one overlay chosen by the site's owner, the outline of
// the Check step of the Algorithm page (ui/pages/lab/step7.mjs), whose contrast tests/lab/check_outline.test.mjs tests.
const ACCENT_ALLOWED = ["ui/pages/lab/step7.mjs"];
test("no module of the site draws on a canvas in the interface accent colour (but the Check outline)", () => {
  const css = fs.readFileSync(new URL("../../styles/base.css", import.meta.url), "utf8");
  const accents = [...css.matchAll(/--select:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());
  assert.ok(accents.length >= 2);
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(new URL(`../../src/${dir}`, import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}${e.name}/`);
      else if (e.name.endsWith(".mjs")) files.push(`${dir}${e.name}`);
    }
  };
  walk("");
  const hits = files.filter((rel) => !ACCENT_ALLOWED.includes(rel)).filter((rel) => {
    const text = fs.readFileSync(new URL(`../../src/${rel}`, import.meta.url), "utf8").toLowerCase();
    return text.includes("--select") || accents.some((a) => text.includes(a));
  });
  assert.deepEqual(hits, []);
});

test("styles/base.css carries the same outline colours as THEMES (light, dark by choice)", () => {
  const css = fs.readFileSync(new URL("../../styles/base.css", import.meta.url), "utf8");
  const found = [...css.matchAll(/--outline:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());
  assert.deepEqual(found, [THEMES.light.outline, THEMES.dark.outline]);
});
