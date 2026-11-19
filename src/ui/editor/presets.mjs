// The start shapes of the editor: the presets of the Construction Lab (LAB_PRESETS of lab/model.mjs, one table for
// both pages): the shapes of type +-1 and of type 0 (g = 1 .. 10) from the core, and the shipped shapes of
// data/shapes/.

import { CodedError } from "../../core/bigint_utils.mjs";
import { loadJson } from "../dom.mjs";
import { LAB_PRESETS, presetShape, shapeUrl } from "../pages/lab/model.mjs";

// The list of presets [{ name, label, short, shortTex }] in menu order (the order of the Lab's presets): s1 .. s10,
// z1 .. z10, c10, c100, g0hex, maxhex, g0star. label is the full description and short the menu text, both in plain
// words (for a tooltip), shortTex the menu text with the family name as a $...$ formula (typeset by the menu).
export const PRESETS = Object.freeze(LAB_PRESETS.map((p) => Object.freeze({ name: p.name, label: p.title, short: p.short, shortTex: p.shortTex })));

const presetOf = (name) => LAB_PRESETS.find((p) => p.name === String(name)) || null;

// presetSync(name) returns { cells, seed } of the presets s1 .. s10 and z1 .. z10 (computed, no fetch), or null for
// another name.
export function presetSync(name) {
  const p = presetOf(name);
  const s = p ? presetShape(p) : null;
  return s ? { cells: s.shape, seed: s.seed } : null;
}

// presetFile(name) is the file name in data/shapes/ of a shipped preset, or null.
export function presetFile(name) {
  const p = presetOf(name);
  return p ? p.file : null;
}

// loadPreset(name) resolves with { cells, seed } of any preset of PRESETS. Throws "unknown_preset", or the codes of
// loadJson for a shipped file that cannot be fetched.
export async function loadPreset(name) {
  const s = presetSync(name);
  if (s) return s;
  const file = presetFile(name);
  if (!file) throw new CodedError("unknown_preset", `no preset named ${JSON.stringify(name)}`);
  const obj = await loadJson(shapeUrl(file));
  if (!Array.isArray(obj.shape) || !Array.isArray(obj.seed)) throw new CodedError("bad_format", `${file} has no shape and seed`);
  return { cells: obj.shape, seed: obj.seed };
}
