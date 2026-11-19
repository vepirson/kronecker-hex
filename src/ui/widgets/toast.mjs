// The note line of a full-page view (the Explorer, the shape editor): one line at the top centre of the page's host
// element, at the height of the page's top-left row, and below the page's top controls when the page is too narrow
// for it between them (avoid). An error stays until its close button is pressed, any other note fades after NOTE_MS.
// The styles are the classes xp-toast of styles/explore.css.

import { h, messageOf } from "../dom.mjs";
import { iconButton } from "./icons.mjs";

// A note (not an error) of the toast line disappears after this many milliseconds. An error stays until closed.
export const NOTE_MS = 6000;
// The room kept between the note line and a control it moves below, in CSS pixels.
export const NOTE_GAP = 8;

// errorNote(sentence, error) is an error for a visitor: the plain sentence, with the error's code and message (a
// CodedError, or { code, message }) in its tooltip only. Returns the nodes for say() (or for any other line).
export function errorNote(sentence, error) {
  const code = (error && error.code) || "error";
  const msg = messageOf(error);
  return [h("span", { class: "xp-toast-sentence", title: msg ? `${code}: ${msg}` : String(code) }, sentence)];
}

// noteTop(note, controls, hostTop) is the top of the note line (pixels from the top of its host) when it would meet
// one of the controls left or right of it (rectangles { left, right, bottom } on the screen, a control of no width
// does not count): NOTE_GAP below the lowest of those, else null (the line keeps the top of its style). note: the
// line's rectangle { left, right } at its own top.
export function noteTop(note, controls, hostTop) {
  const hit = controls.filter((b) => b.right > b.left && b.left < note.right + NOTE_GAP && b.right > note.left - NOTE_GAP);
  return hit.length ? Math.round(Math.max(...hit.map((b) => b.bottom)) - hostTop + NOTE_GAP) : null;
}

// createToast({ id, avoid }) builds the line (role status, hidden) and returns { el, say(text, kind, code), place(),
// destroy() }.
// say(text, kind, code) shows text (a string or a list of nodes), kind "error" keeps it with a close button, an empty
// text hides the line. say clears el.dataset.kind and el.dataset.code first and writes code (the error code of the
// message, when given) into el.dataset.code. avoid() lists the page's top controls the line never covers (noteTop).
export function createToast({ id, avoid = null } = {}) {
  const text = h("span", { class: "xp-toast-text" });
  const close = iconButton("close", "Close", { class: "xp-toast-close", hidden: true });
  const el = h("div", { class: "xp-toast float", id, role: "status", hidden: true }, text, close);
  let timer = 0;
  let destroyed = false;

  // place(): the line at the top of its style, or below the top controls it would meet there
  function place() {
    el.style.top = "";
    if (el.hidden || !avoid || !el.offsetParent) return;
    const controls = avoid().filter(Boolean).map((c) => c.getBoundingClientRect());
    const top = noteTop(el.getBoundingClientRect(), controls, el.offsetParent.getBoundingClientRect().top);
    if (top !== null) el.style.top = `${top}px`;
  }
  window.addEventListener("resize", place);

  function say(t, kind = "", code = null) {
    if (timer) clearTimeout(timer);
    timer = 0;
    delete el.dataset.kind;
    delete el.dataset.code;
    el.classList.toggle("xp-toast-error", kind === "error");
    if (t === null || t === undefined || t === "" || (Array.isArray(t) && t.length === 0)) {
      text.replaceChildren();
      el.hidden = true;
      return;
    }
    if (Array.isArray(t)) text.replaceChildren(...t);
    else text.replaceChildren(String(t));
    if (kind) el.dataset.kind = kind;
    if (code) el.dataset.code = code;
    el.hidden = false;
    close.hidden = kind !== "error";
    place();
    if (kind !== "error") {
      timer = setTimeout(() => {
        timer = 0;
        if (!destroyed) el.hidden = true;
      }, NOTE_MS);
    }
  }
  close.addEventListener("click", () => say(""));

  return {
    el,
    say,
    // place(): the line placed again (the page calls it once its styles have loaded and its controls have their size)
    place,
    destroy() {
      destroyed = true;
      window.removeEventListener("resize", place);
      if (timer) clearTimeout(timer);
      timer = 0;
    },
  };
}
