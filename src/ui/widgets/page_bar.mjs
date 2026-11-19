// The page bar of the canvas pages (the Explorer, the Edit page, the Algorithm page): the three page actions, always
// all three in the header's order, eye (the Explorer), pencil (the Edit page), flask (the Algorithm page), with the
// icons of PAGE_ICONS and the names of PAGE_ACTIONS. The button of the page that shows the bar is disabled with the
// tooltip THIS_PAGE. The page says what each of the other two does (onPress) and, after every change of what it
// shows, whether it can be done now: set(page, null) enables it, set(page, why) disables it with the short reason why
// as its tooltip (a disabled control keeps its place and says why). The accessible name stays the action's name.
//
// Usage:
//   const bar = createPageBar({ current: "lab", ids: { explore: "lab-to-explore", edit: "lab-to-edit" }, onPress: { explore: () => .., edit: () => .. } });
//   row.append(bar.el);   bar.set("edit", null);   bar.set("explore", "Not admissible");

import { h } from "../dom.mjs";
import { pageIconButton, setIconLabel, PAGE_ACTIONS } from "./icons.mjs";

// The pages of the bar, in the order of the header.
export const PAGE_BAR_PAGES = Object.freeze(["explore", "edit", "lab"]);
// The tooltip of the button of the page the bar is on.
export const THIS_PAGE = "This page";

// createPageBar({ current, ids, labels, onPress, className }) builds the bar. current: the page that shows it
// ("explore", "edit" or "lab"). ids: { explore, edit, lab } the ids of the buttons. labels: names that replace the
// names of PAGE_ACTIONS (none are needed today). onPress: { page: () => .. } what a press of each other button does.
// className: more classes of the bar. Returns { el, buttons: { explore, edit, lab }, set(page, why) }. The two
// buttons other than current start enabled.
export function createPageBar({ current, ids = {}, labels = {}, onPress = {}, className = null } = {}) {
  if (!PAGE_BAR_PAGES.includes(current)) throw new Error(`unknown page ${JSON.stringify(current)}`);
  const buttons = {};
  const nameOf = (p) => labels[p] || PAGE_ACTIONS[p];
  for (const p of PAGE_BAR_PAGES) {
    const b = pageIconButton(p, nameOf(p), { id: ids[p], dataset: { page: p } });
    if (p === current) {
      b.disabled = true;
      b.title = THIS_PAGE;
    } else {
      b.addEventListener("click", () => {
        if (!b.disabled && onPress[p]) onPress[p]();
      });
    }
    buttons[p] = b;
  }
  const el = h("span", { class: ["page-bar", className], role: "group", "aria-label": "Pages" }, PAGE_BAR_PAGES.map((p) => buttons[p]));
  return {
    el,
    buttons,
    // set(page, why): the action of page on (why null) or disabled with the reason why as its tooltip. The button of
    // the current page stays as it is.
    set(page, why = null) {
      const b = buttons[page];
      if (!b || page === current) return;
      b.disabled = !!why;
      setIconLabel(b, nameOf(page));
      if (why) b.title = why;
    },
  };
}
