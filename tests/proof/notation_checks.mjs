// The notation checks of the section on sufficiency of the Proof page (used by notation.test.mjs): the count of
// residues of the lemma on sign patterns is A (N is the neighbour set N(S) of section 1, so N never stands alone),
// and the figures are lettered in the order they appear, every reference naming a figure that exists.

import { splitMath } from "../../src/ui/widgets/math.mjs";

// notationProblems(html) is the list of problems (strings) of the HTML text of the section, empty when it is right.
export function notationProblems(html) {
  const out = [];
  const formulas = splitMath(html).filter((p) => p.type === "math").map((p) => p.tex);
  // N only as N(S): a capital N that is not a letter of a longer name and not followed by "("
  for (const tex of formulas) {
    if (/(^|[^A-Za-z\\])N(?![A-Za-z(])/.test(tex)) out.push(`N alone in $${tex}$`);
  }
  // the lemma on sign patterns and the two paragraphs after it count with A
  const k = html.indexOf("Lemma 5 (patterns modulo a prime)");
  const end = html.indexOf("The constant $m^{2}4^{m}$ is generous");
  if (k < 0 || end < k) {
    out.push("the lemma on sign patterns or the paragraph after it is missing");
  } else {
    const lemma = splitMath(html.slice(k, end)).filter((p) => p.type === "math").map((p) => p.tex);
    const withA = lemma.filter((t) => /(^|[^A-Za-z\\])A(?![A-Za-z])/.test(t));
    if (withA.length !== 8) out.push(`the count A appears in ${withA.length} formulas of the lemma, its proof and the paragraph after it, want 8`);
  }
  // the figures: captions "Figure X." in page order A, B, ..., each before its figure, references to existing letters
  const caps = [...html.matchAll(/<b>Figure ([A-Z])\.<\/b>/g)].map((m) => ({ letter: m[1], at: m.index }));
  const letters = caps.map((c) => c.letter).join("");
  const want = "ABCDEFGHIJ".slice(0, caps.length);
  if (letters !== want) out.push(`figure letters in page order ${letters}, want ${want}`);
  const figs = [...html.matchAll(/data-figure="([a-z]+)"/g)].map((m) => ({ name: m[1], at: m.index }));
  for (const c of caps) {
    const next = figs.find((f) => f.at > c.at);
    const nextCap = caps.find((d) => d.at > c.at);
    if (!next || (nextCap && nextCap.at < next.at)) out.push(`Figure ${c.letter} has no figure right after its caption`);
  }
  const named = Object.fromEntries(caps.map((c) => [c.letter, (figs.find((f) => f.at > c.at) || {}).name]));
  if (named.A !== "weil" || named.B !== "factors") out.push(`Figure A is ${named.A}, Figure B is ${named.B}, want weil and factors`);
  for (const m of html.matchAll(/\b[Ff]igure ([A-Z])\b/g)) {
    if (!caps.some((c) => c.letter === m[1])) out.push(`a reference to figure ${m[1]}, which does not exist`);
  }
  // the aside refers to the figure of the factors, which comes below it
  const aside = html.indexOf("How the computed examples do it");
  const ref = /figure ([A-Z]) below/.exec(html.slice(aside));
  if (!ref || named[ref[1]] !== "factors") out.push(`the aside refers to figure ${ref ? ref[1] : "?"} below, want the figure of the factors`);
  return out;
}
