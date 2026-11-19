// The one legend of the region types (src/ui/widgets/legend.mjs): its name without a colour word, used by the Explorer,
// no other copy of the legend in the pages, and none on the Gallery.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { LEGEND_NAME } from "../../src/ui/widgets/legend.mjs";

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("one legend: the name 'Region types +1, -1, 0', the Explorer builds it with regionLegend, the Gallery has none", () => {
  assert.equal(LEGEND_NAME, "Region types +1, -1, 0");
  assert.ok(!/green|red|blue/i.test(LEGEND_NAME), "no colour word");
  for (const f of ["src/ui/pages/explore.mjs"]) {
    const text = read(f);
    assert.match(text, /regionLegend\(/, f);
    assert.ok(!text.includes('"Region types'), `${f} writes no legend name of its own`);
  }
  for (const f of ["src/ui/pages/gallery.mjs", "src/ui/gallery/cards.mjs", "styles/gallery.css"]) {
    assert.ok(!/regionLegend|legend\.mjs|gal-legend|"Region types/.test(read(f)), `${f}: no legend on the Gallery`);
  }
  // the classes of the legend live in base.css only
  assert.match(read("styles/base.css"), /\.legend-sq-green \{/);
  for (const f of ["styles/explore.css", "styles/gallery.css"]) assert.ok(!/\.(xp-legend-item|gal-lg)\b/.test(read(f)), f);
});
