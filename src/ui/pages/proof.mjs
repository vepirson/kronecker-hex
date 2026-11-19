// The Proof page: an expository article on the packing criterion (a shape is packed into infinitely many (x, d) if
// and only if its cells of region type +1 or -1 miss a residue class modulo every prime) and its consequence, every
// genus for each region type. The text of each section is an HTML fragment in content/proof/, typeset with KaTeX through
// widgets/math.mjs. The figures are mounted into the placeholders <div class="proof-figure" data-figure="...">
// of the fragments. Each figure: one row of controls, the canvas (reserved height), one caption line with the live
// numbers, and the longer lines behind a "details" disclosure.
//
// The pure functions behind every number a figure of this module prints (regionFacts, necessityFacts,
// necessityText, factorExample, factorFacts) are exported and tested in Node. The widgets have their own.

import { h, useStyles, loadText } from "../dom.mjs";
import { renderMathIn } from "../widgets/math.mjs";
import { shortNumber } from "../widgets/bignum.mjs";
import { mountWeilPlot } from "../widgets/weil_plot.mjs";
import { mountGenusSlider, hexFigure, figureCaption } from "../widgets/genus_slider.mjs";
import { mountSievePlayground } from "../widgets/sieve_playground.mjs";
import { kroneckerSource, staticSource } from "../../render/hex_canvas.mjs";
import { region, outline, labels, marker, hollowMarks } from "../../render/overlays.mjs";
import { kronecker } from "../../core/kronecker.mjs";
import { floodFill } from "../../core/regions.mjs";
import { residueTest } from "../../core/admissible.mjs";
import { hexDisc, shapeS, seedS } from "../../core/shapes.mjs";
import { neighbourhood, cellKey, keyToCell, compareCells } from "../../core/geometry.mjs";
import { parseBigIntStrict, digitCount } from "../../core/bigint_utils.mjs";
import { runToEnd } from "../../construct/pipeline.mjs";
import { cellFactors } from "../../construct/inspect.mjs";

// The sections of the article, in order: anchor id, fragment file, title.
export const SECTIONS = Object.freeze([
  { id: "statement", file: "01_statement.html", title: "The statement" },
  { id: "necessity", file: "02_necessity.html", title: "Why the condition is necessary" },
  { id: "sufficiency", file: "03_sufficiency.html", title: "Sufficiency, step by step" },
  { id: "genus", file: "04_every_genus.html", title: "Every genus" },
  { id: "compact", file: "05_compact.html", title: "Compact shapes" },
  { id: "numbers", file: "06_numbers.html", title: "From the proof to numbers" },
]);

// The flood fill cap of the colouring figure.
export const REGION_CAP = 5000;

const mod = (a, p) => ((a % p) + p) % p;
const bigOf = (v) => (typeof v === "bigint" ? v : BigInt(v));

// signText(v) is "+1", "-1" or "0".
export function signText(v) {
  return v > 0 ? "+1" : v < 0 ? "-1" : "0";
}


// regionFacts(x, d, i, j, cap) returns the region of the cell (x + i, d + j): { colour, name, area, complete,
// genus (null when not complete), cells (offsets relative to (x, d), sorted by (j, i)) }, by the core's floodFill
// capped at cap cells.
export function regionFacts(x, d, i, j, cap = REGION_CAP) {
  const r = floodFill(bigOf(x) + BigInt(i), bigOf(d) + BigInt(j), cap);
  return {
    colour: r.colour, name: r.colourName, area: r.area, complete: r.complete, genus: r.genus,
    cells: r.cells.map(([a, b]) => [a + i, b + j]),
  };
}

// necessityFacts(cells, p, x, d) for a patch (cells, offsets), a prime p and integers x, d returns { p, size,
// total (p^2), hit (classes of (Z/p)^2 met by the patch), missed (the smallest missed class [a, b], or null), target
// (the class [-x mod p, -d mod p]), targetCell (the first cell of the patch in the target class, or null when the
// patch misses the target class), targetSymbol (its symbol K(x + i, d + j), 0 since p divides both, or null),
// forced (targetCell when no class is missed, else null), forcedSymbol (its symbol, 0 by the necessity argument),
// symbols ([[i, j, K]] for every cell), failing (the primes at which residueTest of the patch finds no missed
// class) }.
export function necessityFacts(cells, p, x, d) {
  const X = bigOf(x);
  const Dd = bigOf(d);
  const sorted = cells.map(([i, j]) => [i, j]).sort(compareCells);
  const classes = new Set(sorted.map(([i, j]) => mod(i, p) * p + mod(j, p)));
  let missed = null;
  for (let a = 0; a < p && !missed; a++) {
    for (let b = 0; b < p; b++) {
      if (!classes.has(a * p + b)) {
        missed = [a, b];
        break;
      }
    }
  }
  const P = BigInt(p);
  const target = [Number(((-X % P) + P) % P), Number(((-Dd % P) + P) % P)];
  const symbols = sorted.map(([i, j]) => [i, j, kronecker(X + BigInt(i), Dd + BigInt(j))]);
  const k = sorted.findIndex(([i, j]) => mod(i, p) === target[0] && mod(j, p) === target[1]);
  const targetCell = k >= 0 ? sorted[k] : null;
  const targetSymbol = k >= 0 ? symbols[k][2] : null;
  const forced = missed === null ? targetCell : null;
  const forcedSymbol = missed === null ? targetSymbol : null;
  const failing = residueTest(sorted).filter((r) => r.missed === null).map((r) => r.p);
  return { p, size: sorted.length, total: p * p, hit: classes.size, missed, target, targetCell, targetSymbol, forced, forcedSymbol, symbols, failing };
}

// necessityText(facts, x, d) is the caption of the necessity figure for necessityFacts(cells, p, x, d): { cap (the
// caption line), lines (the details, with $...$ formulas) }. With a missed class it says which placements escape p,
// and whether p makes a cell of the patch blue at the placement (x, d).
export function necessityText(facts, x, d) {
  const X = bigOf(x);
  const Dd = bigOf(d);
  const { p, target } = facts;
  const lines = [];
  let cap;
  if (!facts.size) {
    cap = "empty patch";
  } else if (facts.missed) {
    const [a, b] = facts.missed;
    cap = `${facts.hit} of ${facts.total} classes mod ${p}, missed $(${a},${b})$`;
    lines.push(`The patch misses the class $(${a},${b})$ modulo ${p}, so at the placements with $(-x,-d)\\equiv(${a},${b})\\pmod{${p}}$ the prime ${p} divides no cell in both coordinates.`);
    const where = `Here $(-x,-d)=(${-X},${-Dd})$ is $(${target[0]},${target[1]})$ modulo ${p}`;
    if (facts.targetCell) {
      const [ti, tj] = facts.targetCell;
      lines.push(`${where}, the class of the cell $(${ti},${tj})$: ${p} divides $x+i=${X + BigInt(ti)}$ and $d+j=${Dd + BigInt(tj)}$, so here ${p} makes the cell $(${ti},${tj})$ blue.`);
    } else {
      lines.push(`${where}, a class the patch misses, so at this placement ${p} divides no cell of the patch in both coordinates.`);
    }
  } else {
    const [fi, fj] = facts.forced;
    cap = `${facts.hit} of ${facts.total} classes mod ${p}: $K=${signText(facts.forcedSymbol)}$ at the marked cell`;
    lines.push(`The marked cell $(${fi},${fj})$ lies in the class of $(-x,-d)=(${-X},${-Dd})$, which is $(${target[0]},${target[1]})$ modulo ${p}. So ${p} divides $x+i=${X + BigInt(fi)}$ and $d+j=${Dd + BigInt(fj)}$, and $K(x+i,d+j)=${signText(facts.forcedSymbol)}$.`);
  }
  if (facts.size) {
    lines.push(facts.failing.length
      ? `Residue test over the primes with $p^{2}\\le${facts.size}$: every class is met modulo ${facts.failing.join(" and ")}, so the patch is not admissible.`
      : `Residue test over the primes with $p^{2}\\le${facts.size}$: a class is missed modulo each of them, so the patch is admissible.`);
  }
  return { cap, lines };
}

let example = null;

// factorExample() is the result of the site's construction of the green region S_2 (seed [1, 0]), computed once.
export function factorExample() {
  if (!example) {
    const { result } = runToEnd({ shape: shapeS(2), seed: seedS(2), colour: 1 });
    if (!result || !result.pass) throw new Error("the construction of S_2 (type +-1) did not pass");
    example = result;
  }
  return example;
}

// factorFacts(result, i, j) returns { kind: "outside" } for a cell outside the window S u N(S), { kind: "empty" }
// for a cell of a row without prescribed signs, else { kind: "row", i, j, small, q1, q2, cof, product, symbol,
// row: { q1, q2, r1, r2, R, u, c } } with the factors of cellFactors.
export function factorFacts(result, i, j) {
  const inWindow = new Set(result.shape.concat(neighbourhood(result.shape)).map(([a, b]) => cellKey(a, b)));
  if (!inWindow.has(cellKey(i, j))) return { kind: "outside", i, j };
  const f = cellFactors(result, i, j);
  if (f === null) return { kind: "empty", i, j };
  const r = result.rows.find((w) => w.j === j);
  return { kind: "row", i, j, ...f, row: { q1: r.q1, q2: r.q2, r1: r.r1, r2: r.r2, R: r.rho, u: r.u, c: r.c } };
}

const fmtSign = (v) => `(${signText(v)})`;

function legend() {
  return h("span", { class: "proof-legend", "aria-label": "Region types" },
    h("span", { class: "lg lg-g" }), "+1", h("span", { class: "lg lg-r" }), "-1", h("span", { class: "lg lg-b" }), "0");
}

// ---------- figure: the colouring near (x, d) ----------

function mountColouring(el) {
  let x = 1080n;
  let d = 517n;
  let sel = [0, 0];
  let facts = null;
  const xIn = h("input", { type: "text", value: "1080", "aria-label": "x", id: "proof-col-x", class: "proof-int" });
  const dIn = h("input", { type: "text", value: "517", "aria-label": "d", id: "proof-col-d", class: "proof-int" });
  const go = h("button", { type: "button", id: "proof-col-go", title: "Key Enter" }, "Show");
  const figBox = h("div", { class: "proof-figbox" });
  const caption = figureCaption("proof-col-facts");
  const info = caption.box;
  el.append(h("div", { class: "proof-controls" }, h("label", { class: "proof-label" }, "x ", xIn), h("label", { class: "proof-label" }, "d ", dIn), go, legend()), figBox, info);
  const fig = hexFigure(figBox, { maxCell: 26, maxHeight: 340, pad: 0.5, label: "the colouring near (x, d)" });
  let source = kroneckerSource(x, d);

  function show(note = "") {
    facts = regionFacts(x, d, sel[0], sel[1]);
    const ovs = [marker(sel)];
    if (facts.complete) ovs.unshift(region(facts.cells));
    fig.draw({ source, bounds: { imin: -8, imax: 8, jmin: -5, jmax: 5 }, overlays: ovs, soft: true });
    const cx = x + BigInt(sel[0]);
    const cd = d + BigInt(sel[1]);
    const cap = facts.complete
      ? `region type ${signText(facts.colour)} | ${facts.area} cells | genus ${facts.genus}`
      : `region type ${signText(facts.colour)} | more than ${REGION_CAP - 1} cells (not followed further here)`;
    caption.set(note || cap, [`The marked cell is $(x,d)=(${shortNumber(cx)},\\ ${shortNumber(cd)})$ with $K(x,d)=${signText(facts.colour)}$. Its region is followed up to ${REGION_CAP} cells, the Explorer goes further.`]);
    info.dataset.area = String(facts.area);
    info.dataset.complete = String(facts.complete);
    info.dataset.genus = facts.genus === null ? "" : String(facts.genus);
  }
  fig.onClick((c) => {
    sel = c;
    show();
  });
  const apply = () => {
    const nx = parseBigIntStrict(xIn.value.trim());
    const nd = parseBigIntStrict(dIn.value.trim());
    if (nx === null || nd === null || digitCount(nx) > 200 || digitCount(nd) > 200) {
      show("x and d must be integers of at most 200 digits");
      return;
    }
    x = nx;
    d = nd;
    sel = [0, 0];
    source = kroneckerSource(x, d);
    show();
  };
  go.addEventListener("click", apply);
  // Enter in either field does what Show does
  for (const input of [xIn, dIn]) {
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      e.preventDefault();
      apply();
    });
  }
  show();
  return { figure: fig, state: () => ({ x: x.toString(), d: d.toString(), sel, facts }), destroy: () => fig.destroy() };
}

// ---------- figure: necessity ----------

const PATCH_RADIUS = 3;
const BLOCK = [[0, 0], [1, 0], [0, 1], [1, 1]];

function mountNecessity(el) {
  let patch = new Set(BLOCK.map(([i, j]) => cellKey(i, j)));
  let p = 2;
  let x = 3n;
  let d = 5n;
  let facts = null;
  const disc = new Set(hexDisc(PATCH_RADIUS).map(([i, j]) => cellKey(i, j)));
  const pSel = h("select", { "aria-label": "Prime p", id: "proof-nec-p" }, ...[2, 3, 5, 7].map((q) => h("option", { value: String(q) }, String(q))));
  const xIn = h("input", { type: "text", value: "3", "aria-label": "x", id: "proof-nec-x", class: "proof-int" });
  const dIn = h("input", { type: "text", value: "5", "aria-label": "d", id: "proof-nec-d", class: "proof-int" });
  const block = h("button", { type: "button", id: "proof-nec-block", title: "Start again" }, "2 x 2 block");
  const clear = h("button", { type: "button", id: "proof-nec-clear", title: "Empty the patch" }, "Clear");
  const figBox = h("div", { class: "proof-figbox" });
  const caption = figureCaption("proof-nec-facts");
  const info = caption.box;
  el.append(h("div", { class: "proof-controls" },
    h("label", { class: "proof-label" }, "p ", pSel),
    h("label", { class: "proof-label" }, "x ", xIn),
    h("label", { class: "proof-label" }, "d ", dIn), block, clear), figBox, info);
  const fig = hexFigure(figBox, { maxCell: 40, maxHeight: 290, pad: 0.5, label: "an editable patch with its classes modulo p" });

  function show() {
    const cells = [...patch].map(keyToCell).sort(compareCells);
    facts = necessityFacts(cells, p, x, d);
    const sym = new Map(facts.symbols.map(([i, j, k]) => [cellKey(i, j), k]));
    const source = staticSource((i, j) => {
      const k = cellKey(i, j);
      return sym.has(k) ? sym.get(k) : null;
    });
    const ovs = [];
    if (cells.length) {
      ovs.push(outline(cells));
      ovs.push(labels(cells.map(([i, j]) => [i, j, `${mod(i, p)},${mod(j, p)}`])));
    }
    // the forced cell: the hollow mark, which leaves its label readable
    if (facts.forced) ovs.push(hollowMarks([facts.forced]));
    fig.draw({ source, bounds: hexDisc(PATCH_RADIUS), overlays: ovs });
    const { cap, lines } = necessityText(facts, x, d);
    caption.set(cap, lines);
    info.dataset.hit = String(facts.hit);
    info.dataset.total = String(facts.total);
    info.dataset.forcedSymbol = facts.forcedSymbol === null ? "" : String(facts.forcedSymbol);
  }
  fig.onClick(([i, j]) => {
    const k = cellKey(i, j);
    if (!disc.has(k)) return;
    if (patch.has(k)) patch.delete(k);
    else patch.add(k);
    show();
  });
  pSel.addEventListener("change", () => {
    p = Number(pSel.value);
    show();
  });
  const readXD = () => {
    const nx = parseBigIntStrict(xIn.value.trim());
    const nd = parseBigIntStrict(dIn.value.trim());
    if (nx !== null && digitCount(nx) <= 30) x = nx;
    if (nd !== null && digitCount(nd) <= 30) d = nd;
    xIn.value = String(x);
    dIn.value = String(d);
    show();
  };
  xIn.addEventListener("change", readXD);
  dIn.addEventListener("change", readXD);
  block.addEventListener("click", () => {
    patch = new Set(BLOCK.map(([i, j]) => cellKey(i, j)));
    show();
  });
  clear.addEventListener("click", () => {
    patch = new Set();
    show();
  });
  show();
  return {
    figure: fig,
    state: () => ({ p, x: x.toString(), d: d.toString(), patch: [...patch].map(keyToCell).sort(compareCells), facts }),
    set({ p: p2, x: x2, d: d2, cells } = {}) {
      if (p2 !== undefined) p = p2;
      if (x2 !== undefined) x = bigOf(x2);
      if (d2 !== undefined) d = bigOf(d2);
      if (cells) patch = new Set(cells.map(([i, j]) => cellKey(i, j)));
      pSel.value = String(p);
      xIn.value = String(x);
      dIn.value = String(d);
      show();
    },
    destroy: () => fig.destroy(),
  };
}

// ---------- figure B: the factors of a cell ----------

function mountFactors(el) {
  const result = factorExample();
  const win = result.shape.concat(neighbourhood(result.shape));
  let sel = [1, 0];
  let facts = null;
  const figBox = h("div", { class: "proof-figbox" });
  const caption = figureCaption("proof-fac-facts");
  const info = caption.box;
  el.append(figBox, info);
  const fig = hexFigure(figBox, { maxCell: 30, maxHeight: 400, pad: 1, label: "the window of the constructed region S_2 (type +-1)" });
  const source = kroneckerSource(result.x0, result.d0);
  const numbers = `Here $d$ has ${result.digits.d0} digits and $x$ has ${result.digits.x0} digits, with the program's $B=${result.B}$.`;

  function show() {
    facts = factorFacts(result, sel[0], sel[1]);
    fig.draw({ source, bounds: win, overlays: [region(result.shape), marker(sel)], soft: true });
    const [i, j] = sel;
    let cap;
    const lines = [];
    if (facts.kind === "outside") {
      cap = `$(${i},${j})$: outside the window, nothing prescribed`;
    } else if (facts.kind === "empty") {
      cap = `row ${j}: no prescribed signs, its window cells are blue by small primes`;
    } else {
      const r = facts.row;
      cap = `$(${i},${j})$: $${fmtSign(facts.small)}${fmtSign(facts.q1)}${fmtSign(facts.q2)}${fmtSign(facts.cof)}=${signText(facts.product)}=K(x+i,d+j)$`;
      lines.push(`The four factors are $K(X_s+i,u_j)\\cdot\\left(\\frac{r_1+i}{q_{1}}\\right)\\left(\\frac{r_2+i}{q_{2}}\\right)\\cdot J(R+i,c_j)$, with $X_s$ the residue of $x$ fixed by the small primes.`);
      lines.push(`Row $j=${j}$: $d+j=u_j\\cdot q_{1}\\cdot q_{2}\\cdot c_j$ with $u_j=${r.u}$, $q_{1}=${r.q1}$, $q_{2}=${r.q2}$, $c_j=${shortNumber(r.c)}$, and $r_1=${r.r1}$, $r_2=${r.r2}$, $R=${r.R}$.`);
    }
    lines.push(numbers);
    caption.set(cap, lines);
    info.dataset.kind = facts.kind;
    info.dataset.i = String(i);
    info.dataset.j = String(j);
    info.dataset.product = facts.kind === "row" ? String(facts.product) : "";
    info.dataset.symbol = facts.kind === "row" ? String(facts.symbol) : "";
  }
  fig.onClick((c) => {
    sel = c;
    show();
  });
  show();
  return {
    figure: fig,
    result,
    state: () => ({ sel, facts }),
    select(c) {
      sel = c;
      show();
    },
    destroy: () => fig.destroy(),
  };
}

// ---------- the page ----------

let current = null;

// The smallest scale fitDisplayFormulas applies. A formula that would need less keeps its size and scrolls inside
// itself (a phone).
export const FIT_MIN_SCALE = 0.85;

// fitDisplayFormulas(root) lets every display formula of the article that is a little wider than the whole column
// fit it: its size is reduced to at most FIT_MIN_SCALE of the normal size. Called after the KaTeX fonts have loaded
// and when the window width changes. Returns the number of formulas that were reduced.
export function fitDisplayFormulas(root) {
  let n = 0;
  for (const el of root.querySelectorAll(".proof-body .katex-display")) {
    el.style.fontSize = "";
    const sw = el.scrollWidth;
    const cw = el.clientWidth;
    if (!(cw > 0) || sw <= cw) continue;
    const scale = Math.floor((1000 * cw) / sw) / 1000;
    if (scale < FIT_MIN_SCALE) continue;
    el.style.fontSize = `${(100 * scale).toFixed(1)}%`;
    if (el.scrollWidth > el.clientWidth) el.style.fontSize = `${(100 * scale - 1).toFixed(1)}%`;
    n++;
  }
  return n;
}

// testHandles() returns live handles of the mounted page for automated browser checks: { ready (true once every
// section and figure is in place), error, figures: { colouring, necessity, factors, weil, genus, sieve }, formulas
// (typeset by renderMathIn in the article), failed (formulas KaTeX could not typeset), fitted (display formulas
// reduced by fitDisplayFormulas at the last fit), links (mentions of a statement turned into links to it),
// scrollTo(place) }, or null when the page is not mounted.
export function testHandles() {
  return current;
}

// A place of the article: a section (its id of SECTIONS) or a numbered statement ("theorem-1", "lemma-10", "fact-2"),
// the element with the id proof-<place>. Its address is #/proof?s=<place> (sectionHref).
function scrollToSection(id) {
  const el = document.getElementById(`proof-${id}`);
  if (el) el.scrollIntoView({ block: "start" });
}

// sectionHref(place) is the address of a place of the article: "#/proof?s=<place>".
export function sectionHref(place) {
  return `#/proof?s=${encodeURIComponent(place)}`;
}

// The numbered statements of the article: "Theorem 1", "Lemma 10", "Fact 2" (the mentions in the text link to them).
const STATEMENT = /\b(Theorem|Lemma|Fact) (\d+)\b/g;

// statementPlace(kind, n) is the place of a numbered statement: "lemma-10".
export function statementPlace(kind, n) {
  return `${kind.toLowerCase()}-${n}`;
}

// linkStatements(article) gives every numbered statement of the article its place (the id proof-<place> on the
// paragraph or item whose bold heading starts with it) and turns every other mention of a statement that has a place
// into a link to it. Returns the number of links.
function linkStatements(article) {
  for (const b of article.querySelectorAll(".proof-body b")) {
    const m = /^(Theorem|Lemma|Fact) (\d+)\b/.exec(b.textContent);
    const host = m ? b.closest("p, li") : null;
    if (host && !host.id) host.id = `proof-${statementPlace(m[1], m[2])}`;
  }
  const texts = [];
  const walker = document.createTreeWalker(article, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (STATEMENT.test(n.nodeValue) && !n.parentElement.closest("b, a, .katex, .proof-figure")) texts.push(n);
    STATEMENT.lastIndex = 0;
  }
  let links = 0;
  for (const node of texts) {
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const m of node.nodeValue.matchAll(STATEMENT)) {
      const place = statementPlace(m[1], m[2]);
      if (!document.getElementById(`proof-${place}`)) continue;
      frag.append(node.nodeValue.slice(at, m.index), h("a", { href: sectionHref(place), class: "proof-ref" }, m[0]));
      at = m.index + m[0].length;
      links++;
    }
    if (at === 0) continue;
    frag.append(node.nodeValue.slice(at));
    node.replaceWith(frag);
  }
  return links;
}

// mount(root, ctx) shows the page in root and returns unmount(). ctx.query.s: the place of the article to show
// first.
export function mount(root, ctx = {}) {
  useStyles(new URL("../../../styles/proof.css", import.meta.url));
  const state = { ready: false, error: null, figures: {}, formulas: 0, failed: 0, fitted: 0, links: 0, scrollTo: scrollToSection };
  current = state;
  let gone = false;
  // a link to a place of the article scrolls there and writes its address without drawing the page again
  const onPlaceLink = (ev) => {
    const a = ev.target.closest('a[href^="#/proof?s="]');
    if (!a || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    const place = decodeURIComponent(a.getAttribute("href").slice("#/proof?s=".length));
    scrollToSection(place);
    if (ctx.navigate) ctx.navigate("#/proof", { s: place }, { silent: true });
  };
  const toc = h("nav", { class: "proof-toc", "aria-label": "Contents" },
    h("ol", null, ...SECTIONS.map((s) => h("li", null, h("a", { href: sectionHref(s.id), "data-section": s.id }, s.title)))));
  const article = h("article", { class: "proof-article" });
  const status = h("p", { class: "proof-loading" }, "Loading ...");
  const wrap = h("div", { class: "proof-page" },
    h("h1", { class: "page-title" }, "Proof"),
    h("p", { class: "page-lead" }, "A shape is packed into infinitely many (x, d) if and only if its cells of region type +1 or -1 miss a residue class modulo every prime. Hence every genus exists for each region type -1, 0, +1."),
    toc, status, article);
  wrap.addEventListener("click", onPlaceLink);
  root.append(wrap);

  // wide display formulas are fitted again when the fonts arrive and when the window width changes
  let fitFrame = 0;
  let fitWidth = -1;
  const refit = () => {
    if (gone) return;
    state.fitted = fitDisplayFormulas(article);
    fitWidth = document.documentElement.clientWidth;
  };
  const onResize = () => {
    if (fitFrame || document.documentElement.clientWidth === fitWidth) return;
    fitFrame = requestAnimationFrame(() => {
      fitFrame = 0;
      refit();
    });
  };
  window.addEventListener("resize", onResize);
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", refit);

  Promise.all(SECTIONS.map((s) => loadText(new URL(`../../../content/proof/${s.file}`, import.meta.url))))
    .then((texts) => {
      if (gone) return;
      SECTIONS.forEach((s, k) => {
        article.appendChild(h("section", { class: "proof-section", id: `proof-${s.id}` },
          h("h2", null, `${k + 1}. ${s.title}`), h("div", { class: "proof-body", html: texts[k] })));
      });
      const m = renderMathIn(article);
      state.formulas = m.formulas;
      state.failed = m.failed;
      state.links = linkStatements(article);
      refit();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
      const makers = {
        colouring: mountColouring,
        necessity: mountNecessity,
        factors: mountFactors,
        weil: (el) => mountWeilPlot(el, { q: 577, k: 3 }),
        genus: (el) => mountGenusSlider(el, { kind: "S", g: 3 }),
        sieve: (el) => mountSievePlayground(el, { P: 43, seed: 1, t: 12 }),
      };
      for (const ph of article.querySelectorAll(".proof-figure[data-figure]")) {
        const name = ph.dataset.figure;
        if (makers[name]) state.figures[name] = makers[name](ph);
      }
      status.remove();
      state.ready = true;
      root.dataset.ready = "true";
      // an address with a place (#/proof?s=lemma-10) opens the page there
      const place = (ctx.query || {}).s;
      if (typeof place === "string" && place) scrollToSection(place);
    })
    .catch((e) => {
      if (gone) return;
      state.error = (e && e.message) || String(e);
      status.className = "page-error";
      status.textContent = `The article could not be loaded: ${state.error}`;
    });

  return () => {
    gone = true;
    wrap.removeEventListener("click", onPlaceLink);
    window.removeEventListener("resize", onResize);
    if (document.fonts && document.fonts.removeEventListener) document.fonts.removeEventListener("loadingdone", refit);
    if (fitFrame) cancelAnimationFrame(fitFrame);
    for (const f of Object.values(state.figures)) {
      try {
        f.destroy();
      } catch {
        // a figure that failed to mount has nothing to remove
      }
    }
    state.figures = {};
    if (current === state) current = null;
    delete root.dataset.ready;
    root.replaceChildren();
  };
}
