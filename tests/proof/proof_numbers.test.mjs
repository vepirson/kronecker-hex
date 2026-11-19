// Guard tests of every number the Proof page can print: the shapes S_g and Z_g, the sign-pattern counts and the
// band of the character-sum lemma, the thresholds quoted in the text, the factor example, the sieve playground,
// the necessity figure, the colouring figure and the compact shape of the last section.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { shapeFacts, zHeight, factsLines, factsCaption, G_MIN, G_MAX } from "../../src/ui/widgets/genus_slider.mjs";
import { patternCounts, weilBand, WEIL_THRESHOLDS, proofThreshold, primeAtLeast, primeBelow, patternLabel, plotLines, plotCaption } from "../../src/ui/widgets/weil_plot.mjs";
import { mulberry32, sieveClasses, sievedDisc, largestPiece, playground, sieveDensity, maxRadius, P_CHOICES, playgroundLines } from "../../src/ui/widgets/sieve_playground.mjs";
import { necessityFacts, necessityText, regionFacts, factorExample, factorFacts, REGION_CAP } from "../../src/ui/pages/proof.mjs";
import { texToHtml, splitMath } from "../../src/ui/widgets/math.mjs";
import { primesUpTo } from "../../src/core/primes.mjs";
import { kronecker } from "../../src/core/kronecker.mjs";
import { neighbourhood } from "../../src/core/geometry.mjs";
import { genusOfCells, holeCount, isConnected } from "../../src/core/regions.mjs";
import { isAdmissible } from "../../src/core/admissible.mjs";

const typesets = (line) => splitMath(line).filter((s) => s.type === "math").every((s) => texToHtml(s.tex, s.display).ok);

test("S_g and Z_g for g = 1 .. 20: area, genus by both counts, connected, admissible", () => {
  assert.equal(G_MIN, 1);
  assert.equal(G_MAX, 20);
  for (let g = 1; g <= 20; g++) {
    const s = shapeFacts("S", g);
    assert.equal(s.area, 10 * g - 4);
    assert.equal(s.areaFormula, 10 * g - 4);
    assert.equal(s.genus, g);
    assert.equal(s.holes, g);
    assert.ok(s.connected);
    assert.ok(s.admissible, `S_${g} admissible`);
    assert.equal(s.testedOn, "shape");
    const z = shapeFacts("Z", g);
    const D = zHeight(g);
    assert.equal(D % 2, 0);
    assert.ok(D >= 3 * g && D <= 3 * g + 1);
    assert.equal(z.area, 2 * D + g + 3);
    assert.equal(z.areaFormula, z.area);
    assert.equal(z.genus, g);
    assert.equal(z.holes, g);
    assert.ok(z.connected);
    assert.ok(z.admissible, `N(Z_${g}) admissible`);
    assert.equal(z.testedOn, "neighbours");
    assert.equal(z.tested, neighbourhood(z.cells).length);
    // the neighbour set of Z_g as stated in the text
    const want = [];
    for (let j = -1; j <= D; j++) want.push([-1, j]);
    for (let j = 0; j <= D + 1; j++) want.push([3, j]);
    for (let j = -1; j <= D + 1; j++) if (!(j >= 0 && j % 3 === 0 && j / 3 <= g)) want.push([1, j]);
    want.push([0, -1], [0, D + 1], [2, -1], [2, D + 1]);
    const key = (c) => `${c[0]},${c[1]}`;
    assert.deepEqual(new Set(neighbourhood(z.cells).map(key)), new Set(want.map(key)));
    // the classes named in the proofs
    const missesS = (p, a, b) => s.cells.every(([i, j]) => ((i % p) + p) % p !== a || ((j % p) + p) % p !== b);
    assert.ok(missesS(2, 0, 0) && missesS(3, 0, 0) && missesS(5, 2, 0) && missesS(7, 2, 3));
    const nz = neighbourhood(z.cells);
    const missesN = (p, a, b) => nz.every(([i, j]) => ((i % p) + p) % p !== a || ((j % p) + p) % p !== b);
    assert.ok(missesN(2, 0, 0) && missesN(3, 1, 0) && missesN(7, 4, 0));
    for (const f of [s, z]) {
      assert.ok(typesets(factsCaption(f)));
      for (const l of factsLines(f)) assert.ok(typesets(l), l);
    }
  }
  // genus 0: single cells, the ring of Z_0 admissible
  assert.equal(shapeFacts("S", 0).genus, 0);
  assert.ok(shapeFacts("Z", 0).admissible);
});

test("sign-pattern counts sum to q - k and lie in the band of the lemma", () => {
  const cases = [[5, 1], [7, 3], [11, 2], [19, 3], [101, 4], [577, 3], [4099, 4], [25601, 5], [1009, 6], [147457, 6]];
  for (const [q, k] of cases) {
    const pc = patternCounts(q, k);
    const band = weilBand(q, k);
    assert.equal(pc.counts.length, 2 ** k);
    assert.equal(pc.usable, q - k);
    assert.equal(pc.counts.reduce((a, b) => a + b, 0), q - k, `sum for q=${q} k=${k}`);
    for (const c of pc.counts) {
      assert.ok(c >= band.lower - 1e-9, `q=${q} k=${k}: ${c} >= ${band.lower}`);
      assert.ok(c <= band.upper + 1e-9, `q=${q} k=${k}: ${c} <= ${band.upper}`);
    }
    if (band.guaranteed) {
      assert.ok(band.lower >= (k / 2) * (Math.sqrt(q) - 1) - 1e-9 && band.lower > 0);
      assert.equal(pc.missing, 0);
    }
    assert.equal(plotCaption(pc).includes(pc.missing === 0 ? "all" : "missing"), true);
    for (const l of plotLines(pc, band)) assert.ok(typesets(l), l);
  }
  assert.ok(patternCounts(7, 3).missing > 0);
  assert.equal(patternCounts(7, 3).missing, 4);
  // the counts against a direct Legendre computation for one case
  const q = 101, k = 4;
  const direct = new Array(16).fill(0);
  for (let r = 0; r < q; r++) {
    let v = 0, ok = true;
    for (let t = 0; t < k; t++) {
      const s = kronecker(BigInt(r + t), BigInt(q));
      if (s === 0) ok = false;
      if (s === -1) v |= 1 << t;
    }
    if (ok) direct[v]++;
  }
  assert.deepEqual(patternCounts(q, k).counts, direct);
  assert.equal(patternLabel(0b101, 3), "-+-");
  assert.equal(proofThreshold(3), 576);
  assert.equal(primeAtLeast(576, 3), 577);
  assert.equal(primeBelow(19, 3), 17);
});

test("the thresholds 7, 19, 59, 197 quoted in the text, and the prime just below misses a pattern", () => {
  for (const k of [2, 3, 4, 5]) {
    const T = WEIL_THRESHOLDS[k];
    const top = proofThreshold(k);
    for (const q of primesUpTo(top)) {
      if (q < T || q <= k || q === 2) continue;
      assert.equal(patternCounts(q, k).missing, 0, `k=${k} q=${q}`);
    }
    const below = primeBelow(T, k);
    assert.ok(below !== null && patternCounts(below, k).missing > 0, `k=${k}: ${below} misses a pattern`);
  }
});

test("the factor example S_2: pass, product of the factors = symbol on every window cell", () => {
  const r = factorExample();
  assert.equal(r.pass, true);
  assert.equal(r.B, 11);
  assert.equal(r.digits.d0, r.d0.toString().length);
  assert.equal(r.digits.x0, r.x0.toString().length);
  const win = r.shape.concat(neighbourhood(r.shape));
  let rows = 0, empty = 0;
  for (const [i, j] of win) {
    const f = factorFacts(r, i, j);
    if (f.kind === "row") {
      rows++;
      assert.equal(f.product, f.symbol, `cell ${i},${j}`);
      assert.equal(f.symbol, kronecker(r.x0 + BigInt(i), r.d0 + BigInt(j)));
    } else {
      assert.equal(f.kind, "empty");
      assert.ok(r.emptyRows.includes(j));
      assert.equal(kronecker(r.x0 + BigInt(i), r.d0 + BigInt(j)), 0);
      empty++;
    }
  }
  assert.equal(rows + empty, win.length);
  assert.equal(factorFacts(r, 9, 0).kind, "outside");
  // the region of the seed is the shape
  assert.equal(regionFacts(r.x0, r.d0, 1, 0).area, r.shape.length);
});

test("the sieve playground: generator reproducible from its seed, piece admissible for 20 seeds", () => {
  const a = mulberry32(7), b = mulberry32(7);
  for (let n = 0; n < 50; n++) assert.equal(a(), b());
  assert.deepEqual(sieveClasses(43, 5), sieveClasses(43, 5));
  assert.notDeepEqual(sieveClasses(43, 5), sieveClasses(43, 6));
  assert.deepEqual(sieveClasses(43, 1).map((c) => c.p), primesUpTo(43));
  for (let seed = 1; seed <= 20; seed++) {
    const f = playground(43, seed, 12);
    assert.ok(f.admissible, `seed ${seed}`);
    assert.ok(isAdmissible(f.piece));
    assert.ok(f.columns <= 43);
    assert.ok(isConnected(f.piece));
    assert.equal(f.genus, genusOfCells(f.piece).genus);
    assert.equal(f.genus, f.holes);
    assert.equal(f.genus, holeCount(f.piece));
    // the piece lies in the sieved set
    for (const [i, j] of f.piece) for (const { p, a: c } of f.classes) assert.ok(((i % p) + p) % p !== c[0] || ((j % p) + p) % p !== c[1]);
    for (const l of playgroundLines(f)) assert.ok(typesets(l), l);
  }
  for (const P of P_CHOICES) {
    const t = maxRadius(P);
    assert.ok(2 * t + 1 <= P);
    for (const seed of [1, 2, 3]) assert.ok(playground(P, seed, t).admissible, `P=${P} t=${t} seed=${seed}`);
  }
  assert.deepEqual(playground(43, 3, 12), playground(43, 3, 12));
  assert.equal(largestPiece([]).piece.length, 0);
  assert.equal(sievedDisc([], 2).length, 19);
  // the density quoted in the text decreases toward 6 / pi^2 = 0.6079...
  assert.ok(sieveDensity(43) > 6 / Math.PI ** 2 && sieveDensity(43) < sieveDensity(41));
  assert.equal((6 / Math.PI ** 2).toFixed(4), "0.6079");
});

test("the necessity figure: the 2 x 2 block meets all 4 classes mod 2 and the marked cell is blue", () => {
  const block = [[0, 0], [1, 0], [0, 1], [1, 1]];
  for (let x = -6; x <= 6; x++) {
    for (let d = -6; d <= 6; d++) {
      const f = necessityFacts(block, 2, x, d);
      assert.equal(f.hit, 4);
      assert.equal(f.total, 4);
      assert.equal(f.missed, null);
      assert.equal(f.forcedSymbol, 0);
    }
  }
  const f3 = necessityFacts(block, 3, 3, 5);
  assert.equal(f3.hit, 4);
  assert.deepEqual(f3.missed, [0, 2]);
  assert.deepEqual(necessityFacts(block, 2, 3, 5).failing, [2]);
  for (const p of [3, 5, 7]) {
    const big = [];
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) big.push([i - 3, j - 3]);
    const g = necessityFacts(big, p, 1080, 517);
    assert.equal(g.hit, p * p);
    assert.equal(g.forcedSymbol, 0);
  }
});

test("the necessity caption: true for every placement, a missed class does not stop p from making a cell blue", () => {
  const textOf = (cells, p, x, d) => {
    const f = necessityFacts(cells, p, x, d);
    const t = necessityText(f, x, d);
    for (const l of [t.cap, ...t.lines]) assert.ok(typesets(l), l);
    return { f, all: t.lines.join(" ") };
  };
  // two placements at which the target class (-x, -d) mod p is hit although some class is missed
  const a = textOf([[0, 0], [1, 0], [0, 1]], 2, 4, 6);
  assert.deepEqual(a.f.missed, [1, 1]);
  assert.deepEqual(a.f.target, [0, 0]);
  assert.deepEqual(a.f.targetCell, [0, 0]);
  assert.equal(a.f.targetSymbol, 0);
  assert.equal(kronecker(4n, 6n), 0);
  assert.ok(a.all.includes("so here 2 makes the cell $(0,0)$ blue"), a.all);
  assert.ok(!a.all.includes("forces no cell"));
  const b = textOf([[0, 0], [1, 1]], 3, 9, 12);
  assert.deepEqual(b.f.target, [0, 0]);
  assert.deepEqual(b.f.targetCell, [0, 0]);
  assert.equal(b.f.targetSymbol, 0);
  assert.ok(b.all.includes("so here 3 makes the cell $(0,0)$ blue"), b.all);
  // a placement in the missed class: p divides no cell of the patch in both coordinates
  const c = textOf([[0, 0], [1, 0], [0, 1]], 2, 1, 1);
  assert.deepEqual(c.f.missed, [1, 1]);
  assert.deepEqual(c.f.target, [1, 1]);
  assert.equal(c.f.targetCell, null);
  assert.ok(c.all.includes("a class the patch misses, so at this placement 2 divides no cell of the patch in both coordinates"), c.all);
  for (const [i, j] of [[0, 0], [1, 0], [0, 1]]) assert.ok((1 + i) % 2 !== 0 || (1 + j) % 2 !== 0);
  // over many placements and patches the sentence matches the arithmetic
  const patches = [[[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 1]], [[0, 0], [2, 1], [-1, 2], [1, -1]], [[0, 0], [1, 0], [0, 1], [1, 1]]];
  for (const cells of patches) {
    for (const p of [2, 3, 5]) {
      for (let x = -7; x <= 7; x++) {
        for (let d = -7; d <= 7; d++) {
          const { f, all } = textOf(cells, p, x, d);
          const both = cells.filter(([i, j]) => (x + i) % p === 0 && (d + j) % p === 0);
          assert.equal(f.targetCell === null, both.length === 0, `p=${p} x=${x} d=${d}`);
          if (f.targetCell) {
            assert.equal(f.targetSymbol, 0);
            assert.ok(all.includes(`makes the cell $(${f.targetCell[0]},${f.targetCell[1]})$ blue`) || all.includes("$K(x+i,d+j)=0$"), all);
          } else {
            assert.ok(all.includes("divides no cell of the patch in both coordinates"), all);
          }
        }
      }
    }
  }
});

test("the colouring figure: the region of (1080, 517)", () => {
  const r = regionFacts(1080n, 517n, 0, 0);
  assert.equal(r.complete, true);
  assert.equal(r.area, 70);
  assert.equal(r.genus, 4);
  assert.equal(REGION_CAP, 5000);
});

test("the compact shape of the last section: 541 cells, genus 100, 37 columns, inside a sieved set with P = 43", () => {
  const file = fileURLToPath(new URL("../../data/shapes/c100.json", import.meta.url));
  const { shape } = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(shape.length, 541);
  assert.equal(genusOfCells(shape).genus, 100);
  assert.equal(holeCount(shape), 100);
  assert.equal(new Set(shape.map(([i]) => i)).size, 37);
  const cols = shape.map(([i]) => i);
  assert.equal(Math.max(...cols) - Math.min(...cols) + 1, 37);
  // a missed class modulo every prime p <= 43 gives classes a_p with the shape inside V(43, (a_p))
  for (const p of primesUpTo(43)) {
    const seen = new Set(shape.map(([i, j]) => (((i % p) + p) % p) * p + (((j % p) + p) % p)));
    assert.ok(seen.size < p * p, `p=${p}`);
  }
});
