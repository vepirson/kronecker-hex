// The view model of the Construction Lab: a pure function of the event list of a construction, so that the pages
// never walk the raw events. It may be called again on a growing list while the construction runs.

const blankRowState = () => ({
  n: null, u: null, c: null, R: null, attempts: [], target: null, wantBits: null, r1: null, r2: null, tried2: null, ms: null,
});

// buildLabView(events) returns { start, window, smallPrimes, xSmall, rowPrimes, dSteps, candidates, rows, progress,
// xSteps, glued, verifyRows, verifyRegion, done, error, available }. rows hold, per row with sign cells, its cells,
// its row primes and the data of the LATEST candidate d0 (n, u, c, the attempts with their R, the target of the
// last attempt, r1, r2). available[n] says whether step n has at least one event.
export function buildLabView(events) {
  const view = {
    start: null, window: null, smallPrimes: [], xSmall: null, rowPrimes: [], dSteps: [], candidates: [], rows: [],
    progress: null, xSteps: [], glued: null, verifyRows: [], verifyRegion: null, done: null, error: null,
    available: new Array(8).fill(false),
  };
  const rowByJ = new Map();
  const rowOf = (j) => {
    let r = rowByJ.get(j);
    if (!r) {
      r = { j, k: 0, cells: [], L: null, q1: null, q2: null, byRule: null, ...blankRowState() };
      rowByJ.set(j, r);
      view.rows.push(r);
    }
    return r;
  };
  for (const ev of events) {
    if (Number.isInteger(ev.step) && ev.step >= 0 && ev.step < 8) view.available[ev.step] = true;
    switch (ev.type) {
      case "start": view.start = ev; break;
      case "window": view.window = ev; break;
      case "smallPrime": view.smallPrimes.push(ev); break;
      case "xSmall":
        view.xSmall = ev;
        for (const r of ev.rows) {
          const row = rowOf(r.j);
          row.cells = r.cells;
          row.k = r.cells.length;
        }
        break;
      case "rowPrimes": {
        const row = rowOf(ev.j);
        Object.assign(row, { k: ev.k, L: ev.L, q1: ev.q1, q2: ev.q2, byRule: ev.byRule });
        view.rowPrimes.push(ev);
        break;
      }
      case "dCrtStep": view.dSteps.push(ev); break;
      case "dCandidate":
        view.candidates.push({ index: ev.index, d0: ev.d0, rejected: null });
        for (const row of view.rows) Object.assign(row, blankRowState());
        view.progress = null;
        break;
      case "rowCofactor": Object.assign(rowOf(ev.j), { n: ev.n, u: ev.u, c: ev.c }); break;
      case "rowTarget": {
        const row = rowOf(ev.j);
        row.attempts = row.attempts.concat([{ R: ev.R, found: null }]);
        Object.assign(row, { R: ev.R, target: ev.cells, wantBits: ev.wantBits });
        break;
      }
      case "rowProgress": view.progress = { j: ev.j, phase: ev.phase, done: ev.done, total: ev.total }; break;
      case "rowRetry": {
        const row = rowOf(ev.j);
        row.attempts = row.attempts.map((a, k) => (k === row.attempts.length - 1 ? { R: a.R, found: false } : a));
        view.progress = null;
        break;
      }
      case "rowSolved": {
        const row = rowOf(ev.j);
        row.attempts = row.attempts.map((a, k) => (k === row.attempts.length - 1 ? { R: a.R, found: true } : a));
        Object.assign(row, { r1: ev.r1, r2: ev.r2, R: ev.R, tried2: ev.tried2, ms: ev.ms });
        view.progress = null;
        break;
      }
      case "dRejected": {
        const c = view.candidates[view.candidates.length - 1];
        if (c) c.rejected = { reason: ev.reason, j: ev.j };
        view.progress = null;
        break;
      }
      case "xCrtStep": view.xSteps.push(ev); break;
      case "glued": view.glued = ev; break;
      case "verifyRow": view.verifyRows.push(ev); break;
      case "verifyRegion": view.verifyRegion = ev; break;
      case "done": view.done = ev; view.progress = null; break;
      case "error": view.error = ev; view.progress = null; break;
      default: break;
    }
  }
  return view;
}
