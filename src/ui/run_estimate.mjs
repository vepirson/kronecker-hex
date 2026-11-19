// The time texts of a running construction, from the progress measured during the run itself (no DOM, no clock: the
// page hands in the samples). A sample is { t, f }: t the milliseconds since the run started, f the overall fraction
// of the run done at that time (0 .. 1, see the fraction of the run's kind).
//
// The estimate of the time left divides the part still to do by the speed of the run, measured twice: over the whole
// run (elapsed against the fraction) and over the last part of it (the samples of the last RECENT_MS), and takes the
// mean of the two speeds, so that one slow or fast stretch moves the estimate only half as much. It is shown only once
// the run has lasted ESTIMATE_MIN_MS and done ESTIMATE_MIN_FRACTION of its work, before that the run is too young for
// a stable speed.

// The estimate appears after this many milliseconds and this fraction of the run.
export const ESTIMATE_MIN_MS = 3000;
export const ESTIMATE_MIN_FRACTION = 0.02;
// The recent speed is measured over the samples of the last this many milliseconds.
export const RECENT_MS = 15000;

// remainingMs(samples) is the estimated time left in milliseconds, or null while the run is too young (fewer than
// ESTIMATE_MIN_MS or ESTIMATE_MIN_FRACTION) or the samples give no speed. samples: [{ t, f }] in the order taken.
export function remainingMs(samples) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  const last = samples[samples.length - 1];
  if (!(last.t >= ESTIMATE_MIN_MS) || !(last.f >= ESTIMATE_MIN_FRACTION)) return null;
  if (last.f >= 1) return 0;
  const whole = last.f / last.t;
  let from = samples[0];
  for (const s of samples) {
    if (s.t <= last.t - RECENT_MS) from = s;
    else break;
  }
  const dt = last.t - from.t;
  const recent = dt > 0 && last.f > from.f ? (last.f - from.f) / dt : null;
  const speed = recent === null ? whole : (whole + recent) / 2;
  return speed > 0 ? (1 - last.f) / speed : null;
}

// leftText(ms) is the time left in words: "about 5 s left" (whole multiples of 5 s, at least 5) below a minute,
// "about 1 min left" .. "about 59 min left" (rounded up) below an hour, else "about 1 h 20 min left" (rounded up to
// 10 min). null for null.
export function leftText(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return null;
  const s = ms / 1000;
  if (s < 57.5) return `about ${Math.max(5, Math.round(s / 5) * 5)} s left`;
  const min = Math.ceil(s / 60);
  if (min < 60) return `about ${min} min left`;
  const tens = Math.ceil(min / 10) * 10;
  const h = Math.floor(tens / 60);
  const rest = tens % 60;
  return `about ${h} h${rest ? ` ${rest} min` : ""} left`;
}

// estimateText(samples) is leftText(remainingMs(samples)): the estimate of the time left, or null while there is none.
export function estimateText(samples) {
  return leftText(remainingMs(samples));
}

// elapsedText(ms) is the time a run has taken: "0:07", "1:05", "12:40", "1:02:03".
export function elapsedText(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const two = (v) => String(v).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}
