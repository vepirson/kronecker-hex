// The progress display of a long construction, one widget for every page that runs one (the shape editor's Build, a
// run of the Algorithm page in the background): a bar with the overall fraction of the run and its percent, one short
// line saying where the run is (cut with an ellipsis, the full sentence in its tooltip), the time the run has taken and
// the estimate of the time left (run_estimate.mjs, from the progress measured in this run), and a Stop button. Escape
// stops too while the focus is inside the widget. The bar is a progressbar for screen readers, and a polite live line
// says the percent and the place at most once per ANNOUNCE_MS.
//
// The fraction shown never goes back: a value below the largest one seen keeps the bar where it is (a construction
// that has to try a second candidate repeats some of its work). The styles are the classes run-progress of
// styles/base.css.

import { h } from "../dom.mjs";
import { estimateText, elapsedText, RECENT_MS } from "../run_estimate.mjs";

// The live line for screen readers says the progress at most once per this many milliseconds.
export const ANNOUNCE_MS = 5000;
// The time texts are written again once per this many milliseconds while the run goes on.
export const TICK_MS = 1000;
// The word of the button that stops the run.
export const STOP_WORD = "Stop";

// createRunProgress({ host, id, stopId, label, onStop, now }) builds the widget (not in the page yet) and returns { el,
// begin(), set({ fraction, line, full }), end(), running(), fraction(), shownLeft() }.
//   host    the element the widget is added to by begin() (and removed from by end())
//   label   what runs, for the screen reader ("Packing the shape")
//   onStop  called by the Stop button and by Escape inside the widget
//   now     the clock in milliseconds (default performance.now)
// begin() starts a run at 0 %, set() gives its progress (fraction 0 .. 1 or null while unknown, line the short text,
// full the long one for the tooltip, default line), end() removes the widget and stops its clock.
export function createRunProgress({ host, id = null, stopId = null, label = "Construction", onStop = () => {}, now = () => performance.now() } = {}) {
  const fill = h("span", { class: "run-progress-fill" });
  const bar = h("div", { class: "run-progress-bar", role: "progressbar", "aria-label": `Progress: ${label}`, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, fill);
  const percent = h("span", { class: "run-progress-percent" }, "0%");
  const stop = h("button", { type: "button", class: "text-btn run-progress-stop", id: stopId, title: "Stop the run" }, STOP_WORD);
  const line = h("span", { class: "run-progress-line" });
  const time = h("span", { class: "run-progress-time" });
  const say = h("span", { class: "sr-only", "aria-live": "polite" });
  const el = h(
    "div",
    { class: "run-progress", id, role: "group", "aria-label": label },
    h("div", { class: "run-progress-row" }, bar, percent, stop),
    h("div", { class: "run-progress-row" }, line),
    h("div", { class: "run-progress-row" }, time),
    say,
  );
  let t0 = 0;
  let shown = 0;
  let samples = [];
  let timer = 0;
  let lastSaid = -Infinity;
  let left = null;
  let on = false;

  stop.addEventListener("click", () => onStop());
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !on) return;
    e.preventDefault();
    e.stopPropagation();
    onStop();
  });

  // the time texts: the elapsed time and, once there is one, the estimate
  function writeTime() {
    const t = now() - t0;
    const parts = [elapsedText(t)];
    if (left) parts.push(left);
    const text = parts.join(" | ");
    if (time.textContent !== text) time.textContent = text;
    el.dataset.estimate = left ? "1" : "0";
  }
  function announce(force = false) {
    const t = now();
    if (!force && t - lastSaid < ANNOUNCE_MS) return;
    lastSaid = t;
    say.textContent = `${Math.floor(shown * 100)}%${line.textContent ? `, ${line.textContent}` : ""}${left ? `, ${left}` : ""}`;
  }

  return {
    el,
    begin() {
      t0 = now();
      shown = 0;
      samples = [];
      left = null;
      lastSaid = -Infinity;
      on = true;
      line.textContent = "";
      line.removeAttribute("title");
      fill.style.width = "0%";
      percent.textContent = "0%";
      bar.setAttribute("aria-valuenow", "0");
      el.dataset.fraction = "0";
      writeTime();
      if (host && el.parentNode !== host) host.append(el);
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (!on) return;
        writeTime();
        announce();
      }, TICK_MS);
    },
    set({ fraction = null, line: text = "", full = null } = {}) {
      if (!on) return;
      if (Number.isFinite(fraction)) {
        const f = Math.max(0, Math.min(1, fraction));
        if (f > shown) shown = f;
        const t = now() - t0;
        samples.push({ t, f: shown });
        // the samples the estimate reads: the recent ones and the last one before them
        const cut = t - RECENT_MS;
        let k = 0;
        while (k + 1 < samples.length && samples[k + 1].t <= cut) k++;
        if (k > 0) samples = samples.slice(k);
        left = estimateText(samples);
      }
      const pct = Math.floor(shown * 100);
      fill.style.width = `${(shown * 100).toFixed(1)}%`;
      if (percent.textContent !== `${pct}%`) percent.textContent = `${pct}%`;
      bar.setAttribute("aria-valuenow", String(pct));
      el.dataset.fraction = shown.toFixed(4);
      if (line.textContent !== text) line.textContent = text;
      const tip = full || text;
      if (tip) line.title = tip;
      else line.removeAttribute("title");
      writeTime();
      announce();
    },
    end() {
      on = false;
      if (timer) clearInterval(timer);
      timer = 0;
      // the focus inside the widget goes back to the page before the widget leaves it
      if (el.contains(document.activeElement)) document.activeElement.blur();
      el.remove();
    },
    running: () => on,
    fraction: () => shown,
    shownLeft: () => left,
  };
}
