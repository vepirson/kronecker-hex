// The pure parts of the Explorer's interaction: what a click does, the selection in the address and its round trip,
// and the page's own view options (hidden for now, their defaults hold).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readExplorePrefs, DEFAULT_CELL, EXPLORE_PREFS_KEY } from "../../src/ui/pages/explore.mjs";
import { ZOOM_STEP } from "../../src/render/hex_canvas.mjs";
import { clickAction, readViewQuery, createExplorerState, addressOf, URL_DIGIT_LIMIT, SEL_LIMIT } from "../../src/ui/pages/explore/state.mjs";
import { parseHash } from "../../src/ui/router.mjs";

// the address of the page after a click on the cell anchor whose region was found, seen from the view middle (x, d)
// at zoom cell
function regionLink({ x, d, cell, anchor }) {
  const m = createExplorerState({ prefs: { cells: "soft", regionOnClick: true } });
  m.selectCell(anchor[0], anchor[1]);
  m.fillDone(m.get().job.id, { area: 1, genus: 0, colour: 1, complete: true, symbolsEvaluated: 1, infinite: null }, [[0, 0]], null, 1);
  return addressOf(m.get(), { x: String(x), d: String(d), cell, key: "k", at: null });
}

test("a click fills the region only when the switch is on, the cell is outside the shown region and not running", () => {
  assert.equal(clickAction({ regionOnClick: true, inShown: false, runningHere: false }), "fill");
  assert.equal(clickAction({ regionOnClick: true, inShown: true, runningHere: false }), "select", "a cell of the shown region only moves the selection");
  assert.equal(clickAction({ regionOnClick: true, inShown: false, runningHere: true }), "select", "the second click of a double click does not restart");
  assert.equal(clickAction({ regionOnClick: false, inShown: false, runningHere: false }), "select", "switch off: as before, the button computes the region");
});

test("selection link: sel round trip through the address (the selected cell = middle + sel, exact bigints)", () => {
  const cases = [
    { x: 1080n, d: 517n, cell: 22, anchor: [1080n, 517n] },
    { x: 1080n, d: 517n, cell: 30.5, anchor: [1083n, 515n] },
    { x: -(10n ** 1999n) - 7n, d: 10n ** 1500n + 3n, cell: 9, anchor: [-(10n ** 1999n) - 7n - 120n, 10n ** 1500n + 3n + 64n] },
  ];
  for (const c of cases) {
    const link = regionLink(c);
    assert.ok(link, "a link exists");
    const { path, query } = parseHash(link);
    assert.equal(path, "#/explore");
    const back = readViewQuery(query);
    assert.deepEqual(back.problems, []);
    assert.equal(back.x + BigInt(back.sel[0]), c.anchor[0]);
    assert.equal(back.d + BigInt(back.sel[1]), c.anchor[1]);
    assert.equal(back.x, c.x);
    assert.equal(back.cell, c.cell);
  }
  // decimal strings (as getView returns them) work too
  assert.equal(regionLink({ x: "1080", d: "517", cell: 22, anchor: [1081n, 519n] }), "#/explore?x=1080&d=517&z=22&sel=1,2");
});

test("the bare address above the 2000-digit rule, a selection too far from the middle is left out of the address", () => {
  const big = 10n ** BigInt(URL_DIGIT_LIMIT); // 2001 digits
  assert.equal(regionLink({ x: big, d: 5n, cell: 22, anchor: [big, 5n] }), "#/explore");
  const far = BigInt(SEL_LIMIT) + 1n;
  assert.equal(regionLink({ x: 0n, d: 0n, cell: 22, anchor: [far, 0n] }), "#/explore?x=0&d=0&z=22");
});

test("the page's switches: defaults soft and region on click, stored values read back", () => {
  assert.equal(EXPLORE_PREFS_KEY, "kronecker-hex-explore");
  assert.deepEqual(readExplorePrefs(null), { cells: "soft", regionOnClick: true });
  assert.deepEqual(readExplorePrefs("not json"), { cells: "soft", regionOnClick: true });
  assert.deepEqual(readExplorePrefs('{"cells":"full","regionOnClick":false}'), { cells: "full", regionOnClick: false });
  assert.deepEqual(readExplorePrefs('{"cells":"bright"}'), { cells: "soft", regionOnClick: true });
  // a fresh view and the key 0 use the zoom of the home view
  assert.equal(DEFAULT_CELL, 20);
  // the one zoom step of the site lives in the hex view
  assert.equal(ZOOM_STEP, 1.25);
});
