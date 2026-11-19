// The steps of the kinds of construction: ONE table per kind with the number and the title of every step. The
// numbers follow the four steps of the construction in the answer (small primes, row primes, one row, packing rows):
// the first step of a part carries the part's number alone and the answer's title ("1. Small primes", a main step,
// shown in bold), a further step of the same part has a second digit ("1.2 Remaining cells") and a short title of its
// own. A number alone is always a step of the answer with the answer's title, word for word. The answer changes only
// step one for region type 0 (its classes, then an own prime per remaining cell, then d and x), so that kind has the
// main step 1 and the sub-steps 1.2 to 1.4. The first step (the shape
// and its neighbours) and the last (the check) carry no number and have the same names in both kinds. The heading of a
// step and the label of its step button are both stepLabel of its row, and every text of the Lab that names a step
// does it by stepRef.

const table = (rows) => Object.freeze(rows.map(([number, title]) => Object.freeze({ number, title })));

export const STEP_TABLES = Object.freeze({
  sign: table([[null, "Shape"], ["1", "Small primes"], ["1.2", "Remaining cells"], ["2", "Row primes"], ["2.2", "Cofactors and d"], ["3", "One row"], ["4", "Packing rows"], [null, "Check"]]),
  blue: table([[null, "Shape"], ["1", "Small primes"], ["1.2", "Own primes"], ["1.3", "d"], ["1.4", "x"], [null, "Check"]]),
});

// isMainStep(row) is true for the first step of a part of the answer (a number without a second digit): its label
// is shown in bold.
export function isMainStep({ number }) {
  return !!number && !number.includes(".");
}

// stepNumberText(row) is the number as a step button shows it: "1." for a main step, "1.2" for a further one, "" for
// a step without a number.
export function stepNumberText(row) {
  if (!row.number) return "";
  return isMainStep(row) ? `${row.number}.` : row.number;
}

// stepLabel(row) is the heading of a step and the label of its button: "1. Small primes", "1.2 Remaining cells", or the
// title alone.
export function stepLabel(row) {
  return row.number ? `${stepNumberText(row)} ${row.title}` : row.title;
}

// stepLabels(kind) is the list of the labels of the steps of a kind ("sign" or "blue").
export function stepLabels(kind) {
  return STEP_TABLES[kind].map(stepLabel);
}

// stepPlace(kind, k) names step k of a kind at the start of the position text: "step 1", "step 1.2", or the title of
// a step without a number ("Shape", "Check").
export function stepPlace(kind, k) {
  const row = STEP_TABLES[kind][k];
  return row.number ? `step ${row.number}` : row.title;
}

// stepRef(kind, k, capital) names step k of a kind in a sentence: "step 1", "step 1.2", or for a step without a
// number its title as a noun ("the shape", "the check"). capital: the first letter in upper case, at the start of a
// sentence.
export function stepRef(kind, k, capital = false) {
  const row = STEP_TABLES[kind][k];
  const t = row.title.toLowerCase();
  const ref = row.number ? `step ${row.number}` : t.startsWith("the ") ? t : `the ${t}`;
  return capital ? ref[0].toUpperCase() + ref.slice(1) : ref;
}
