// Numbered page buttons: a row of buttons 1, 2, 3, ... for a list cut into pages of a fixed size, the present page
// marked with aria-current="page", each button with a tooltip and an accessible name given by the caller (for example
// "Genus 6 to 10"). The arrow keys (and Home, End) move the focus between the buttons, Enter or a click selects a
// page (rovingFocus, also used by the Gallery's switch of region types). pagesOf is the pure model (no DOM, used by
// the Node tests).

import { h } from "../dom.mjs";

// pagesOf(from, to, size, step) cuts the whole numbers from, from + step, ... up to to into pages of size numbers, the
// last page shorter when the count is not a multiple of size: [{ index, from, to }] (index from 0, from and to the first
// and the last number of the page). Throws for a size or a step below 1 or to < from.
export function pagesOf(from, to, size, step = 1) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) throw new RangeError(`no numbers from ${from} to ${to}`);
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`page size ${size} is not a whole number from 1`);
  if (!Number.isInteger(step) || step < 1) throw new RangeError(`step ${step} is not a whole number from 1`);
  const last = to - ((to - from) % step);
  const out = [];
  for (let a = from, k = 0; a <= last; a += size * step, k++) out.push({ index: k, from: a, to: Math.min(last, a + (size - 1) * step) });
  return out;
}

// pageCount(n, size) is the number of pages of n items, size per page (at least one page).
export function pageCount(n, size) {
  return Math.max(1, Math.ceil(n / size));
}

// clampPage(k, count) is k when it is a page index of count pages, else 0.
export function clampPage(k, count) {
  return Number.isInteger(k) && k >= 0 && k < count ? k : 0;
}

// rovingFocus(el, buttons) makes a row of buttons one stop of the Tab key: the arrow keys (and Home, End) inside el
// move the focus between the buttons, Enter or a click selects. Returns mark(k): button k becomes the row's Tab stop
// (the caller marks its present button with it).
export function rovingFocus(el, buttons) {
  const mark = (k) => {
    buttons.forEach((b, m) => {
      b.tabIndex = m === k ? 0 : -1;
    });
  };
  el.addEventListener("keydown", (e) => {
    const at = buttons.indexOf(document.activeElement);
    if (at < 0) return;
    const to = { ArrowLeft: at - 1, ArrowUp: at - 1, ArrowRight: at + 1, ArrowDown: at + 1, Home: 0, End: buttons.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const k = Math.max(0, Math.min(buttons.length - 1, to));
    mark(k);
    buttons[k].focus();
  });
  return mark;
}

// createPager({ names, current, label, onSelect }) builds the row of page buttons (one Tab stop, rovingFocus): names[k]
// is the tooltip and the accessible name of page k (the button shows k + 1), label the accessible name of the row.
// onSelect(k) is called when a page is chosen. Returns { el, set(k) (marks page k as the present one), buttons }.
export function createPager({ names, current = 0, label = "pages", onSelect = () => {} }) {
  const buttons = names.map((name, k) => h("button", {
    type: "button", class: "pager-btn", title: name, "aria-label": name, dataset: { page: String(k) },
    onclick: () => onSelect(k),
  }, String(k + 1)));
  const el = h("div", { class: "pager", role: "group", "aria-label": label }, ...buttons);
  const mark = rovingFocus(el, buttons);
  const set = (k) => {
    buttons.forEach((b, m) => {
      if (m === k) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    mark(k);
  };
  set(current);
  return { el, set, buttons };
}
