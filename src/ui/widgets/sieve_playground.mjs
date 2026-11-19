// The sieve playground of the Proof page. For a bound P (a prime up to 43) and a seed, a class a_p of (Z/p)^2 is
// drawn for every prime p <= P by a small seeded generator. The sieved set V is the set of cells (i, j) with
// (i, j) != a_p mod p for every p <= P. The playground shows the cells of V inside the hexagonal disc of radius t
// (at most (P - 1) / 2, so that the disc spans at most P columns), outlines the largest connected piece of them, and
// computes its area, its genus and its residue test. A subset of V spanning at most P columns is admissible, so
// the test passes for every seed.
//
// mulberry32, sieveClasses, sievedDisc, largestPiece, playground and sieveDensity are the pure functions behind
// every number it prints (tested in Node).

import { h } from "../dom.mjs";
import { staticSource } from "../../render/hex_canvas.mjs";
import { region } from "../../render/overlays.mjs";
import { primesUpTo } from "../../core/primes.mjs";
import { hexDisc } from "../../core/shapes.mjs";
import { NEIGHBOURS, cellKey, compareCells } from "../../core/geometry.mjs";
import { genusOfCells, holeCount } from "../../core/regions.mjs";
import { residueTest } from "../../core/admissible.mjs";
import { hexFigure, figureCaption } from "./genus_slider.mjs";

// The largest P offered, the largest radius drawn.
export const MAX_P = 43;
export const MAX_RADIUS = 21;
// The choices of P (primes from 5 to 43).
export const P_CHOICES = Object.freeze(primesUpTo(MAX_P).filter((p) => p >= 5));

// mulberry32(seed) returns a generator of numbers in [0, 1) determined by the 32-bit integer seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// sieveClasses(P, seed) returns [{ p, a: [a, b] }] for the primes p <= P in ascending order: a = floor(u p),
// b = floor(u' p) for the next two numbers u, u' of mulberry32(seed).
export function sieveClasses(P, seed) {
  if (!Number.isInteger(P) || P < 2) throw new Error(`P must be an integer >= 2, got ${P}`);
  if (!Number.isInteger(seed)) throw new Error(`the seed must be an integer, got ${seed}`);
  const rnd = mulberry32(seed);
  return primesUpTo(P).map((p) => ({ p, a: [Math.floor(rnd() * p), Math.floor(rnd() * p)] }));
}

const mod = (x, p) => ((x % p) + p) % p;

// The radius limit for P: the largest t <= MAX_RADIUS with 2t + 1 <= P (the disc spans 2t + 1 columns).
export function maxRadius(P) {
  return Math.max(0, Math.min(MAX_RADIUS, Math.floor((P - 1) / 2)));
}

// sievedDisc(classes, t) returns the cells of the hexagonal disc of radius t that avoid every class, sorted by
// (j, i).
export function sievedDisc(classes, t) {
  return hexDisc(t).filter(([i, j]) => classes.every(({ p, a }) => mod(i, p) !== a[0] || mod(j, p) !== a[1]));
}

// largestPiece(cells) returns the largest connected component of the cell list (sorted by (j, i)), the one whose
// first cell in (j, i) order comes first among equally large ones, and the number of components. [] for no cells.
export function largestPiece(cells) {
  const set = new Set(cells.map(([i, j]) => cellKey(i, j)));
  const seen = new Set();
  let best = [];
  let count = 0;
  for (const c of [...cells].sort(compareCells)) {
    const k0 = cellKey(c[0], c[1]);
    if (seen.has(k0)) continue;
    count++;
    seen.add(k0);
    const comp = [c];
    for (let h0 = 0; h0 < comp.length; h0++) {
      const [i, j] = comp[h0];
      for (const [di, dj] of NEIGHBOURS) {
        const k = cellKey(i + di, j + dj);
        if (set.has(k) && !seen.has(k)) {
          seen.add(k);
          comp.push([i + di, j + dj]);
        }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  return { piece: best.sort(compareCells), components: count };
}

// sieveDensity(P) = the product of 1 - 1/p^2 over the primes p <= P.
export function sieveDensity(P) {
  return primesUpTo(P).reduce((a, p) => a * (1 - 1 / (p * p)), 1);
}

// playground(P, seed, t) returns { P, seed, t, classes, disc (cells of the disc), sieved, piece, components, area,
// genus, chi, holes, columns (number of columns of the piece), records (residueTest of the piece), admissible }.
// Throws when t exceeds maxRadius(P).
export function playground(P, seed, t) {
  if (!Number.isInteger(t) || t < 0 || t > maxRadius(P)) throw new Error(`t must be an integer 0 .. ${maxRadius(P)} for P = ${P}, got ${t}`);
  const classes = sieveClasses(P, seed);
  const disc = hexDisc(t);
  const sieved = sievedDisc(classes, t);
  const { piece, components } = largestPiece(sieved);
  const gen = piece.length ? genusOfCells(piece) : { genus: 0, chi: 0 };
  const columns = piece.length ? new Set(piece.map(([i]) => i)).size : 0;
  const records = residueTest(piece);
  return {
    P, seed, t, classes, disc: disc.length, sieved, piece, components, area: piece.length,
    genus: gen.genus, chi: gen.chi, holes: piece.length ? holeCount(piece) : 0, columns, records,
    admissible: records.every((r) => r.missed !== null),
  };
}

// The text lines (with $...$ formulas) shown for a playground record.
export function playgroundLines(f) {
  const cls = f.classes.map(({ p, a }) => `$a_{${p}}=(${a[0]},${a[1]})$`).join(", ");
  const lines = [];
  lines.push(`Classes drawn from seed ${f.seed}: ${cls}.`);
  lines.push(`The disc of radius $t=${f.t}$ has ${f.disc} cells, ${f.sieved.length} of them lie in the sieved set, in ${f.components} connected pieces.`);
  lines.push(`The largest piece has ${f.area} cells in ${f.columns} columns ($\\le P=${f.P}$) and genus $1-\\chi=${f.genus}$ (${f.holes} bounded components of its complement).`);
  const parts = f.records.map((r) => (r.missed ? `$p=${r.p}$ misses $(${r.missed[0]},${r.missed[1]})$` : `$p=${r.p}$ hits all ${r.p * r.p} classes`));
  lines.push(`Residue test of the piece, for the primes with $p^{2}\\le${f.area}$: ${parts.length ? parts.join(", ") : "no prime to test"}. ${f.admissible ? "Admissible." : "Not admissible."}`);
  return lines;
}

// The one caption line of the playground.
export function playgroundCaption(f) {
  return `Largest piece | ${f.area} cells | genus ${f.genus} | ${f.admissible ? "admissible" : "not admissible"}`;
}

// mountSievePlayground(el, { P, seed, t }) shows the playground in el and returns { set({ P, seed, t }), state(),
// whenDrawn(), figure, destroy() }.
export function mountSievePlayground(el, { P = 43, seed = 1, t = 12 } = {}) {
  let cur = { P, seed, t: Math.min(t, maxRadius(P)) };
  let facts = null;
  let drawn = Promise.resolve(null);
  const pSel = h("select", { "aria-label": "Bound P", id: "proof-sieve-p" }, ...P_CHOICES.map((p) => h("option", { value: String(p) }, String(p))));
  const seedIn = h("input", { type: "number", min: "0", max: "4294967295", step: "1", "aria-label": "Seed", id: "proof-sieve-seed", class: "proof-num" });
  const another = h("button", { type: "button", id: "proof-sieve-next", title: "Another random shape" }, "Next seed");
  const tIn = h("input", { type: "range", min: "1", step: "1", "aria-label": "Radius t", id: "proof-sieve-t", class: "proof-range" });
  const tOut = h("output", { class: "proof-gvalue", id: "proof-sieve-t-value" });
  const figBox = h("div", { class: "proof-figbox" });
  const caption = figureCaption("proof-sieve-facts");
  const info = caption.box;
  el.classList.add("proof-wide");
  el.append(
    h("div", { class: "proof-controls" },
      h("label", { class: "proof-label" }, "P ", pSel),
      h("label", { class: "proof-label" }, "seed ", seedIn), another,
      h("label", { class: "proof-label" }, "t ", tOut, tIn)),
    figBox, info);
  const fig = hexFigure(figBox, { maxCell: 22, maxHeight: 520, pad: 1, label: "the sieved set in a disc, largest piece outlined" });

  function show() {
    const mr = maxRadius(cur.P);
    cur = { ...cur, t: Math.max(1, Math.min(cur.t, mr)) };
    facts = playground(cur.P, cur.seed, cur.t);
    const inV = new Set(facts.sieved.map(([i, j]) => cellKey(i, j)));
    const R = cur.t;
    const source = staticSource((i, j) => {
      if (Math.max(Math.abs(i), Math.abs(j), Math.abs(i - j)) > R) return null;
      return inV.has(cellKey(i, j)) ? 1 : 0;
    });
    drawn = fig.draw({ source, bounds: hexDisc(R), overlays: facts.piece.length ? [region(facts.piece)] : [], soft: true });
    pSel.value = String(cur.P);
    seedIn.value = String(cur.seed);
    tIn.max = String(mr);
    tIn.value = String(cur.t);
    tOut.textContent = String(cur.t);
    caption.set(playgroundCaption(facts), playgroundLines(facts));
    info.dataset.area = String(facts.area);
    info.dataset.genus = String(facts.genus);
    info.dataset.admissible = String(facts.admissible);
    info.dataset.seed = String(cur.seed);
  }

  pSel.addEventListener("change", () => {
    cur = { ...cur, P: Number(pSel.value) };
    show();
  });
  seedIn.addEventListener("change", () => {
    const s = Math.trunc(Number(seedIn.value));
    if (Number.isFinite(s) && s >= 0 && s <= 4294967295) cur = { ...cur, seed: s };
    show();
  });
  another.addEventListener("click", () => {
    cur = { ...cur, seed: (cur.seed + 1) % 4294967296 };
    show();
  });
  tIn.addEventListener("input", () => {
    cur = { ...cur, t: Number(tIn.value) };
    show();
  });
  show();

  return {
    set(next) {
      cur = { ...cur, ...next };
      show();
    },
    state: () => ({ ...cur, facts }),
    whenDrawn: () => drawn,
    figure: fig,
    destroy() {
      fig.destroy();
      el.replaceChildren();
    },
  };
}
