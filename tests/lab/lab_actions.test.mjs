// The Lab's popovers, its one rule of a wrong checked cell, and one place per action of a result: the details popover
// and the toolbar popovers stay inside the screen at every width (popoverBox of the site's popover helper), the
// tamper message, the marked cells and the check count wrong cells by the same rule, the Explorer and the Edit page
// are reached from the page bar only, and the page has no export, no import and no link of its own.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import * as model from "../../src/ui/pages/lab/model.mjs";
import { failText } from "../../src/ui/pages/lab/extras.mjs";
import { TOOL_POPOVER_WIDTH } from "../../src/ui/pages/lab/toolbar.mjs";
import { step7Data } from "../../src/ui/pages/lab/step7.mjs";
import { popoverBox, POPOVER_EDGE, POPOVER_MAX_WIDTH } from "../../src/ui/widgets/popover.mjs";
import { runToEnd } from "../../src/construct/index.mjs";
import { buildBlueView } from "../../src/construct/blue/lab_view.mjs";
import { shapeZ, seedZ } from "../../src/core/shapes.mjs";

const code = (rel) => fs.readFileSync(new URL(`../../src/ui/pages/lab/${rel}`, import.meta.url), "utf8");

test("the Lab's popovers stay inside the screen: placed in the viewport at every width, at either end of the row", () => {
  for (const vw of [320, 390, 768, 1024, 1440]) {
    for (const [anchorLeft, widest] of [[vw - 40, TOOL_POPOVER_WIDTH], [vw - 40, POPOVER_MAX_WIDTH], [8, TOOL_POPOVER_WIDTH]]) {
      const host = { left: 0, top: 0, right: vw, bottom: 844 };
      const anchor = { left: anchorLeft, top: 50, right: anchorLeft + 28, bottom: 78 };
      const b = popoverBox({ anchor, host, placement: "below", align: "end", width: widest, maxWidth: widest });
      assert.ok(b.left >= POPOVER_EDGE, `${vw} ${anchorLeft}: left ${b.left}`);
      assert.ok(b.left + b.maxWidth <= vw - POPOVER_EDGE, `${vw} ${anchorLeft}: right ${b.left + b.maxWidth}`);
    }
  }
});

test("one rule of a wrong checked cell: the tamper count, the marked cells and the check agree, a blue neighbour wants any sign", () => {
  const { result, events } = runToEnd({ shape: shapeZ(3), seed: seedZ(3), colour: 0 });
  const rows = result.verify.rows;
  // the neighbours want "nonzero" and have a sign: none of them is wrong
  assert.ok(rows.some((r) => r.cells.some((c) => c.want === "nonzero")));
  assert.equal(model.mismatchCells(rows).length, 0);
  // one neighbour made blue: exactly that cell is wrong, for every count
  const bad = rows.map((r) => ({ ...r, cells: r.cells.map((c) => ({ ...c })) }));
  const [row, cell] = bad.flatMap((r) => r.cells.map((c) => [r, c])).find(([, c]) => c.want === "nonzero");
  cell.got = 0;
  assert.deepEqual(model.mismatchCells(bad), [[cell.i, row.j]]);
  const tampered = { ...result, tampered: true, pass: false, verify: { ...result.verify, rows: bad } };
  assert.equal(step7Data(buildBlueView(events), 0, tampered).mismatches, 1);
  assert.equal(failText(model.mismatchCells(bad).length), "FAIL: 1 wrong cell");
  assert.equal(failText(3), "FAIL: 3 wrong cells");
});

test("one place per action of a result: the page bar shows it in the Explorer and edits its shape, no export, no import, no link", () => {
  const all = ["index.mjs", "toolbar.mjs", "extras.mjs", "blue/extras.mjs", "start.mjs"].map(code).join("\n");
  // the Explorer and the Edit page are reached from the page bar only
  assert.match(code("index.mjs"), /createPageBar\(\{\s*current: "lab"/);
  assert.equal((all.match(/explorerTokenHref\(/g) || []).length, 1);
  assert.equal((all.match(/openInEditor\(/g) || []).length, 1);
  assert.equal(/pageIconLink|lab-open-explorer/.test(all), false);
  // the details show the numbers: no link and no copy of it, no export menu, no table import, no Factors toggle
  assert.equal(/location\.href\.split|labLink|copyText|lab-copy-link/.test(all), false);
  assert.equal(/EXPORT_ITEMS|exportMenu|EXPORT_TOOL|importTables|import_tables|startEntry|lab-x-import|lab-x-export/.test(all), false);
  assert.equal(/"Factors"|"Primes"|aria-pressed/.test(all), false);
  // the Recompute button keeps its place and says why when there is nothing to recompute
  assert.match(code("index.mjs"), /"Already computed live"/);
});
