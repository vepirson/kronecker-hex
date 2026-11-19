// Popovers: small floating panels opened by a button, the one popover helper of the site. A popover lives inside a
// host element (position: relative, overflow: hidden, for example a full-height page), or, without a host, in the
// document body fixed to the viewport (for a page that scrolls). It is placed beside its anchor button (below or
// above it, aligned to its start or end), is never wider than its maxWidth (360 px by default) nor than the host or
// the viewport less POPOVER_EDGE on both sides, nor taller than the room left (a long content scrolls inside it), and
// never changes the size of the page.
//
// At most one popover of the whole site is open: opening one closes the open one, of any group. Escape closes it (and
// the key goes no further), Tab and Shift+Tab go round its controls, a press outside it and outside its anchor closes
// it, and that press does nothing else (it does not reach the canvas or the control under it, a click still does).
// When it opens the focus moves to its first control (a popover made with textOnTouch false skips its text fields when
// a touch opened it, so that a phone's keyboard does not come up), when it closes with the focus inside it the focus
// returns to its anchor (not after a press outside: the press puts the focus where it was made). A group holds the
// popovers of one page: group.destroy() removes the listeners and every popover element.

import { h } from "../dom.mjs";

// Room kept between a popover and its anchor, and between a popover and the edge of its host, in CSS pixels.
export const POPOVER_GAP = 6;
export const POPOVER_EDGE = 8;
// Widest popover by default, in CSS pixels.
export const POPOVER_MAX_WIDTH = 360;

// popoverBox({ anchor, host, placement, align, width, maxWidth }) computes the position of a popover from the
// rectangles of its anchor and its host ({ left, top, right, bottom } in the same coordinates): { left, top or bottom,
// maxHeight, maxWidth } in pixels relative to the host. placement "below" or "above", align "start" (left edges
// together) or "end" (right edges together), width the popover's current width (to keep it inside the host), maxWidth
// the widest it may be (default POPOVER_MAX_WIDTH).
export function popoverBox({ anchor, host, placement = "below", align = "start", width = 0, maxWidth: widest = POPOVER_MAX_WIDTH }) {
  const hw = host.right - host.left;
  const hh = host.bottom - host.top;
  const maxWidth = Math.max(80, Math.min(widest, hw - 2 * POPOVER_EDGE));
  const w = Math.min(width || maxWidth, maxWidth);
  let left = align === "end" ? anchor.right - host.left - w : anchor.left - host.left;
  left = Math.max(POPOVER_EDGE, Math.min(left, hw - POPOVER_EDGE - w));
  const out = { left: Math.round(left), maxWidth: Math.round(maxWidth) };
  if (placement === "above") {
    out.bottom = Math.round(host.bottom - anchor.top + POPOVER_GAP);
    out.maxHeight = Math.max(60, Math.round(anchor.top - host.top - POPOVER_GAP - POPOVER_EDGE));
  } else {
    out.top = Math.round(anchor.bottom - host.top + POPOVER_GAP);
    out.maxHeight = Math.max(60, Math.round(hh - (anchor.bottom - host.top) - POPOVER_GAP - POPOVER_EDGE));
  }
  return out;
}

const FOCUSABLE = 'button:not([disabled]), input:not([type="hidden"]):not([disabled]), textarea, select, a[href], [tabindex]:not([tabindex="-1"])';
// every control Tab can reach inside a popover (the ends of this list are where Tab wraps around)
const TABBABLE = `${FOCUSABLE}, summary`;
// the controls that take typed text (a phone's keyboard comes up when they take the focus)
const TEXT_FIELD = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="number"], input[type="url"]';

// the open popover of the whole site (of any group), or null
let openNow = null;

// the rectangle of the viewport, the host of a popover without a host element
const viewportRect = () => ({ left: 0, top: 0, right: document.documentElement.clientWidth, bottom: window.innerHeight });

const focusQuietly = (el) => {
  try {
    el.focus({ preventScroll: true });
  } catch {
    // the element may be hidden
  }
};

// createPopoverGroup() returns { create(options), closeAll(), openOne(), destroy() }.
// create({ anchor, host, id, label, placement, align, build, onOpen, onClose, className, maxWidth, anchorBox }) makes a
// popover for the button anchor (click toggles it). host null or absent: the popover is fixed to the viewport (in the
// document body). build(el) fills the popover each time it opens (optional, else it keeps its content), onOpen(el) and
// onClose(el) are called after opening and closing, maxWidth is the widest it may be (default POPOVER_MAX_WIDTH),
// anchorBox() the rectangle the popover is placed beside (default the anchor's, for example a whole row of controls
// that the popover must not cover), textOnTouch (default true) false: opened by a touch, the focus goes to its first
// control that is not a text field. Returns { el, open(), close({ returnFocus }), toggle(), isOpen(), place() }
// (returnFocus default true). closeAll() closes the open popover of the group and returns true when one was open.
export function createPopoverGroup() {
  const all = [];
  let current = null;

  const onKey = (e) => {
    if (e.key === "Tab" && current) {
      // Tab stays inside the open popover: from the last control to the first, Shift+Tab from the first to the last
      const list = [...current.el.querySelectorAll(TABBABLE)].filter((x) => x.tabIndex >= 0 && x.getClientRects().length > 0);
      if (list.length === 0 || !current.el.contains(document.activeElement)) return;
      const first = list[0];
      const last = list[list.length - 1];
      const to = e.shiftKey ? (document.activeElement === first ? last : null) : document.activeElement === last ? first : null;
      if (to) {
        e.preventDefault();
        focusQuietly(to);
      }
      return;
    }
    if (e.key !== "Escape" || !current) return;
    const p = current;
    p.close();
    e.preventDefault();
    e.stopPropagation();
    focusQuietly(p.anchor);
  };
  const onDown = (e) => {
    if (!current) return;
    const t = e.target;
    if (current.el.contains(t) || current.anchor.contains(t)) return;
    // the press moves the focus to what was pressed, and it does nothing else: it never reaches a canvas or any other
    // listener of the press (a click on a button still works)
    current.close({ returnFocus: false });
    e.stopPropagation();
  };
  const onResize = () => {
    if (current) current.place();
  };
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onDown, true);
  window.addEventListener("resize", onResize);
  // a fixed popover follows its anchor when the page scrolls
  window.addEventListener("scroll", onResize, true);

  function create({ anchor, host = null, id, label, placement = "below", align = "start", build = null, onOpen = null, onClose = null, className = "", maxWidth = POPOVER_MAX_WIDTH, anchorBox = null, textOnTouch = true }) {
    const el = h("div", { class: ["popover", className], id, role: "dialog", "aria-label": label || null, hidden: true });
    if (host) host.appendChild(el);
    else {
      el.style.position = "fixed";
      document.body.appendChild(el);
    }
    anchor.setAttribute("aria-expanded", "false");
    if (id) anchor.setAttribute("aria-controls", id);
    const p = {
      el,
      anchor,
      place() {
        const a = anchorBox ? anchorBox() : anchor.getBoundingClientRect();
        const hr = host ? host.getBoundingClientRect() : viewportRect();
        el.style.maxWidth = "";
        const box = popoverBox({ anchor: a, host: hr, placement, align, width: el.offsetWidth, maxWidth });
        el.style.left = `${box.left}px`;
        el.style.maxWidth = `${box.maxWidth}px`;
        el.style.maxHeight = `${box.maxHeight}px`;
        if (box.top !== undefined) {
          el.style.top = `${box.top}px`;
          el.style.bottom = "";
        } else {
          el.style.bottom = `${box.bottom}px`;
          el.style.top = "";
        }
      },
      isOpen() {
        return current === p;
      },
      open() {
        if (current === p) return;
        if (openNow) openNow.close();
        if (build) build(el);
        el.hidden = false;
        current = p;
        openNow = p;
        anchor.setAttribute("aria-expanded", "true");
        p.place();
        p.place(); // the second pass uses the width of the placed content
        const skipText = !textOnTouch && touchPress;
        const first = skipText ? [...el.querySelectorAll(FOCUSABLE)].find((x) => !x.matches(TEXT_FIELD)) : el.querySelector(FOCUSABLE);
        if (first) focusQuietly(first);
        if (onOpen) onOpen(el);
      },
      close({ returnFocus = true } = {}) {
        if (current !== p) return;
        const hadFocus = el.contains(document.activeElement);
        current = null;
        if (openNow === p) openNow = null;
        el.hidden = true;
        anchor.setAttribute("aria-expanded", "false");
        if (hadFocus && returnFocus) focusQuietly(anchor);
        if (onClose) onClose(el);
      },
      toggle() {
        if (current === p) p.close();
        else p.open();
      },
    };
    // the kind of the last press on the anchor: a touch opens without a text field's focus when textOnTouch is false
    let touchPress = false;
    const onAnchorDown = (e) => {
      touchPress = e.pointerType === "touch";
    };
    const onAnchorKey = () => {
      touchPress = false;
    };
    anchor.addEventListener("pointerdown", onAnchorDown);
    anchor.addEventListener("keydown", onAnchorKey);
    anchor.addEventListener("click", p.toggle);
    p.off = () => {
      anchor.removeEventListener("click", p.toggle);
      anchor.removeEventListener("pointerdown", onAnchorDown);
      anchor.removeEventListener("keydown", onAnchorKey);
    };
    all.push(p);
    return p;
  }

  return {
    create,
    closeAll() {
      if (!current) return false;
      current.close();
      return true;
    },
    openOne() {
      return current;
    },
    destroy() {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      for (const p of all) {
        p.off();
        p.el.remove();
      }
      if (openNow && all.includes(openNow)) openNow = null;
      all.length = 0;
      current = null;
    },
  };
}
