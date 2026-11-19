// The sign-pattern plot of the Proof page (its figure A). For an odd prime q and k consecutive cells (offsets
// 0 .. k - 1) it counts, for each of the 2^k sign patterns, the residues r mod q with (r + t | q) equal to the
// pattern at every t (the k residues with r + t = 0 mod q for some t are not usable), and draws the counts A against
// the main term q / 2^k and the band of the character-sum argument (Lemma 5 of the page):
//   A >= q / 2^k - (k / 2) sqrt(q) - k / 2   and   A <= q / 2^k + (k / 2) sqrt(q),
// which guarantees every pattern once q >= k^2 4^k.
//
// patternCounts and weilBand are the pure functions behind every number the plot prints (tested in Node).

import { h, svg } from "../dom.mjs";
import { signBits } from "../../construct/row_solver.mjs";
import { isPrimeSmall } from "../../core/primes.mjs";
import { figureCaption } from "./genus_slider.mjs";
import { iconButton } from "./icons.mjs";

// Largest k offered, largest q accepted.
export const K_MAX = 6;
export const Q_MAX = 1000000;

// For k = 2, 3, 4, 5 consecutive offsets: the smallest prime from which on every sign pattern occurs for every
// prime (checked in the tests up to k^2 4^k by direct count, and above k^2 4^k it is the lemma).
export const WEIL_THRESHOLDS = Object.freeze({ 2: 7, 3: 19, 4: 59, 5: 197 });

// The bound k^2 4^k of the lemma.
export function proofThreshold(k) {
  return k * k * 4 ** k;
}

function checkQK(q, k) {
  if (!Number.isInteger(k) || k < 1 || k > 16) throw new Error(`k must be an integer 1 .. 16, got ${k}`);
  if (!Number.isSafeInteger(q) || q < 3 || q % 2 === 0 || q <= k || !isPrimeSmall(q)) throw new Error(`q must be an odd prime above k, got ${q}`);
}

// patternCounts(q, k) returns { q, k, counts, usable, missing, fewest, most }: counts[v] is the number of usable
// residues r mod q whose pattern is v, where bit t of v is set exactly when (r + t | q) = -1. usable = q - k is the
// number of residues with r + t != 0 mod q for t = 0 .. k - 1, missing the number of patterns with count 0.
export function patternCounts(q, k) {
  checkQK(q, k);
  const offs = Array.from({ length: k }, (_, t) => t);
  const { lo, bad } = signBits(q, offs);
  const counts = new Array(2 ** k).fill(0);
  let usable = 0;
  for (let r = 0; r < q; r++) {
    if (bad[r]) continue;
    counts[lo[r]]++;
    usable++;
  }
  let missing = 0;
  let fewest = Infinity;
  let most = 0;
  for (const c of counts) {
    if (c === 0) missing++;
    if (c < fewest) fewest = c;
    if (c > most) most = c;
  }
  return { q, k, counts, usable, missing, fewest, most };
}

// weilBand(q, k) returns { main, lower, upper, threshold, guaranteed }: main = q / 2^k, lower = main - (k / 2)
// sqrt(q) - k / 2, upper = main + (k / 2) sqrt(q), threshold = k^2 4^k, guaranteed = (q >= threshold), in which case
// lower >= (k / 2)(sqrt(q) - 1) > 0.
export function weilBand(q, k) {
  const main = q / 2 ** k;
  const s = Math.sqrt(q);
  const threshold = proofThreshold(k);
  return { main, lower: main - (k / 2) * s - k / 2, upper: main + (k / 2) * s, threshold, guaranteed: q >= threshold };
}

// patternLabel(v, k): the pattern v as k signs, t = 0 first ("+" for a residue, "-" for a non-residue).
export function patternLabel(v, k) {
  let s = "";
  for (let t = 0; t < k; t++) s += (v >> t) & 1 ? "-" : "+";
  return s;
}

// The smallest odd prime q >= n with q > k, or null above Q_MAX.
export function primeAtLeast(n, k) {
  let q = Math.max(3, k + 1, Math.ceil(Number(n) || 3));
  while (q <= Q_MAX) {
    if (q % 2 === 1 && isPrimeSmall(q)) return q;
    q++;
  }
  return null;
}

// The largest odd prime q' < q with q' > k, or null.
export function primeBelow(q, k) {
  for (let p = q - 1; p > k && p >= 3; p--) if (p % 2 === 1 && isPrimeSmall(p)) return p;
  return null;
}

const fmt = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1));

// The text lines (with $...$ formulas) of the plot for patternCounts and weilBand of the same (q, k).
export function plotLines(pc, band) {
  const { q, k } = pc;
  const total = 2 ** k;
  const lines = [];
  lines.push(`$q=${q}$, $k=${k}$ consecutive cells: $q-k=${pc.usable}$ usable residues, spread over the $2^{${k}}=${total}$ sign patterns. ` +
    (pc.missing === 0 ? `Every pattern occurs (fewest ${pc.fewest}, most ${pc.most}).` : `${pc.missing} of the ${total} patterns ${pc.missing === 1 ? "does" : "do"} not occur.`));
  lines.push(`Main term $q/2^{k}=${fmt(band.main)}$. The argument of the lemma puts every count between $${fmt(band.lower)}$ and $${fmt(band.upper)}$.`);
  lines.push(band.guaranteed
    ? `Here $q\\ge k^{2}4^{k}=${band.threshold}$, so the lower end is positive and every pattern must occur.`
    : `Here $q<k^{2}4^{k}=${band.threshold}$, so the lower end${band.lower > 0 ? "" : " is not positive and"} guarantees ${band.lower > 0 ? "every pattern anyway" : "nothing"}.`);
  return lines;
}

// The width of the chart in the units of its picture, and the size of its text on the screen in CSS pixels.
export const PLOT_W = 640;
export const TICK_PX = 11;

// The one caption line of the plot.
export function plotCaption(pc) {
  const total = 2 ** pc.k;
  return `$q=${pc.q}$, $k=${pc.k}$: ` + (pc.missing === 0 ? `all ${total} patterns occur` : `${pc.missing} of ${total} patterns missing`);
}

// mountWeilPlot(el, { q, k }) shows the plot with its controls in el and returns { set(q, k), state(), destroy() }.
// state() = { q, k, counts, band }. The root element carries data-q, data-k, data-missing.
export function mountWeilPlot(el, { q = 577, k = 3 } = {}) {
  let cur = { q, k };
  let pc = null;
  let band = null;
  const kSel = h("select", { "aria-label": "Number of cells k", id: "proof-weil-k" },
    ...Array.from({ length: K_MAX }, (_, t) => h("option", { value: String(t + 1) }, String(t + 1))));
  const qIn = h("input", { type: "number", min: "3", max: String(Q_MAX), step: "1", "aria-label": "Prime q", id: "proof-weil-q", class: "proof-num" });
  // one row of controls, also on a phone: short labels, the meaning in the tooltip
  // the arrows of the stepper (one item back and on) of the icon set
  const prev = iconButton("prev", "Previous prime", { class: "proof-step", id: "proof-weil-prev" });
  const next = iconButton("next", "Next prime", { class: "proof-step", id: "proof-weil-next" });
  const small = h("button", { type: "button", id: "proof-weil-small", title: "Just below the threshold" }, "Small q");
  const big = h("button", { type: "button", id: "proof-weil-big", title: "The bound k^2 4^k" }, "Lemma q");
  const plot = h("div", { class: "proof-plot", id: "proof-weil-svg" });
  const caption = figureCaption("proof-weil-facts");
  const info = caption.box;
  const root = h("div", { class: "proof-weil" },
    h("div", { class: "proof-controls proof-weil-controls" },
      h("label", { class: "proof-label" }, "k ", kSel),
      h("label", { class: "proof-label" }, "q ", qIn),
      prev, next, small, big),
    plot, info);
  el.appendChild(root);

  // the size of the chart's text in the units of its picture (TICK_PX on the screen, see fitText below)
  let fontUnits = TICK_PX;

  function draw() {
    const { counts } = pc;
    // the left margin holds the value of the dashed line in the text's present size (a monospace digit is 0.62 em)
    const L = Math.max(46, Math.ceil(fontUnits * 0.62 * fmt(band.main).length) + 10);
    const W = PLOT_W, H = 250, R = 10, T = 12, B = pc.k <= 4 ? 44 : 22;
    const n = counts.length;
    const top = Math.max(band.upper, pc.most, 1) * 1.08;
    const y = (v) => T + (H - T - B) * (1 - Math.max(0, v) / top);
    const bw = (W - L - R) / n;
    const parts = [];
    parts.push(svg("rect", { x: L, y: y(band.upper), width: W - L - R, height: Math.max(0, y(Math.max(0, band.lower)) - y(band.upper)), class: "pw-band" }));
    for (let v = 0; v < n; v++) {
      const x = L + v * bw;
      const c = counts[v];
      if (c > 0) {
        parts.push(svg("rect", { x: x + bw * 0.12, y: y(c), width: bw * 0.76, height: y(0) - y(c), class: "pw-bar" },
          svg("title", null, `${patternLabel(v, pc.k)}: ${c} residues`)));
      } else {
        const cx = x + bw / 2, cy = y(0) - 6, d = Math.min(5, bw * 0.3);
        parts.push(svg("path", { d: `M${cx - d} ${cy - d}L${cx + d} ${cy + d}M${cx - d} ${cy + d}L${cx + d} ${cy - d}`, class: "pw-miss" },
          svg("title", null, `${patternLabel(v, pc.k)}: no residue`)));
      }
      if (pc.k <= 4) {
        parts.push(svg("text", { x: x + bw / 2, y: H - B + 14, class: "pw-tick", "text-anchor": "middle" }, patternLabel(v, pc.k)));
      }
    }
    parts.push(svg("line", { x1: L, x2: W - R, y1: y(band.main), y2: y(band.main), class: "pw-main" }));
    if (band.lower > 0) parts.push(svg("line", { x1: L, x2: W - R, y1: y(band.lower), y2: y(band.lower), class: "pw-lower" }));
    parts.push(svg("line", { x1: L, x2: W - R, y1: y(0), y2: y(0), class: "pw-axis" }));
    parts.push(svg("text", { x: L - 6, y: y(0) + 4, class: "pw-tick", "text-anchor": "end" }, "0"));
    parts.push(svg("text", { x: L - 6, y: y(band.main) + 4, class: "pw-tick", "text-anchor": "end" }, fmt(band.main)));
    parts.push(svg("text", { x: L, y: H - 4, class: "pw-tick" }, pc.k <= 4 ? "" : `${n} patterns, from + + ... + to - - ... -`));
    plot.replaceChildren(svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "pw-svg", role: "img", "aria-label": `Counts of the ${n} sign patterns for q = ${pc.q}` }, ...parts));
  }

  function show() {
    pc = patternCounts(cur.q, cur.k);
    band = weilBand(cur.q, cur.k);
    kSel.value = String(cur.k);
    qIn.value = String(cur.q);
    const thr = WEIL_THRESHOLDS[cur.k];
    small.disabled = !(thr && primeBelow(thr, cur.k));
    draw();
    caption.set(plotCaption(pc), plotLines(pc, band));
    root.dataset.q = String(cur.q);
    root.dataset.k = String(cur.k);
    root.dataset.missing = String(pc.missing);
  }

  const setQ = (q2) => {
    const p = primeAtLeast(q2, cur.k);
    if (p !== null) cur = { ...cur, q: p };
    show();
  };
  kSel.addEventListener("change", () => {
    const k2 = Number(kSel.value);
    cur = { k: k2, q: cur.q > k2 ? cur.q : primeAtLeast(k2 + 1, k2) };
    setQ(cur.q);
  });
  qIn.addEventListener("change", () => setQ(Number(qIn.value)));
  prev.addEventListener("click", () => {
    const p = primeBelow(cur.q, cur.k);
    if (p !== null) setQ(p);
  });
  next.addEventListener("click", () => setQ(cur.q + 1));
  small.addEventListener("click", () => {
    const thr = WEIL_THRESHOLDS[cur.k];
    const p = thr ? primeBelow(thr, cur.k) : null;
    if (p !== null) setQ(p);
  });
  big.addEventListener("click", () => setQ(proofThreshold(cur.k)));
  setQ(q);
  // the text of the axis and of the patterns keeps TICK_PX on the screen when the chart is drawn smaller (a phone):
  // its size in the units of the picture follows the drawn width
  const fitText = () => {
    const w = plot.clientWidth;
    if (!(w > 0)) return;
    const units = (TICK_PX * PLOT_W) / Math.min(w, PLOT_W);
    plot.style.setProperty("--pw-font", `${units.toFixed(2)}px`);
    // a new size of the text draws the chart again with a left margin to hold it
    if (Math.abs(units - fontUnits) > 0.25) {
      fontUnits = units;
      draw();
    }
  };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fitText) : null;
  if (ro) ro.observe(plot);
  fitText();

  return {
    set(q2, k2) {
      cur = { k: Math.max(1, Math.min(K_MAX, Math.round(Number(k2) || cur.k))), q: cur.q };
      setQ(q2);
    },
    state: () => ({ q: cur.q, k: cur.k, counts: pc.counts.slice(), missing: pc.missing, band: { ...band } }),
    destroy() {
      if (ro) ro.disconnect();
      el.replaceChildren();
    },
  };
}
