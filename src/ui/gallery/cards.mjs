// The DOM side of a Gallery card and the drawing of a region into a fixed square: a card is one link holding a
// canvas in a square box and one caption line (WAITING_CAPTION until its region is checked), the action icons at the
// top right (open in the Explorer, edit, show the algorithm: the shared actions of src/ui/actions.mjs), a mark that
// shows the cross of the editor's verdict with its reason when the card's check failed (nothing while the check runs
// or after it passed: the state is in data-state). Nothing in a card changes size after the first paint. An empty place of a grid (createSlot) has the size of a card. Also the switch of region types, the clients
// of the region worker and of the construct worker, and the theme watcher.

import { h } from "../dom.mjs";
import { renderWindow, fittedWindow } from "../../render/hex_canvas.mjs";
import { region } from "../../render/overlays.mjs";
import { CodedError } from "../../core/bigint_utils.mjs";
import { icon } from "../widgets/icons.mjs";
import { rovingFocus } from "../widgets/pager.mjs";
import { fitCard, typeText } from "./model.mjs";

// The caption of a card whose region is not checked yet.
export const WAITING_CAPTION = "constructing ...";

// createCardElement({ label, text }) builds the elements of one card: label is the accessible name of the
// picture, text (optional) a short description of the shape (the
// tooltip and the accessible description of the card's link, shown with a capital first letter). Returns { el, link,
// pic, canvas, cap, mark, acts, setHref(h), setCaption(parts, title), setMark(state, title), setActions(buttons) }
// with state "wait", "ok" or "fail". The action buttons follow the card's link in the keyboard order.
export function createCardElement({ label, text = null } = {}) {
  const canvas = h("canvas", { class: "gal-canvas", role: "img", "aria-label": label, width: "0", height: "0" });
  const pic = h("div", { class: "gal-pic" }, canvas);
  const cap = h("div", { class: "gal-cap gal-cap-wait" }, WAITING_CAPTION);
  const tip = text ? text.charAt(0).toUpperCase() + text.slice(1) : undefined;
  const link = h("a", { class: "gal-link", title: tip, "aria-description": tip }, pic, cap);
  const acts = h("div", { class: "gal-acts" });
  const mark = h("span", { class: "gal-mark", hidden: true });
  const el = h("div", { class: "gal-card", dataset: { state: "wait" } }, link, acts, mark);
  return {
    el, link, pic, canvas, cap, mark, acts,
    setActions(buttons) {
      acts.replaceChildren(...buttons.filter(Boolean));
    },
    setHref(href) {
      if (href) link.setAttribute("href", href);
      else link.removeAttribute("href");
    },
    // parts: [text, ...]: the numbers in each part are set in the monospace face, parts joined by " | ", the parts
    // after the second (symmetry, position) and their separators marked gal-more (a card below 300 pixels hides them,
    // the whole line stays in the caption's tooltip)
    setCaption(parts, title) {
      const kids = [];
      parts.forEach((p, k) => {
        const more = k >= 2 ? " gal-more" : "";
        if (k > 0) kids.push(h("span", { class: `gal-sep${more}` }, " | "));
        const span = h("span", { class: `gal-part${more}` });
        for (const piece of String(p).split(/(-?[0-9]+)/)) {
          if (piece === "") continue;
          span.append(/^-?[0-9]+$/.test(piece) ? h("span", { class: "mono" }, piece) : piece);
        }
        kids.push(span);
      });
      cap.replaceChildren(...kids);
      cap.classList.remove("gal-cap-wait");
      if (title) cap.title = title;
      else cap.removeAttribute("title");
    },
    // a failed check shows the cross with its reason, a passed or running check shows nothing
    setMark(state, title) {
      el.dataset.state = state;
      if (state === "fail") {
        const cross = icon("cross");
        cross.classList.add("gal-cross");
        mark.replaceChildren(cross);
        mark.title = title || "Not verified";
        mark.setAttribute("role", "img");
        mark.setAttribute("aria-label", mark.title);
        mark.hidden = false;
      } else {
        mark.replaceChildren();
        mark.removeAttribute("title");
        mark.removeAttribute("role");
        mark.removeAttribute("aria-label");
        mark.hidden = true;
      }
    },
  };
}

// createSlot() is an empty place of a grid with the size of a card (invisible, hidden from assistive technology).
export function createSlot() {
  return h("div", { class: "gal-slot", "aria-hidden": "true" }, h("div", { class: "gal-pic" }), h("div", { class: "gal-cap" }));
}

// typeSwitch({ colours, current, onSelect }) is the switch of region types of a section: one button per type of
// colours (1, -1, 0), labelled "+1", "-1" or "0" beside a swatch in the fill of that type of the present palette,
// accessible name and tooltip "Regions of type +1", one Tab stop whose arrow keys move between the types as the page
// buttons do (rovingFocus of widgets/pager.mjs). onSelect(colour) is called by a click. Returns { el, set(colour)
// (marks the pressed button), buttons }.
export function typeSwitch({ colours, current, onSelect = () => {} }) {
  const swatch = { 1: "gal-sq-g", "-1": "gal-sq-r", 0: "gal-sq-b" };
  const buttons = colours.map((colour) => {
    const name = `Regions of type ${typeText(colour)}`;
    return h("button", {
      type: "button", class: "gal-sw", dataset: { colour: String(colour) }, title: name, "aria-label": name,
      onclick: () => onSelect(colour),
    }, h("span", { class: `gal-sq ${swatch[colour]}`, "aria-hidden": "true" }), h("span", { class: "mono" }, typeText(colour)));
  });
  const el = h("span", { class: "gal-switch", role: "group", "aria-label": "Region type of this section" }, ...buttons);
  const mark = rovingFocus(el, buttons);
  const set = (colour) => {
    for (const b of buttons) b.setAttribute("aria-pressed", String(Number(b.dataset.colour) === colour));
    mark(colours.indexOf(colour));
  };
  set(current);
  return { el, set, buttons };
}

// regionStyle(cell) is the outline style of the region overlay at a given cell size (thinner below 8 pixels, so that
// small cells keep their colour).
export function regionStyle(cell) {
  return cell < 8 ? { width: Math.max(0.6, cell * 0.22) } : {};
}

// The time slice, in milliseconds, in which the symbols of a card's picture are computed between two frames: a large
// card (about 20000 cells of a number of some hundred digits) then never holds the page for a long task.
export const CARD_SLICE_MS = 10;

const nextTask = () => new Promise((r) => setTimeout(r, 0));

// drawRegion(canvas, { source, cells, side, signal, fit }) draws the region (offset cells relative to the source
// centre) into a square of side pixels: every cell soft, the region at full strength with its outline. fit (optional)
// reuses an earlier fitCard result. The symbols of the window are computed first, in slices of CARD_SLICE_MS between
// frames, then the window is painted once (renderWindow finds every cell computed). Rejects with code "aborted" when
// signal aborts. Resolves with { meta (renderWindow record), fit }.
export async function drawRegion(canvas, { source, cells, side, signal, fit = null }) {
  const f = fit || fitCard(cells, side);
  const rows = fittedWindow(f.bounds, f.cell, f.pad).rows;
  while (source.work(rows, performance.now() + CARD_SLICE_MS) > 0) {
    await nextTask();
    if (signal && signal.aborted) throw new CodedError("aborted", "the drawing was stopped");
  }
  const meta = await renderWindow(canvas, {
    source, bounds: f.bounds, cell: f.cell, pad: f.pad, soft: true, signal,
    overlays: [region(cells, regionStyle(f.cell))],
  });
  return { meta, fit: f };
}

// createRegionWorker(url) is the client of the region worker (src/workers/floodfill.worker.mjs), started on first
// use: fill(x, d, cap) resolves with { result, cells } (cells sorted by (j, i), offsets from (x, d)), verify(witness)
// with the record of verifyWitness. Jobs run in the worker one after the other. terminate() stops the worker and
// rejects the open jobs with code "aborted".
export function createRegionWorker(url) {
  let worker = null;
  let seq = 0;
  const open = new Map();
  let started = 0;
  const failAll = (code, message) => {
    for (const [, p] of open) p.reject(new CodedError(code, message));
    open.clear();
  };
  const ensure = () => {
    if (worker) return worker;
    worker = new Worker(url, { type: "module" });
    started++;
    worker.onmessage = (e) => {
      const m = e.data;
      const p = open.get(m.id);
      if (!p || m.type === "progress") return;
      open.delete(m.id);
      if (m.type === "filled") {
        const flat = m.flat;
        const cells = new Array(flat.length / 2);
        for (let k = 0; k < cells.length; k++) cells[k] = [flat[2 * k], flat[2 * k + 1]];
        p.resolve({ result: m.result, cells, ms: m.ms });
      } else if (m.type === "verified") {
        p.resolve(m.result);
      } else {
        p.reject(new CodedError(m.code || "worker_error", m.message || "the region worker failed"));
      }
    };
    worker.onerror = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      failAll("worker_error", `the region worker stopped: ${(e && e.message) || "error"}`);
      if (worker) worker.terminate();
      worker = null;
    };
    return worker;
  };
  const job = (msg) => new Promise((resolve, reject) => {
    const id = ++seq;
    open.set(id, { resolve, reject });
    ensure().postMessage({ ...msg, id });
  });
  return {
    fill: (x, d, cap) => job({ type: "fill", x: String(x), d: String(d), cap }),
    verify: (witness) => job({ type: "verify", witness }),
    terminate() {
      if (worker) worker.terminate();
      worker = null;
      failAll("aborted", "the page was closed");
    },
    stats: () => ({ alive: worker !== null, started, open: open.size }),
  };
}

// createConstructWorker(url) is the client of the construct worker (src/workers/construct.worker.mjs), started on
// first use: build(input, signal) runs one construction and resolves with its result, or rejects with the code of
// its error event. open(token, signal) opens a stored token there (openToken: a token of a large x is never opened on
// the main thread) and resolves with the value of openToken, or rejects with the code of its error. "aborted" when
// signal aborts: the worker is then stopped, the next job starts a new one. One job at a time (a second call while one
// runs rejects with "busy"). terminate() stops the worker and rejects the open job with "aborted".
export function createConstructWorker(url) {
  let worker = null;
  let seq = 0;
  let open = null;
  let started = 0;
  const stop = () => {
    if (worker) worker.terminate();
    worker = null;
  };
  const end = (fn, value) => {
    const job = open;
    open = null;
    if (job && job.signal) job.signal.removeEventListener("abort", job.onAbort);
    fn(value);
  };
  // run(msg, signal, take): posts one job, take(m, ok, fail) reads each of its messages and ends it by ok or fail
  const run = (msg, signal, take) =>
    new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(new CodedError("aborted", "the card was left"));
      if (open) return reject(new CodedError("busy", "one job at a time"));
      if (!worker) {
        worker = new Worker(url, { type: "module" });
        started++;
      }
      const id = ++seq;
      const onAbort = () => {
        stop();
        end(reject, new CodedError("aborted", "the card was left"));
      };
      open = { id, signal, onAbort, reject };
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      worker.onmessage = (e) => {
        const m = e.data;
        if (!m || !open || m.id !== id) return;
        take(m, (v) => end(resolve, v), (err) => end(reject, err));
      };
      worker.onerror = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        stop();
        end(reject, new CodedError("worker_error", `the construct worker stopped: ${(e && e.message) || "error"}`));
      };
      worker.postMessage({ ...msg, id });
    });
  return {
    build(input, signal = null) {
      let error = null;
      return run({ cmd: "start", input }, signal, (m, ok, fail) => {
        if (Array.isArray(m.events)) for (const ev of m.events) if (ev && ev.type === "error") error = ev;
        if (!m.finished) return;
        if (m.result) ok(m.result);
        else fail(new CodedError(error ? error.code : "construct_failed", error ? error.message : "the construction failed"));
      });
    },
    open(token, signal = null) {
      return run({ cmd: "open", token }, signal, (m, ok, fail) => {
        if (!m.finished) return;
        if (m.error) fail(new CodedError(m.error.code || "bad_token", m.error.message || "the token could not be opened"));
        else ok(m.opened);
      });
    },
    terminate() {
      stop();
      if (open) end(open.reject, new CodedError("aborted", "the page was closed"));
    },
    stats: () => ({ alive: worker !== null, started, busy: open !== null }),
  };
}

// watchTheme(fn) calls fn when data-theme or data-palette of <html> changes (the system's colour scheme is not read).
// Returns the function that stops watching.
export function watchTheme(fn) {
  const mo = typeof MutationObserver === "function" ? new MutationObserver(() => fn()) : null;
  if (mo) mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-palette"] });
  return () => {
    if (mo) mo.disconnect();
  };
}
