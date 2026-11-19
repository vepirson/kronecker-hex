// "Build" of the shape editor: the construction of the editor's shape without the step display, run by the runner of
// the Construction Lab (construct_runner.mjs: runPlace decides between the main thread and the construct worker). The
// Lab's entry of the kind of the input (lab/kinds.mjs) turns the events into the progress of the run (buildView,
// runProgress) and gives the texts of a failure (errorInfo).

import { runConstruction, finishedError } from "../construct_runner.mjs";
import { kindEntry } from "../pages/lab/kinds.mjs";

// The progress of a run in the worker is recomputed at most once per this many milliseconds.
export const BUILD_PROGRESS_MS = 250;

// startBuild(input, { onProgress, onDone, onError }) starts the construction of a Lab input record (labInputOf of the
// editor state) and returns { runOn ("main" or "worker"), cancel() }. Exactly one of the callbacks ends a run that is
// not cancelled: onDone(result) with the construction's result (it has the token), or onError(info) with the Lab's
// error record { code, title, sentence, detail, editorLink }. onProgress(p) receives the progress of the run of the
// kind (runProgress of lab/kinds.mjs: { fraction, line, full }) while the worker runs. A run on the main thread starts
// after a timeout of 0, so the page can show that it runs first. cancel() stops the run (the worker is ended), no
// callback follows.
export function startBuild(input, { onProgress = () => {}, onDone, onError }) {
  const entry = kindEntry(input);
  const events = [];
  const job = runConstruction(input, {
    defer: true,
    batchMs: BUILD_PROGRESS_MS,
    onEvents(batch) {
      for (const e of batch) events.push(e);
      if (job.runOn === "worker") onProgress(entry.runProgress(entry.buildView(events)));
    },
    onDone(result) {
      const error = finishedError(entry.buildView(events), result);
      if (error) onError(entry.errorInfo(error));
      else onDone(result);
    },
    onError: (failure) => onError(entry.errorInfo(failure)),
  });
  return { runOn: job.runOn, cancel: () => void job.cancel() };
}
