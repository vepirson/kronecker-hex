// The pure parts of the Algorithm page, "the Lab" in the code (no DOM access at import time, used by the page and by
// the Node tests):
// where the input comes from (route, query, store, session copy), the preset table and the colour check of a shape,
// the input records of both kinds (green and red, blue), the stepper position rule, the model of the table j, r1, r2,
// q1, q2, R, the error and progress texts of the green and red construction, and the static colour sources of the
// steps that have no (x0, d0) yet. The blue texts and table are in ./blue/model.mjs.
//
// The Lab never walks the raw event list: everything here reads the view model of buildLabView(events) and the
// result of the construction.

import { cellKey, neighbourhood } from "../../../core/geometry.mjs";
import { shapeS, seedS, shapeZ, seedZ } from "../../../core/shapes.mjs";
import { residueTest } from "../../../core/admissible.mjs";
import { staticSource } from "../../../render/hex_canvas.mjs";
import { labels, lighterOf } from "../../../render/overlays.mjs";
import { CAP_K } from "../../../construct/pipeline.mjs";
import { kindOf, runPlace } from "../../../construct/index.mjs";
import { messageOf } from "../../dom.mjs";
import { colourName, colourOfName } from "../../../core/regions.mjs";
import { stepRef } from "./steps.mjs";

// ---------- files ----------

// The content files of the Lab (in content/lab/), in load order. Each is a JSON object { id: html }. An id defined
// twice keeps the value of the later file. A file marked optional is loaded only when a step module or the extras
// module declares it in its export contentFiles (a list of names), so that a file that does not exist yet is never
// requested.
export const CONTENT_FILES = Object.freeze([
  Object.freeze({ name: "steps0_4.json", optional: false }),
  Object.freeze({ name: "steps5_7.json", optional: true }),
  Object.freeze({ name: "blue_steps.json", optional: true }),
]);

// contentFilesToLoad(modules) is the list of names of CONTENT_FILES to fetch: every required file, and every
// optional one named in the contentFiles export of one of the modules. A name declared by a module but missing
// from CONTENT_FILES is added at the end.
export function contentFilesToLoad(modules = []) {
  const declared = new Set();
  for (const m of modules) if (m && Array.isArray(m.contentFiles)) for (const n of m.contentFiles) declared.add(String(n));
  const out = CONTENT_FILES.filter((f) => !f.optional || declared.has(f.name)).map((f) => f.name);
  for (const n of declared) if (!out.includes(n) && /^[a-z0-9_]+\.json$/.test(n)) out.push(n);
  return out;
}

// contentUrl(name) is the URL of a content file of the Lab (relative to this module).
export function contentUrl(name) {
  return new URL(`../../../../content/lab/${name}`, import.meta.url);
}

// The URL of the token table data/tokens.json and of a shipped shape file data/shapes/<file>.
export const TOKENS_URL = new URL("../../../../data/tokens.json", import.meta.url);
export function shapeUrl(file) {
  return new URL(`../../../../data/shapes/${file}`, import.meta.url);
}

// The key of the session copy of the last shape sent to the Lab ({ shape, seed, colour, lift, id }, numbers only).
export const SESSION_KEY = "kronecker-hex-lab-input";

// ---------- presets ----------

const COMPACT = {
  c10: { file: "c10.json", label: null, title: "compact shape, genus 10", short: "compact shape, genus 10" }, // no stored construction: always live
  c100: { file: "c100.json", label: "genus100", title: "compact shape, genus 100", short: "compact shape, genus 100" },
  g0hex: { file: "genus0_hexagon.json", label: "genus0_hexagon", title: "hexagon, genus 0", short: "hexagon, genus 0" },
  maxhex: { file: "hexagon_genus117.json", label: "hexagon_genus117", title: "hexagon, genus 117", short: "hexagon, genus 117" },
  // a blue shape (the colour check allows blue only), always live, in the worker by its size
  g0star: { file: "star_genus0.json", label: null, title: "star, genus 0", short: "star, genus 0" },
};

// The families of computed shapes: the shapes of type +-1 (green or red, id letter s) and of type 0 (blue, id letter
// z), g >= 1, named as in the Gallery. tex is the upper index of the formula, word the type in the plain name.
const FAMILIES = Object.freeze({
  s: Object.freeze({ shape: shapeS, seed: seedS, tex: "\\pm1", word: "+-1" }),
  z: Object.freeze({ shape: shapeZ, seed: seedZ, tex: "0", word: "0" }),
});

// familyName(f, g) is the name of the shape of genus g of the family f in two forms (g may be the letter "g"):
//   tex   the formula, typeset where the element can hold markup: "S_{3}^{\pm1}", "S_{3}^{0}" (no dollar signs)
//   text  the plain form for an attribute, an option or a file name: "S_3 (type +-1)", "S_3 (type 0)"
export function familyName(f, g) {
  const fam = FAMILIES[f];
  return Object.freeze({ tex: `S_{${g}}^{${fam.tex}}`, text: `S_${g} (type ${fam.word})` });
}

// The presets of the Lab in menu order, also the start shapes of the shape editor: [{ name, title, titleTex, short,
// shortTex, compact, family (s, z, or null for a shipped shape), g (or null), file (or null) }]. title is the plain
// description ("S_3 (type +-1), genus 3"), short the plain menu text of the editor ("S_3 (type +-1)"), titleTex and
// shortTex the same with the family name as a $...$ formula, for the elements that typeset it (the same as title and
// short for a shipped shape). s1 .. s10 are the thin shapes of type +-1, z1 .. z10 the blue ladder of type 0, the
// others the shipped compact shapes: c10 (59 cells, no stored construction), the three of 541 to 656 cells, and
// g0star (the filled star of 433 cells, no stored construction, region type 0 only). Which colours a preset allows is
// decided by the colour check of its shape (colourCheck), not stored here.
export const LAB_PRESETS = Object.freeze([
  ...["s", "z"].flatMap((f) =>
    Array.from({ length: 10 }, (_, k) => {
      const n = familyName(f, k + 1);
      return Object.freeze({
        name: `${f}${k + 1}`, title: `${n.text}, genus ${k + 1}`, titleTex: `$${n.tex}$, genus ${k + 1}`, short: n.text, shortTex: `$${n.tex}$`,
        compact: false, family: f, g: k + 1, file: null,
      });
    }),
  ),
  ...Object.entries(COMPACT).map(([name, c]) => Object.freeze({ name, title: c.title, titleTex: c.title, short: c.short, shortTex: c.short, compact: true, family: null, g: null, file: c.file })),
]);

// presetShape(preset) is { shape, seed } of a computed preset (an entry of LAB_PRESETS or a plan with family and g),
// or null for a shipped shape (its file is loaded by the page).
export function presetShape(preset) {
  const f = preset && FAMILIES[preset.family];
  return f ? { shape: f.shape(preset.g), seed: f.seed(preset.g) } : null;
}

// ---------- the colour check ----------

const failingPrime = (cells) => {
  const bad = residueTest(cells).find((r) => r.missed === null);
  return bad ? bad.p : null;
};

// The check of a kind (fields testedCells and reason of its entry in KIND_FIELDS): null when the residue test of the
// tested cells passes, else { p, reason } with the smallest failing prime p.
const checkOfKind = (f, shape) => {
  const p = failingPrime(f.testedCells(shape));
  return p === null ? null : { p, reason: f.reason(p) };
};

// signCheck(shape) is null when a green or red region can have the shape (S admissible), else { p, reason } with the
// smallest prime p at which S meets every class.
export function signCheck(shape) {
  return checkOfKind(KIND_FIELDS.sign, shape);
}

// blueCheck(shape) is null when a blue region can have the shape (N(S) admissible), else { p, reason } with the
// smallest prime p at which N(S) meets every class.
export function blueCheck(shape) {
  return checkOfKind(KIND_FIELDS.blue, shape);
}

// colourCheck(shape, colour) is the check of the kind of the colour (1, -1: signCheck, 0: blueCheck).
export function colourCheck(shape, colour) {
  return fieldsOf({ colour }).check(shape);
}

// typeText(colour) is the region type of a colour as the site writes it: "+1", "-1", "0".
export function typeText(colour) {
  return colour > 0 ? "+1" : colour < 0 ? "-1" : "0";
}

// blockedText(title, colour, check) is the sentence shown when a preset does not allow a region type, with a capital
// first letter (a title that starts with a formula keeps it).
export function blockedText(title, colour, check) {
  const t = String(title);
  return `${t[0].toUpperCase()}${t.slice(1)} cannot have region type ${typeText(colour)}: ${check.reason}.`;
}

// presetTitle(name) is the title of the preset of that name (the name itself for an unknown one).
export function presetTitle(name) {
  const p = LAB_PRESETS.find((x) => x.name === name);
  return p ? p.title : String(name);
}

// readColour(text) is 1 for "green" (and for a missing value), -1 for "red", 0 for "blue", null for anything else
// (colourOfName of the colour words).
export function readColour(text) {
  return text === undefined || text === null || text === "" ? 1 : colourOfName(text);
}

// colourWord(c) is "green" for 1, "red" for -1 and "blue" for 0 (colourName of the colour words, "green" for
// anything else).
export function colourWord(c) {
  return colourName(c) || colourName(1);
}

const presetOf = (name) => LAB_PRESETS.find((p) => p.name === name) || null;

// The plan of a computed preset that its colour check refuses: the plan with blocked = { p, reason, text, plain }
// (text with the shape's name as a $...$ formula, for the start panel that typesets it, plain in plain words).
const withCheck = (plan, preset) => {
  const chk = colourCheck(presetShape(preset).shape, plan.colour);
  return chk ? { ...plan, blocked: { ...chk, text: blockedText(preset.titleTex, plan.colour, chk), plain: blockedText(preset.title, plan.colour, chk) } } : plan;
};

// resolveSignPreset(name, colourText, modeText) returns the plan of a preset in green or red, or null for an unknown
// name or a colour that is not green or red:
//   s1 .. s10: { kind: "preset", name, colour, lift: 1, g, shapeKind: "computed", mode: "live", runOn: "main" }
//     (mode is ignored, the run is live on the main thread),
//   z1 .. z10: the same with family "z" and blocked (the colour check of S_g^{0} fails),
//   c100, g0hex, maxhex: { kind: "preset", name, colour, lift: 1, shapeKind: "file", file, tokenLabel, mode,
//     runOn } with mode "replay" (default: the stored token, main thread) or "live" (recomputed in the worker),
//   c10, g0star: the same with tokenLabel null, mode "live", runOn "main" (no stored token, the mode is ignored; the
//     page refuses g0star in green or red by the colour check of the loaded shape).
// A computed plan carries family only for S_g^{0} (S_g^{+-1} plans keep their form).
export function resolveSignPreset(name, colourText, modeText) {
  const colour = readColour(colourText);
  if (colour !== 1 && colour !== -1) return null;
  const p = presetOf(name);
  if (!p) return null;
  if (p.family) {
    const plan = { kind: "preset", name, colour, lift: 1, g: p.g, shapeKind: "computed", mode: "live", runOn: "main" };
    return p.family === "s" ? plan : withCheck({ ...plan, family: p.family }, p);
  }
  const c = COMPACT[name];
  if (c.label === null) {
    return { kind: "preset", name, colour, lift: 1, shapeKind: "file", file: c.file, tokenLabel: null, mode: "live", runOn: "main" };
  }
  const mode = modeText === "live" ? "live" : "replay";
  return {
    kind: "preset", name, colour, lift: 1, shapeKind: "file", file: c.file, tokenLabel: `${c.label}_${colourWord(colour)}`,
    mode, runOn: mode === "live" ? "worker" : "main",
  };
}

// resolveBluePreset(name, colourText) returns the plan of a preset in blue, or null for an unknown name or a colour
// that is not blue. Every blue preset runs live (the mode is ignored): computed { kind: "preset", name, colour: 0,
// family, g, shapeKind: "computed", mode: "live", runOn } (runOn by runPlace of the shape, blocked when the colour
// check fails), shipped { kind: "preset", name, colour: 0, shapeKind: "file", file, tokenLabel: null, mode: "live",
// runOn: null } (the page checks the loaded shape and picks runOn by its size).
export function resolveBluePreset(name, colourText) {
  if (readColour(colourText) !== 0) return null;
  const p = presetOf(name);
  if (!p) return null;
  if (p.family) {
    const plan = { kind: "preset", name, colour: 0, family: p.family, g: p.g, shapeKind: "computed", mode: "live", runOn: KIND_FIELDS.blue.computedRunOn(p) };
    return withCheck(plan, p);
  }
  return { kind: "preset", name, colour: 0, shapeKind: "file", file: p.file, tokenLabel: null, mode: "live", runOn: null };
}

// resolvePreset(name, colourText, modeText) is the plan of a preset in the colour of colourText (resolvePreset of the
// kind: resolveSignPreset or resolveBluePreset), null for an unknown name or colour.
export function resolvePreset(name, colourText, modeText) {
  const colour = readColour(colourText);
  if (colour === null) return null;
  return fieldsOf({ colour }).resolvePreset(name, colourText, modeText);
}

// presetInput(plan) is the construction input of a computed preset (S_g^{+-1} or S_g^{0}, the family of the kind when absent):
// the input record of the kind, { shape, seed, colour, lift, id } in green or red, { shape, seed, colour: 0, id } in
// blue.
export function presetInput(plan) {
  const f = fieldsOf(plan);
  const { shape, seed } = presetShape({ family: plan.family || f.family, g: plan.g });
  return f.inputRecord({ shape, seed, colour: plan.colour, lift: plan.lift, id: null });
}

// The largest genus of the box "any genus", per kind: the largest g whose live run, from the click to PASS, stayed
// under 4 s in three runs of three in headless Chrome on the development machine, and so did every smaller g that
// was measured (a margin below the 5 s that the page promises in its tests). S_g^{+-1} in green or red: 3.2 s at g = 25,
// 3.6 s at 26. S_g^{0} in blue: at most 3.0 s for g = 190, 200, 210 and 211 to 219, 3.8 to 5.1 s at g = 220 in two of
// three sessions, at most 3.3 s at 249 (the blue runs vary by up to a second from run to run).
export const GENUS_LIMITS = Object.freeze({ sign: 25, blue: 210 });

// The pure fields of the two kinds, one object per kind (kindOf of the construction modules picks it). The entries
// of the Lab's registry (kinds.mjs) take these fields and add the display parts. Every function of this module that
// works for both kinds reads the field of the kind, it never tests the kind or the colour itself.
//   family          the id letter of the computed shapes of the kind (s for S_g^{+-1}, z for S_g^{0}) in FAMILIES
//   testedCells     the cells whose residue test decides whether the kind can build a shape (S, or N(S) for blue)
//   analysisPart    the same test in the shape editor's analysis (analyseShape: "residue" of S, "ring" of N(S))
//   reason(p)       the sentence of a failure of that test at the prime p
//   verdict         the same in a word or two, the tooltip of a region type that the test refuses
//   check(shape)    null or { p, reason } (signCheck, blueCheck)
//   inputRecord     the plain input record of the kind (signInputRecord, blueInputRecord)
//   resolvePreset   the plan of a preset in a colour of the kind (resolveSignPreset, resolveBluePreset)
//   planFields      the fields a live plan of the kind carries beside the common ones (lift for green and red)
//   computedRunOn   where a live run of a computed shape { family, g } of the box "any genus" goes: runPlace of the
//                   construction modules for both kinds (a live green or red run in the worker, so that the box's
//                   largest genus does not stop the page for seconds, a blue one by its size). The presets s1 .. s10
//                   keep the main thread (resolveSignPreset: at most 5 sign cells in a row, under 0.1 s)
//   genusLimit      the largest genus of the box "any genus"
export const KIND_FIELDS = Object.freeze({
  sign: Object.freeze({
    family: "s", testedCells: (shape) => shape, analysisPart: "residue", reason: (p) => `the shape meets every class modulo ${p}`, verdict: "Not admissible",
    check: signCheck, inputRecord: signInputRecord, resolvePreset: resolveSignPreset, planFields: Object.freeze({ lift: 1 }),
    computedRunOn: (preset) => runPlace({ shape: presetShape(preset).shape, colour: 1 }), genusLimit: GENUS_LIMITS.sign,
  }),
  blue: Object.freeze({
    family: "z", testedCells: neighbourhood, analysisPart: "ring", reason: (p) => `its neighbours meet every class modulo ${p}`, verdict: "Neighbours not admissible",
    check: blueCheck, inputRecord: blueInputRecord, resolvePreset: resolveBluePreset, planFields: Object.freeze({}),
    computedRunOn: (preset) => runPlace({ shape: presetShape(preset).shape, colour: 0 }), genusLimit: GENUS_LIMITS.blue,
  }),
});

// fieldsOf(input) is the entry of KIND_FIELDS of the kind of an input, a plan or { colour }.
export function fieldsOf(input) {
  return KIND_FIELDS[kindOf(input)];
}

// genusLimit(colour) is the largest genus of the box for a colour (1, -1 or 0).
export function genusLimit(colour) {
  return fieldsOf({ colour }).genusLimit;
}

// genusLimitsText() is the line next to the box (the family names as $...$ formulas, typeset by the page): the
// limits, never the time they were measured by.
export function genusLimitsText() {
  return `$${familyName("s", "g").tex}$ of region type +1 or -1 up to g = ${GENUS_LIMITS.sign}, $${familyName("z", "g").tex}$ of region type 0 up to g = ${GENUS_LIMITS.blue}.`;
}

// resolveGenus(gText, colourText) is the plan of the box "any genus": the shape of type +-1 in green or red, of type
// 0 in blue, live, { kind: "preset", name (the plain name, "S_12 (type +-1)" or "S_12 (type 0)"), nameTex (the same as
// a $...$ formula), colour, family, g, shapeKind: "computed", mode: "live", runOn, and the planFields of the kind (lift
// in green and red) }, with blocked = { reason, text, plain } and runOn null above the limit of the kind (reason and
// text with the names as formulas, plain in plain words). null for a genus that is not a whole number from 1 or an
// unknown colour. runOn: computedRunOn of the kind.
export function resolveGenus(gText, colourText) {
  const colour = readColour(colourText);
  const t = String(gText === undefined || gText === null ? "" : gText).trim();
  if (colour === null || !/^[1-9][0-9]{0,5}$/.test(t)) return null;
  const g = Number(t);
  const f = fieldsOf({ colour });
  const { family, genusLimit: limit } = f;
  const n = familyName(family, g);
  const plan = { kind: "preset", name: n.text, nameTex: `$${n.tex}$`, colour, ...f.planFields, family, g, shapeKind: "computed", mode: "live" };
  if (g > limit) {
    const box = (name) => `the Any genus box packs ${name} up to g = ${limit}`;
    const reason = box(`$${familyName(family, "g").tex}$`);
    const plain = `${n.text} cannot be packed here: ${box(familyName(family, "g").text)}.`;
    return { ...plan, runOn: null, blocked: { reason, text: `${plan.nameTex} cannot be packed here: ${reason}.`, plain } };
  }
  return { ...plan, runOn: f.computedRunOn({ family, g }) };
}

// ---------- inputs ----------

const isPair = (c) => Array.isArray(c) && c.length === 2 && Number.isSafeInteger(c[0]) && Number.isSafeInteger(c[1]);

// The shape, seed and id of an input, or null (shape a non-empty list of integer pairs, seed a pair, id a string or
// null).
function shapeFields(input) {
  if (!input || typeof input !== "object") return null;
  const { shape, seed } = input;
  const id = input.id === undefined ? null : input.id;
  if (!Array.isArray(shape) || shape.length === 0 || !shape.every(isPair) || !isPair(seed)) return null;
  if (id !== null && typeof id !== "string") return null;
  return { shape: shape.map(([i, j]) => [i, j]), seed: [seed[0], seed[1]], id };
}

// signInputRecord(input) is the plain copy { shape, seed, colour, lift, id } of a green or red Lab input (numbers and
// strings only, fresh arrays), or null when the input is not of that form (colour 1 or -1, lift 0 .. 3, default 1).
export function signInputRecord(input) {
  const f = shapeFields(input);
  if (!f) return null;
  const lift = input.lift === undefined ? 1 : input.lift;
  if (input.colour !== 1 && input.colour !== -1) return null;
  if (!Number.isInteger(lift) || lift < 0 || lift > 3) return null;
  return { shape: f.shape, seed: f.seed, colour: input.colour, lift, id: f.id };
}

// blueInputRecord(input) is the plain copy { shape, seed, colour: 0, id } of a blue Lab input (a blue construction has
// no lift), or null when the input is not of that form.
export function blueInputRecord(input) {
  const f = shapeFields(input);
  if (!f || input.colour !== 0) return null;
  return { shape: f.shape, seed: f.seed, colour: 0, id: f.id };
}

// labInputRecord(input) is the plain record of a Lab input of either kind (the inputRecord of its kind:
// signInputRecord or blueInputRecord), or null when the input is not of that form.
export function labInputRecord(input) {
  if (!input || typeof input !== "object") return null;
  return fieldsOf(input).inputRecord(input);
}

// parseSessionRecord(text) reads the session copy (JSON text) and returns labInputRecord of it, or null.
export function parseSessionRecord(text) {
  if (typeof text !== "string" || text === "") return null;
  try {
    return labInputRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

// resolveInput({ params, query, storeInput, sessionText }) chooses what the Lab runs, in this order of precedence:
//   1. the route #/algorithm/w/:token: { kind: "token", token, mode: "replay", runOn: null } (where the replay runs is
//      known once the page has read the token)
//   2. the query ?genus=..&colour=.. (the box "any genus"): the plan of resolveGenus, or { kind: "none", problem }
//      for a bad genus or colour and above the limit, then the query ?preset=..&colour=..&mode=..: the plan of
//      resolvePreset, or { kind: "none", problem } for an unknown preset or colour, and for a computed preset whose
//      colour check fails (the reason)
//   3. the store's lab.input, else the session copy: { kind: "input", input (labInputRecord), from: "store" |
//      "session", mode: "live", runOn (runPlace of the construction modules) }
//   4. { kind: "none", problem: null } (the start panel).
export function resolveInput({ params = {}, query = {}, storeInput = null, sessionText = null } = {}) {
  if (params && typeof params.token === "string" && params.token !== "") {
    return { kind: "token", token: params.token, mode: "replay", runOn: null };
  }
  // the problem of an address whose colour cannot be read, else the one of its other part
  const problemOf = (other) => (readColour(query.colour) === null ? `The region type ${JSON.stringify(String(query.colour))} is not +1, -1 or 0.` : other);
  if (query && query.genus !== undefined) {
    const plan = resolveGenus(query.genus, query.colour);
    if (plan && plan.blocked) return { kind: "none", problem: plan.blocked.text };
    if (plan) return plan;
    return { kind: "none", problem: problemOf(`The genus ${JSON.stringify(String(query.genus))} is not a whole number from 1.`) };
  }
  if (query && query.preset !== undefined) {
    const plan = resolvePreset(query.preset, query.colour, query.mode);
    if (plan && plan.blocked) return { kind: "none", problem: plan.blocked.text };
    if (plan) return plan;
    return { kind: "none", problem: problemOf(`There is no shape named ${JSON.stringify(String(query.preset))}.`) };
  }
  const fromStore = labInputRecord(storeInput);
  if (fromStore) return { kind: "input", input: fromStore, from: "store", mode: "live", runOn: runPlace(fromStore) };
  const fromSession = parseSessionRecord(sessionText);
  if (fromSession) return { kind: "input", input: fromSession, from: "session", mode: "live", runOn: runPlace(fromSession) };
  return { kind: "none", problem: null };
}

// ---------- the stepper position ----------

// clampPosition({ step, sub }, available, subCountOf) is the nearest valid position: a step without events moves
// down to the highest step below it that has events (0 when none has), and sub is kept in 0 .. subCountOf(step).
// The steps are 0 .. available.length - 1 (one flag per step of the kind of the construction).
// Position rule of the stepper: sub 0 is the overview of a step, sub n (1 .. subCount) the n-th item, "Next" raises
// sub up to subCount and then moves to the next step with sub 0.
export function clampPosition({ step, sub }, available, subCountOf) {
  const last = available ? Math.max(0, available.length - 1) : 0;
  let s = Number.isInteger(step) ? Math.max(0, Math.min(last, step)) : 0;
  while (s > 0 && !(available && available[s])) s--;
  const n = Math.max(0, subCountOf(s) | 0);
  const u = Number.isInteger(sub) ? Math.max(0, Math.min(n, sub)) : 0;
  return { step: s, sub: u };
}

// ---------- the table ----------

// The columns of the table in display order, and the step from which each one is filled.
export const TABLE_COLUMNS = Object.freeze([
  { key: "j", label: "j", from: 0 },
  { key: "r1", label: "r1", from: 5 },
  { key: "r2", label: "r2", from: 5 },
  { key: "q1", label: "q1", from: 3 },
  { key: "q2", label: "q2", from: 3 },
  { key: "R", label: "R", from: 4 },
]);

// The text of a cell that is not filled yet.
export const DOT = ".";

const str = (v) => (v === null || v === undefined ? DOT : typeof v === "bigint" ? v.toString() : String(v));

// tableModel(view, { step, sub, result, revealed }) returns the lines of the table, one per row with sign cells in
// ascending j: [{ j, k, cells: { j, r1, r2, q1, q2, R } (strings, DOT when not filled), raw: { r1, r2, q1, q2, R },
// tampered: { r1, r2, R } (booleans) }]. A column is filled from its step on (q1, q2 from 3, R from 4, r1, r2 from
// 5). At its own step only the first revealed(step, sub) rows are filled (default: sub, since sub n of steps 3, 4,
// 5 is the n-th row). Values not known yet (a live run) stay DOT. With a tampered result (result.tampered) the
// columns r1, r2, R show the result's values and mark the changed ones.
export function tableModel(view, { step = 0, sub = 0, result = null, revealed = null } = {}) {
  const rows = view && Array.isArray(view.rows) ? view.rows : [];
  const count = (s) => {
    if (step < s) return 0;
    if (step > s) return rows.length;
    const n = typeof revealed === "function" ? revealed(s, sub) : sub;
    return Math.max(0, Math.min(rows.length, Number.isInteger(n) ? n : 0));
  };
  const nQ = count(3), nR = count(4), nr = count(5);
  const byJ = new Map();
  if (result && result.tampered && Array.isArray(result.rows)) for (const r of result.rows) byJ.set(r.j, r);
  return rows.map((r, idx) => {
    const t = byJ.get(r.j);
    const raw = {
      q1: r.q1, q2: r.q2,
      r1: t ? t.r1 : r.r1, r2: t ? t.r2 : r.r2, R: t ? t.rho : r.R,
    };
    const tampered = {
      r1: !!t && r.r1 !== null && t.r1 !== r.r1,
      r2: !!t && r.r2 !== null && t.r2 !== r.r2,
      R: !!t && r.R !== null && t.rho !== r.R,
    };
    return {
      j: r.j, k: r.k, index: idx,
      cells: {
        j: String(r.j),
        q1: idx < nQ ? str(raw.q1) : DOT, q2: idx < nQ ? str(raw.q2) : DOT,
        R: idx < nR ? str(raw.R) : DOT,
        r1: idx < nr ? str(raw.r1) : DOT, r2: idx < nr ? str(raw.r2) : DOT,
      },
      raw, tampered,
    };
  });
}

// The columns of the second table: what the first step fixes modulo each small prime.
export const RESIDUE_COLUMNS = Object.freeze([
  { key: "p", label: "p" },
  { key: "x", label: "x mod p" },
  { key: "d", label: "d mod p" },
]);

// residueLines(list, step, sub) is the second table of a kind, one line per small prime of its first step in the
// order of the step: list [{ p, xRes, xMod (absent: p), dRes (null: d free) }], lines [{ key: p, data: { p }, cells:
// { p, x, d } }] with cells { text }. The residues fill as the first table's columns do: from step 1 on, at step 1
// only the first sub primes (sub n of step 1 is the n-th prime). x mod 8 is written "r mod 8" on the line of 2.
export function residueLines(list, step, sub) {
  const n = step < 1 ? 0 : step > 1 ? list.length : Math.max(0, Math.min(list.length, sub | 0));
  return list.map((s, k) => {
    const shown = k < n;
    const x = s.xMod && s.xMod !== s.p ? `${s.xRes} mod ${s.xMod}` : String(s.xRes);
    return {
      key: s.p, data: { p: s.p },
      cells: { p: { text: String(s.p) }, x: { text: shown ? x : DOT }, d: { text: shown ? (s.dRes === null ? "free" : String(s.dRes)) : DOT } },
    };
  });
}

// residueFocus(list, step, sub) is the prime in focus of the second table (the prime of sub n of step 1, else null),
// residueSub(list, p) the item of step 1 of the prime p (or null).
export function residueFocus(list, step, sub) {
  return step === 1 && sub > 0 && list[sub - 1] ? list[sub - 1].p : null;
}
export function residueSub(list, p) {
  const k = list.findIndex((s) => s.p === p);
  return k < 0 ? null : k + 1;
}

// defaultFocusRow(view, step, sub) is the row j in focus by default: for steps 2 to 5 (whose sub n is the n-th row
// with sign cells) the row of sub n, else null.
export function defaultFocusRow(view, step, sub) {
  if (step < 2 || step > 5 || !(sub > 0) || !view || !view.rows) return null;
  const r = view.rows[sub - 1];
  return r ? r.j : null;
}

// rowSubOf(view, j) is the sub of the row j in the steps that run through the rows (index + 1), or null.
export function rowSubOf(view, j) {
  if (!view || !view.rows) return null;
  const k = view.rows.findIndex((r) => r.j === j);
  return k < 0 ? null : k + 1;
}

// ---------- texts of the status line ----------

const PHASES = { table1: "sign table of q1", sort: "sort of the table", scan: "scan of q2" };
// the index of the step that solves the rows (one row)
const ROW_STEP = 5;

// rowInProgress(view) is the row j being solved (from the progress record, else the first row with a target and no
// solution yet), or null.
export function rowInProgress(view) {
  if (!view) return null;
  if (view.progress) return view.progress.j;
  const r = (view.rows || []).find((x) => x.target !== null && x.r1 === null);
  return r ? r.j : null;
}

// progressInfo(view) describes a running construction: { text, j, phase, percent, place, rows } with the row in
// progress, its number of sign cells and its place among the rows (place, from 1, of rows), the phase and the percent
// of the phase. null when nothing is known yet.
export function progressInfo(view) {
  if (!view || !view.start) return null;
  const rows = view.rows || [];
  const solved = rows.filter((r) => r.r1 !== null).length;
  const j = rowInProgress(view);
  if (j !== null) {
    const idx = rows.findIndex((r) => r.j === j);
    const k = idx >= 0 ? rows[idx].k : null;
    const p = view.progress;
    const percent = p && p.total > 0 ? Math.min(100, Math.floor((100 * p.done) / p.total)) : null;
    const phase = p ? p.phase : null;
    const where = `row ${j}${k !== null ? ` (${k} cells of type +1 or -1)` : ""}, ${idx + 1} of ${rows.length}`;
    const what = p ? `${PHASES[phase] || phase} ${percent === null ? "" : `${percent}%`}`.trim() : "solving";
    return { text: `${stepRef("sign", ROW_STEP, true)}: ${where}: ${what}. ${solved} rows solved.`, j, phase, percent, place: idx + 1, rows: rows.length };
  }
  let last = 0;
  for (let s = 0; s < view.available.length; s++) if (view.available[s]) last = s;
  return { text: `${stepRef("sign", last, true)} reached, ${solved} of ${rows.length} rows solved.`, j: null, phase: null, percent: null, place: null, rows: rows.length };
}

// signProgressText(view) is the progress of a running sign construction for the status chip: { chip (the place of
// the row being solved among the rows with sign cells, "row 20 of 39", or "running" before the rows), text (the
// sentence of progressInfo, with the percent of the row's phase), percent }, or null when nothing is known yet.
export function signProgressText(view) {
  const p = progressInfo(view);
  if (!p) return null;
  const chip = p.j === null ? "running" : `row ${p.place} of ${p.rows}`;
  return { chip, text: p.text, percent: p.percent };
}

// ---------- error texts ----------

// The construction gives up when a row has more sign cells than this (the row solve's tables double per two cells).
export const ROW_CAP = CAP_K;

// errorInfo(error) turns an error event of the construction, a thrown error with a code (a token that could not be
// opened), or { code: "stopped", j } (the worker stopped) into { code, title, sentence, detail, editorLink, startLink,
// technical } (plain text, detail may be null). editorLink says whether a link back to the shape editor helps,
// startLink whether a link to the start panel does, technical is the message of a code that the sentence does not
// explain (shown in the tooltip with the code), else absent.
export function errorInfo(error) {
  const e = error || {};
  const code = e.code || "unknown";
  const msg = messageOf(e);
  switch (code) {
    case "inadmissible":
      return {
        code, title: "The shape is not admissible", editorLink: true,
        sentence: `Every class modulo ${e.p} contains a cell of the shape.`,
        detail: `Whatever x and d are, one cell of the shape then has both coordinates divisible by ${e.p}, and such a cell has region type 0. So no region of type +1 or -1 has this shape. Remove a cell from one of the classes modulo ${e.p}.`,
      };
    case "row_cap":
      return {
        code, title: "A row has too many cells of type +1 or -1", editorLink: true,
        sentence: `Row ${e.j} has ${e.k} cells of type +1 or -1, more than ${ROW_CAP}.`,
        detail: `Row ${e.j} is too long. Make the rows of the shape shorter.`,
      };
    case "bad_input":
      return { code, title: "The input is not a valid shape", editorLink: true, sentence: msg || "The shape could not be read.", detail: null };
    case "no_d0":
      return { code, title: "No value of d passed", editorLink: true, sentence: msg || "No candidate for d passed every row.", detail: null };
    case "sigma_zero":
      return { code, title: "Internal error", editorLink: false, sentence: msg, detail: "A small factor of a cell of type +1 or -1 was 0, which the choice of the small primes excludes. Please report this shape." };
    case "replay_mismatch":
      return { code, title: "The stored construction does not pass the checks", editorLink: false, sentence: msg, detail: "A replay recomputes every check of the construction from the stored numbers. One of them failed, so the link was changed or damaged." };
    case "stopped":
      return {
        code, title: "The construction stopped", editorLink: true,
        sentence: e.j === null || e.j === undefined ? "The construction stopped before it finished." : `The construction stopped while it solved row ${e.j}.`,
        detail: "The browser most likely ran out of memory for the tables of a long row.",
      };
    default:
      // a damaged link: a plain sentence and the way back to the shapes, the code and its message only in the tooltip
      return { code, title: "The link could not be opened", editorLink: false, startLink: true, sentence: "This link is damaged or incomplete. Copy it again, or choose a shape.", detail: null, technical: msg || null };
  }
}

// ---------- static colour sources of the steps without (x0, d0) ----------

// keySet(cells) is the Set of cellKey of a list of cells [i, j].
export function keySet(cells) {
  const s = new Set();
  for (const [i, j] of cells || []) s.add(cellKey(i, j));
  return s;
}

// windowColours(view, { withN, forced }) is the Map cellKey -> target colour of the window: eps on S, and when
// withN is true -eps on N(S) except the cells of the Set forced (cellKey), which are blue (0).
export function windowColours(view, { withN = true, forced = null } = {}) {
  const m = new Map();
  const w = view && view.window;
  if (!w) return m;
  for (const [i, j] of w.S) m.set(cellKey(i, j), w.eps);
  if (withN) for (const [i, j] of w.N) {
    const k = cellKey(i, j);
    m.set(k, forced && forced.has(k) ? 0 : -w.eps);
  }
  return m;
}

// sourceOfColours(map) is a static colour source drawing the colours of a Map cellKey -> -1 | 0 | 1, every other
// cell empty.
export function sourceOfColours(map) {
  return staticSource((i, j) => {
    const v = map.get(cellKey(i, j));
    return v === undefined ? null : v;
  });
}

// forcedUpTo(view, n) is the Set (cellKey) of the cells forced blue by the first n small primes.
export function forcedUpTo(view, n) {
  const s = new Set();
  const list = view && view.smallPrimes ? view.smallPrimes.slice(0, Math.max(0, n)) : [];
  for (const p of list) for (const [i, j] of p.forced) s.add(cellKey(i, j));
  return s;
}

// cellFails(c) is true when a checked cell { want, got } of a verification does not have its wanted colour: got
// differs from want, or for want "nonzero" (a neighbour of a blue region) got is 0. The one rule of a wrong cell.
export function cellFails(c) {
  return c.want === "nonzero" ? c.got === 0 : c.got !== c.want;
}

// mismatchCells(rows) is the list of cells [i, j] of verify rows [{ j, cells: [{ i, want, got }] }] that fail
// (cellFails).
export function mismatchCells(rows) {
  const out = [];
  for (const r of rows || []) for (const c of r.cells) if (cellFails(c)) out.push([c.i, r.j]);
  return out;
}

// signCellsOf(rows) is the list of sign cells [i, j] of rows [{ j, cells: [{ i, tau }] }].
export function signCellsOf(rows) {
  const out = [];
  for (const r of rows || []) for (const c of r.cells) out.push([c.i, r.j]);
  return out;
}

// digits(v) is the number of decimal digits of |v| (bigint or safe integer).
export function digits(v) {
  if (v === null || v === undefined) return null;
  const s = (typeof v === "bigint" ? v : BigInt(v)).toString();
  return s.startsWith("-") ? s.length - 1 : s.length;
}

// signWord(t) is "+" for 1, "-" for -1, "0" for 0.
export function signWord(t) {
  return t > 0 ? "+" : t < 0 ? "-" : "0";
}

// targetLabels(row) is the overlay that writes on each sign cell of a row ({ j, cells: [{ i, tau }] }) the sign of its
// target, the region type the cell must end with. A + or - on the canvas means this in every step: the steps that
// write signs on cells use this overlay, the signs of single factors stay in the step's panel.
// Each sign sits on a smaller hexagon (SIGN_BACK of the cell's size, centred, the cell's orientation) in the theme's
// dark outline colour, written in the lighter of the theme's canvas and text colours (labels() with these two colours
// swapped in), so that it reads on every fill and the cell's own colour stays visible as a ring around it.
// The overlay carries its list [[i, j, sign]] as items (read by the browser checks).
export const SIGN_BACK = 0.58;
// The cell size in pixels below which labels() writes nothing (no back is drawn there either).
const SIGN_MIN_CELL = 9;
export function targetLabels(row) {
  const items = row.cells.map((c) => [c.i, row.j, signWord(c.tau)]);
  const text = labels(items);
  return {
    ...text,
    items,
    draw(ctx, view) {
      if (view.cell < SIGN_MIN_CELL) return;
      const back = new Path2D();
      for (const [i, j] of items) {
        const [X, Y] = view.toScreen(i, j);
        view.hexPath(back, X, Y, view.R * SIGN_BACK);
      }
      ctx.fillStyle = view.colours.outline;
      ctx.fill(back);
      const light = lighterOf(view.colours.canvas, view.colours.text || view.colours.canvas);
      text.draw(ctx, { ...view, colours: { ...view.colours, canvas: view.colours.outline, text: light } });
    },
  };
}

// ---------- small builders for the step panels (they take the h of the kit, no DOM access here) ----------

// numsBlock(h, id, items) is a compact list of labelled numbers: items [[key, label, value], ...] (null entries are
// skipped). Each value sits in an element with data-key, for the checks.
export function numsBlock(h, id, items) {
  return h(
    "dl",
    { class: "lab-nums", id },
    items.filter(Boolean).map(([key, label, value]) => h("div", { class: "lab-num", dataset: { key } }, h("dt", null, label), h("dd", null, String(value)))),
  );
}
