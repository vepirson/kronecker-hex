// The timeline widget: one bar of the positions of a stepper, drawn as a ruler. One segment per step, its width by its
// number of items (a step with subCount n has n + 1 items: its overview and its n items), at least MIN_SEGMENT pixels
// each, the segments parted by full-height dividers. Inside a segment short minor ticks mark where its items start
// (thinned as on a ruler when the items are narrow, tickItems), the tick of the current item drawn stronger. The bar
// is filled up to the current item, and while a play runs the current item's share fills over the play interval. A
// click or a drag jumps to the nearest item of an enabled step, and while the pointer is over the bar a small label
// above it names the position under the pointer in the stepper's words. The bar is a slider (role "slider") whose
// value text is the stepper's position text, with its own keys: arrows one item, Home and End the first and the last
// position. It knows positions only through the functions it is given, nothing about the page that uses it.

import { h } from "../dom.mjs";
import { positionText } from "./stepper.mjs";

// The smallest width of a step's segment in CSS pixels.
export const MIN_SEGMENT = 12;
// The least room between two minor ticks in CSS pixels, and the steps of the thinning (every k-th item: 2, 5, 10,
// 20, 50, 100, ...).
export const TICK_MIN_PX = 6;
const TICK_STEPS = [1, 2, 5];

// tickEvery(items, width) is the k of the minor ticks of a segment of that many items and that width in pixels: 1
// when the items are at least TICK_MIN_PX wide, else the smallest of 2, 5, 10, 20, 50, 100, ... that leaves at least
// TICK_MIN_PX between ticks.
export function tickEvery(items, width) {
  const per = width / Math.max(1, items);
  for (let scale = 1; ; scale *= 10) {
    for (const s of TICK_STEPS) {
      const k = s * scale;
      if (per * k >= TICK_MIN_PX) return k;
    }
  }
}

// tickItems(items, width) is the list of the items of a segment that carry a minor tick at their start: every k-th
// item from k on (k = tickEvery), never item 0 (it starts at the segment's divider). A segment of one item has none.
export function tickItems(items, width) {
  const out = [];
  if (items < 2) return out;
  const k = tickEvery(items, width);
  for (let q = k; q < items; q += k) out.push(q);
  return out;
}

// itemsOf(subCounts) is the list of item counts per step (subCount + 1 each).
export function itemsOf(subCounts) {
  return subCounts.map((n) => Math.max(0, n | 0) + 1);
}

// itemIndex(pos, subCounts) is the index of the position { step, sub } among all items of all steps.
export function itemIndex({ step, sub }, subCounts) {
  const items = itemsOf(subCounts);
  let k = 0;
  for (let s = 0; s < step && s < items.length; s++) k += items[s];
  return k + Math.max(0, Math.min(sub, items[step] - 1));
}

// positionAt(fraction, widths, subCounts) is the position { step, sub } of the item nearest to a point of the bar:
// fraction of the bar's width in [0, 1], widths the drawn segment widths (any unit).
export function positionAt(fraction, widths, subCounts) {
  const total = widths.reduce((a, b) => a + b, 0);
  let x = Math.max(0, Math.min(1, fraction)) * total;
  for (let s = 0; s < widths.length; s++) {
    if (x <= widths[s] || s === widths.length - 1) {
      const n = subCounts[s] + 1;
      const sub = Math.max(0, Math.min(n - 1, Math.floor((x / Math.max(widths[s], 1e-9)) * n)));
      return { step: s, sub };
    }
    x -= widths[s];
  }
  return { step: 0, sub: 0 };
}

// createTimeline(el, { stepCount, subCountOf, getPos, setPos, isEnabled, label, names, onKey }) fills el with the bar.
// subCountOf(k) is the number of items of step k after its overview, getPos() = { step, sub, subCount }, setPos({ step,
// sub }) jumps (a click and a drag call it: the page stops its play there), isEnabled(k) says whether step k can be
// shown, names the names of the steps for the value text (positionText of the stepper), onKey(action) receives the
// slider's keys as "next", "prev", "first" or "last" (the page moves the way its stepper does). Returns { refresh(),
// setPlaying(playing, ms), destroy() }: refresh() after any change of the position or of the counts, setPlaying(true,
// ms) starts the fill of the current item over ms milliseconds (again at every call), setPlaying(false) stops it.
export function createTimeline(el, { stepCount, subCountOf, getPos, setPos, isEnabled = () => true, label = "position", names = null, onKey = () => {} } = {}) {
  const track = h("div", { class: "timeline-track" });
  // the label of the position under the pointer, above the bar
  const hoverLabel = h("span", { class: "timeline-label", "aria-hidden": "true", hidden: true });
  // (the hover label is the bar's tooltip: it names the position a click would go to)
  const bar = h("div", { class: "timeline", role: "slider", tabindex: "0", "aria-label": label, "aria-valuemin": "0" }, track, hoverLabel);
  el.replaceChildren(bar);
  let segs = [];
  let counts = [];
  let playing = false;
  let playMs = 0;
  let dragging = false;
  let runKey = ""; // the item and interval whose fill animation runs (restarted only when they change)
  let tick = 0; // raised by every setPlaying, so that each interval of a play restarts the fill

  const build = () => {
    counts = Array.from({ length: stepCount }, (_, k) => Math.max(0, subCountOf(k) | 0));
    const items = itemsOf(counts);
    if (segs.length !== stepCount) {
      segs = items.map(() => {
        const fill = h("span", { class: "timeline-fill" });
        const now = h("span", { class: "timeline-now" });
        const ticks = h("span", { class: "timeline-ticks", "aria-hidden": "true" });
        const current = h("span", { class: "timeline-tick timeline-tick-now", hidden: true });
        const seg = h("span", { class: "timeline-seg" }, fill, now, ticks, current);
        return { seg, fill, now, ticks, current, tickKey: "" };
      });
      track.replaceChildren(...segs.map((s) => s.seg));
    }
    segs.forEach((s, k) => {
      s.seg.style.flexGrow = String(items[k]);
      s.seg.style.minWidth = `${MIN_SEGMENT}px`;
      s.seg.dataset.items = String(items[k]);
      s.seg.dataset.enabled = String(!!isEnabled(k));
    });
  };

  // the minor ticks of every segment, rebuilt when its item count or its width changed
  const drawTicks = () => {
    const items = itemsOf(counts);
    let total = 0;
    segs.forEach((s, k) => {
      const n = items[k];
      const width = s.seg.getBoundingClientRect().width;
      const key = `${n}:${Math.round(width)}`;
      if (key !== s.tickKey) {
        s.tickKey = key;
        const list = width > 0 ? tickItems(n, width) : [];
        s.ticks.replaceChildren(...list.map((q) => h("span", { class: "timeline-tick", style: { left: `${(100 * q) / n}%` } })));
        s.seg.dataset.tickEvery = String(width > 0 && n > 1 ? tickEvery(n, width) : 0);
      }
      total += s.ticks.childElementCount;
    });
    bar.dataset.ticks = String(total);
  };

  const refresh = () => {
    build();
    const p = getPos();
    const items = itemsOf(counts);
    const key = playing ? `${p.step}.${p.sub}.${playMs}.${tick}` : "";
    segs.forEach((s, k) => {
      const n = items[k];
      let done;
      if (k < p.step) done = n;
      else if (k > p.step) done = 0;
      else done = playing ? p.sub : p.sub + 1;
      s.fill.style.width = `${(100 * done) / n}%`;
      // the tick of the current item, stronger (also where the thinning drew none)
      s.current.hidden = k !== p.step || n < 2;
      if (k === p.step) s.current.style.left = `${(100 * Math.min(p.sub, n - 1)) / n}%`;
      const anim = playing && k === p.step;
      s.now.hidden = !anim;
      if (anim && key !== runKey) {
        s.now.style.left = `${(100 * p.sub) / n}%`;
        s.now.style.width = `${100 / n}%`;
        s.now.style.setProperty("--timeline-ms", `${playMs}ms`);
        // restart the fill animation for the new current item
        s.now.classList.remove("timeline-run");
        void s.now.offsetWidth;
        s.now.classList.add("timeline-run");
      }
    });
    runKey = key;
    drawTicks();
    const idx = itemIndex(p, counts);
    bar.setAttribute("aria-valuemax", String(items.reduce((a, b) => a + b, 0) - 1));
    bar.setAttribute("aria-valuenow", String(idx));
    bar.setAttribute("aria-valuetext", positionText(p, stepCount, names));
    bar.dataset.index = String(idx);
    bar.dataset.playing = String(playing);
  };

  const widths = () => segs.map((s) => s.seg.getBoundingClientRect().width);
  // the position under the pointer of event e, or null
  const posAt = (e) => {
    const r = track.getBoundingClientRect();
    if (r.width <= 0) return null;
    return positionAt((e.clientX - r.left) / r.width, widths(), counts);
  };
  const jump = (e) => {
    const q = posAt(e);
    if (!q || !isEnabled(q.step)) return;
    setPos(q);
    refresh();
  };
  // the label above the bar: the position under the pointer in the stepper's words, kept inside the bar's width
  const showLabel = (e) => {
    const q = posAt(e);
    if (!q) return;
    hoverLabel.textContent = positionText({ step: q.step, sub: q.sub, subCount: counts[q.step] }, stepCount, names);
    hoverLabel.hidden = false;
    const br = bar.getBoundingClientRect();
    const half = hoverLabel.offsetWidth / 2;
    hoverLabel.style.left = `${Math.max(half, Math.min(br.width - half, e.clientX - br.left))}px`;
    bar.dataset.hover = hoverLabel.textContent;
  };
  const hideLabel = () => {
    hoverLabel.hidden = true;
    delete bar.dataset.hover;
  };
  const onDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging = true;
    try {
      bar.setPointerCapture(e.pointerId);
    } catch {
      // capture is optional
    }
    jump(e);
    showLabel(e);
  };
  const onMove = (e) => {
    if (dragging) jump(e);
    showLabel(e);
  };
  const onUp = (e) => {
    dragging = false;
    if (e.pointerType !== "mouse") hideLabel();
  };
  const KEYS = { ArrowRight: "next", ArrowUp: "next", ArrowLeft: "prev", ArrowDown: "prev", Home: "first", End: "last" };
  const onKeyDown = (e) => {
    const action = KEYS[e.key];
    if (!action || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    onKey(action);
    refresh();
  };
  bar.addEventListener("pointerdown", onDown);
  bar.addEventListener("pointermove", onMove);
  bar.addEventListener("pointerup", onUp);
  bar.addEventListener("pointercancel", onUp);
  bar.addEventListener("pointerleave", hideLabel);
  bar.addEventListener("keydown", onKeyDown);
  // a new width of the bar (window resize, phone rotation) draws the ticks again
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => drawTicks()) : null;
  if (ro) ro.observe(track);
  refresh();

  return {
    refresh,
    setPlaying(on, ms = 0) {
      playing = !!on;
      playMs = ms;
      tick++;
      refresh();
    },
    destroy() {
      bar.removeEventListener("pointerdown", onDown);
      bar.removeEventListener("pointermove", onMove);
      bar.removeEventListener("pointerup", onUp);
      bar.removeEventListener("pointercancel", onUp);
      bar.removeEventListener("pointerleave", hideLabel);
      bar.removeEventListener("keydown", onKeyDown);
      if (ro) ro.disconnect();
      el.replaceChildren();
    },
  };
}
