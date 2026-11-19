// The stepper widget: four arrows around a Play / Pause button and the list of steps. It knows positions only through
// getPos() = { step, sub, subCount } and setPos({ step, sub }), nothing about the page that uses it.
//
// The arrows, in this order: previous step, previous item, Play, next item, next step. Next step (>>): the last item
// of this step, and from its last item the first item of the next step, so repeated presses go end of this step,
// start of the next, end of the next, and so on. Previous step (<<): the first item of this step, and from its first
// item the last item of the step before. A step with one item has its start at its end, one press leaves it. Next
// item: sub + 1 while sub < subCount, then the next step with sub 0. Previous item: sub - 1 while sub > 0, else the
// previous step at its last item. moveTarget computes every move, and every jump (an arrow, a step button, jump(pos) and move(action) of the
// page) stops a play first. Play calls next every playMs milliseconds until the last position.

import { h } from "../dom.mjs";
import { iconButton } from "./icons.mjs";

// The four arrows: class, icon, tooltip and accessible name, move. The pairs of icons are mirror images.
export const STEPPER_ARROWS = Object.freeze([
  Object.freeze({ cls: "stepper-prev-step", icon: "prevStep", label: "Previous step (Shift + Left)", action: "prevStep" }),
  Object.freeze({ cls: "stepper-prev", icon: "prev", label: "Previous item (Left)", action: "prev" }),
  Object.freeze({ cls: "stepper-next", icon: "next", label: "Next item (Right)", action: "next" }),
  Object.freeze({ cls: "stepper-next-step", icon: "nextStep", label: "Next step (Shift + Right)", action: "nextStep" }),
]);

// nextPos(pos, stepCount) is the position after "next" from pos = { step, sub, subCount }, or null at the end.
export function nextPos({ step, sub, subCount }, stepCount) {
  if (sub < subCount) return { step, sub: sub + 1 };
  if (step < stepCount - 1) return { step: step + 1, sub: 0 };
  return null;
}

// moveTarget(action, pos, { stepCount, isEnabled, subCountOf }) is the position a move goes to from pos = { step, sub,
// subCount }, or null when it cannot move: "next" and "prev" (one item), "nextStep" and "prevStep" (see above),
// "first", "last" (the last item of the last enabled step).
export function moveTarget(action, p, { stepCount, isEnabled = () => true, subCountOf = () => 0 }) {
  switch (action) {
    case "next": {
      const q = nextPos(p, stepCount);
      return q && (q.step === p.step || isEnabled(q.step)) ? q : null;
    }
    case "prev":
      if (p.sub > 0) return { step: p.step, sub: p.sub - 1 };
      return p.step > 0 ? { step: p.step - 1, sub: subCountOf(p.step - 1) } : null;
    case "nextStep":
      if (p.sub < (p.subCount | 0)) return { step: p.step, sub: p.subCount };
      return p.step < stepCount - 1 && isEnabled(p.step + 1) ? { step: p.step + 1, sub: 0 } : null;
    case "prevStep":
      if (p.sub > 0) return { step: p.step, sub: 0 };
      return p.step > 0 ? { step: p.step - 1, sub: subCountOf(p.step - 1) } : null;
    case "first":
      return { step: 0, sub: 0 };
    case "last": {
      let s = stepCount - 1;
      while (s > 0 && !isEnabled(s)) s--;
      return { step: s, sub: subCountOf(s) };
    }
    default:
      return null;
  }
}

// positionText(pos, stepCount, names) is the stepper's position text for pos = { step, sub, subCount }, the items of a
// step counted from 1 (its overview is item 1 of subCount + 1): with the names of the steps in a sentence (names[k],
// e.g. "step 2.1") "step 2.1, item 3 of 40", without them "step 3 of 0-7, item 3 of 40" (the item part only when the
// step has items).
export function positionText(p, stepCount, names = null) {
  const items = p.subCount > 0 ? `, item ${p.sub + 1} of ${p.subCount + 1}` : "";
  return names ? `${names[p.step]}${items}` : `step ${p.step} of 0-${stepCount - 1}${items}`;
}

// createStepper(el, { steps: [{ id, title }], getPos, setPos }) fills el with the stepper (the step buttons show the
// titles). Extra options: playMs (default 900), isEnabled(stepIndex) (default always true), subCountOf(stepIndex)
// (the subCount of any step, for "previous item" and "last"), names (the names of the steps for the position text),
// onPlayState(playing, playMs) (called when play starts or stops and when the interval changes). Returns { refresh(),
// play(), pause(), jump(pos), move(action), isPlaying(), setPlayMs(ms), destroy() }: call refresh() when the position
// or the subCount changed from outside. jump(pos) stops a play and moves to pos (only stops it when pos is null),
// move(action) jumps to moveTarget(action); both return true when they moved.
export function createStepper(el, { steps, getPos, setPos, playMs = 900, isEnabled = () => true, subCountOf = () => 0, names = null, onPlayState = () => {} } = {}) {
  const n = steps.length;
  const layout = { stepCount: n, isEnabled, subCountOf };
  let timer = 0;
  const arrows = STEPPER_ARROWS.map((a) => ({ ...a, b: iconButton(a.icon, a.label, { class: a.cls }) }));
  const [toPrevStep, toPrev, toNext, toNextStep] = arrows.map((a) => a.b);
  const btnPlay = h("button", { type: "button", class: "stepper-play", "aria-pressed": "false" }, "Play");
  const posText = h("span", { class: "stepper-pos", "aria-live": "polite" });
  const items = steps.map((s, k) => h("button", { type: "button", dataset: { step: k, id: s.id } }, s.title));
  const list = h("ol", { class: "stepper-list" }, items.map((b) => h("li", null, b)));
  el.replaceChildren(h("div", { class: "stepper" }, h("div", { class: "stepper-controls" }, toPrevStep, toPrev, btnPlay, toNext, toNextStep, posText), list));

  const target = (action) => moveTarget(action, getPos(), layout);
  const refresh = () => {
    const p = getPos();
    for (const a of arrows) a.b.disabled = moveTarget(a.action, p, layout) === null;
    posText.textContent = positionText(p, n, names);
    items.forEach((b, k) => {
      if (k === p.step) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
      b.disabled = k !== p.step && !isEnabled(k);
    });
    btnPlay.textContent = timer ? "Pause" : "Play";
    btnPlay.setAttribute("aria-pressed", String(!!timer));
    btnPlay.disabled = !timer && toNext.disabled;
  };
  const pause = () => {
    const was = !!timer;
    if (timer) clearInterval(timer);
    timer = 0;
    refresh();
    if (was) onPlayState(false, playMs);
  };
  const jump = (q) => {
    pause();
    if (q) setPos(q);
    refresh();
    return !!q;
  };
  const move = (action) => jump(target(action));
  const tick = () => {
    const q = target("next");
    if (q) {
      setPos(q);
      refresh();
    }
    if (!q || !target("next")) pause();
    else onPlayState(true, playMs);
  };
  const play = () => {
    if (timer) return;
    timer = setInterval(tick, playMs);
    refresh();
    onPlayState(true, playMs);
  };
  const onArrow = (e) => {
    const a = arrows.find((x) => x.b === e.currentTarget);
    if (a) move(a.action);
  };
  const onPlay = () => (timer ? pause() : play());
  const onList = (e) => {
    const b = e.target.closest("button[data-step]");
    if (!b || b.disabled) return;
    jump({ step: Number(b.dataset.step), sub: 0 });
  };
  for (const a of arrows) a.b.addEventListener("click", onArrow);
  btnPlay.addEventListener("click", onPlay);
  list.addEventListener("click", onList);
  refresh();
  return {
    refresh,
    play,
    pause,
    jump,
    move,
    isPlaying: () => !!timer,
    setPlayMs(ms) {
      playMs = ms;
      if (!timer) return;
      clearInterval(timer);
      timer = setInterval(tick, playMs);
      onPlayState(true, playMs);
    },
    destroy() {
      if (timer) clearInterval(timer);
      timer = 0;
      for (const a of arrows) a.b.removeEventListener("click", onArrow);
      btnPlay.removeEventListener("click", onPlay);
      list.removeEventListener("click", onList);
      el.replaceChildren();
    },
  };
}
