// The final check of a construction (step 7 of the sign Construction Lab, step 5 of the blue one), independent of
// how x0 and d0 were found: it uses only the Kronecker symbol and the flood fill of the core.
//
// Every cell of the window W = S u N(S) must have its final target: 0 on a cell forced blue, the colour on S, and on
// N(S) the opposite colour for a green or red region, any nonzero value for a blue one. The flood fill from the seed
// must close with exactly the cells of S, and the area, the genus (by the Euler characteristic and by counting the
// holes) and the colour must be right.

import { cellKey, compareCells, neighbourhood } from "../core/geometry.mjs";
import { rowReducer } from "../core/kronecker.mjs";
import { floodFillIter, genusOfCells, holeCount } from "../core/regions.mjs";
import { drain } from "./events.mjs";

// The wanted value on a cell of N(S) of a blue region: any nonzero symbol.
export const NONZERO = "nonzero";

// The flood fill reports its progress after about this many symbols.
const FILL_STEP = 256;

// verifyConstructionIter({ x0, d0, shape, seed, colour, forced }) is a generator with the result of
// verifyConstruction as its return value. It yields progress records { done, total }: done counts the window cells
// coloured and then the region cells found by the flood fill, total = |W| + |S|.
export function* verifyConstructionIter({ x0, d0, shape, seed, colour, forced }) {
  const S = shape.map(([i, j]) => [i, j]).sort(compareCells);
  const sKeys = new Set(S.map(([i, j]) => cellKey(i, j)));
  const fKeys = new Set(forced.map(([i, j]) => cellKey(i, j)));
  const W = S.concat(neighbourhood(S)).sort(compareCells);
  const total = W.length + S.length;
  const outside = colour === 0 ? NONZERO : -colour;
  const rows = [];
  let cur = null;
  let reducer = null;
  let done = 0;
  for (const [i, j] of W) {
    if (!cur || cur.j !== j) {
      if (cur) yield { done, total };
      cur = { j, cells: [], ok: true };
      rows.push(cur);
      reducer = rowReducer(x0, d0 + BigInt(j));
    }
    const k = cellKey(i, j);
    const want = fKeys.has(k) ? 0 : (sKeys.has(k) ? colour : outside);
    const got = reducer.symbol(i);
    cur.cells.push({ i, want, got });
    if (want === NONZERO ? got === 0 : got !== want) cur.ok = false;
    done++;
  }
  yield { done, total };
  const area = S.length;
  const genus = genusOfCells(S).genus;
  const fill = floodFillIter(x0 + BigInt(seed[0]), d0 + BigInt(seed[1]), Math.max(10 * area, 10), FILL_STEP);
  let step = fill.next();
  while (!step.done) {
    yield { done: done + Math.min(step.value.cells, area), total };
    step = fill.next();
  }
  const ff = step.value;
  const cells = ff.cells.map(([i, j]) => [i + seed[0], j + seed[1]]).sort(compareCells);
  const equalsShape = ff.complete && cells.length === area && cells.every(([i, j]) => sKeys.has(cellKey(i, j)));
  const holes = ff.complete ? holeCount(cells) : null;
  const region = { complete: ff.complete, area: ff.area, genus: ff.genus, holes, colour: ff.colour, equalsShape };
  const pass = rows.every((r) => r.ok) && ff.complete && equalsShape && ff.area === area && ff.genus === genus &&
    holes === genus && ff.colour === colour;
  return { rows, region, pass };
}

// verifyConstruction({ x0, d0, shape, seed, colour, forced }) with bigints x0, d0, the sorted shape, its seed, the
// colour 1, -1 or 0 and the list of forced blue cells returns { rows: [{ j, cells: [{ i, want, got }], ok }] (every
// row of W, ascending, want = NONZERO on N(S) for colour 0), region: { complete, area, genus, holes, colour,
// equalsShape }, pass }.
export function verifyConstruction(args) {
  return drain(verifyConstructionIter(args));
}
