// The view model of the blue Construction Lab: a pure function of the event list of a blue construction, so that
// the pages never walk the raw events. It may be called again on a growing list while the construction runs.

// The number of steps of the blue construction (0 .. 5).
export const BLUE_STEP_COUNT = 6;

// buildBlueView(events) returns { start, window, classes, classesDone, privates, dSteps, dChosen, xSteps, xBase,
// xCandidates, glued, verifyRows, verifyRegion, progress, done, error, available }: the single events as they are
// (null until they arrive), the repeated ones as lists in their order (classPrime, privatePrime, dCrtStep,
// xCrtStep, xCandidate, verifyRow), progress = { phase, done, total } of the latest blueProgress event (null once a
// later event of another type has arrived), available[n] = step n has at least one event.
export function buildBlueView(events) {
  const view = {
    start: null, window: null, classes: [], classesDone: null, privates: [], dSteps: [], dChosen: null, xSteps: [],
    xBase: null, xCandidates: [], glued: null, verifyRows: [], verifyRegion: null, progress: null, done: null,
    error: null, available: new Array(BLUE_STEP_COUNT).fill(false),
  };
  for (const ev of events) {
    if (Number.isInteger(ev.step) && ev.step >= 0 && ev.step < BLUE_STEP_COUNT) view.available[ev.step] = true;
    if (ev.type === "blueProgress") {
      view.progress = { phase: ev.phase, done: ev.done, total: ev.total };
      continue;
    }
    view.progress = null;
    switch (ev.type) {
      case "start": view.start = ev; break;
      case "window": view.window = ev; break;
      case "classPrime": view.classes.push(ev); break;
      case "classesDone": view.classesDone = ev; break;
      case "privatePrime": view.privates.push(ev); break;
      case "dCrtStep": view.dSteps.push(ev); break;
      case "dChosen": view.dChosen = ev; break;
      case "xCrtStep": view.xSteps.push(ev); break;
      case "xBase": view.xBase = ev; break;
      case "xCandidate": view.xCandidates.push(ev); break;
      case "glued": view.glued = ev; break;
      case "verifyRow": view.verifyRows.push(ev); break;
      case "verifyRegion": view.verifyRegion = ev; break;
      case "done": view.done = ev; break;
      case "error": view.error = ev; break;
      default: break;
    }
  }
  return view;
}
