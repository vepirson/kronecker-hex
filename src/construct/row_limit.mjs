// The row limits of the construction and the one rule that refuses a shape before a run: a shape of region type +1 or
// -1 with a row of more than ROW_LIMIT cells of the shape. The run counts the sign cells of a row (the cells of the
// shape and of its neighbours in that row that no small prime makes type 0): a plain row of n cells has at most n + 2
// of them (its two end neighbours), so the run's limit CAP_K is ROW_LIMIT + 2. A row with gaps, or one beside a longer
// row, can have more neighbours with a sign: such a shape passes the rule and its run stops at that row. A shape of type
// 0 has no row solve. The Explorer, the Gallery (regionActions of src/ui/actions.mjs), the shape editor (its verdict,
// its buttons and its fix) and the error of a run that meets a longer row all read it from here.

// The most cells of the shape in one row (the drawn cells).
export const ROW_LIMIT = 45;

// The most sign cells in one row of a run. The row solve's tables of a row with k sign cells take about
// 2^(floor((k + 1) / 2) + 7) bytes (row_solver.mjs): 1 GB at k = 45 or 46, 2 GB at 47 or 48.
export const CAP_K = ROW_LIMIT + 2;

// The reason of a shape that the rule refuses.
export const ROW_TOO_LONG = `Row limit ${ROW_LIMIT} cells`;

// overRow(rows) is the first of the sign rows [{ j, cells }] of a run (ascending j) with more than CAP_K cells, or
// null: the row where the run stops.
export function overRow(rows) {
  return rows.find((r) => r.cells.length > CAP_K) || null;
}

// longestRow(cells) is { j, n }: a row j of the cells [i, j] with the most cells, n of them (the smallest such j), or
// { j: null, n: 0 } for no cells.
export function longestRow(cells) {
  const count = new Map();
  for (const [, j] of Array.isArray(cells) ? cells : []) count.set(j, (count.get(j) || 0) + 1);
  let best = { j: null, n: 0 };
  for (const [j, n] of count) if (n > best.n || (n === best.n && j < best.j)) best = { j, n };
  return best;
}

// rowProblem(n, colour) is ROW_TOO_LONG for a shape whose longest row has n cells when the region type is +1 or -1 and
// n > ROW_LIMIT, else null.
export function rowProblem(n, colour) {
  return colour !== 0 && n > ROW_LIMIT ? ROW_TOO_LONG : null;
}

// shapeProblem(cells, colour) is rowProblem of the longest row of the cells.
export function shapeProblem(cells, colour) {
  return rowProblem(longestRow(cells).n, colour);
}
