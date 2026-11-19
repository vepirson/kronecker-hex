// The state of the shape editor, without any DOM: a set of cells (integer offsets around the editor's own origin), a
// seed cell, a colour (1 green, -1 red or 0 blue), and an undo and a redo history of strokes. Also the live analysis
// of a shape and the object the editor hands on (the Lab input).
//
// Draw rule: the first cell of a stroke decides what the stroke does. When it is empty the stroke adds cells, when it
// belongs to the shape the stroke removes cells, and every later cell of the same stroke gets the same change.
//
// Seed rule: the seed is the first cell of the shape in the cell order (smallest j, then smallest i). A loaded shape
// keeps the seed it carries (when that is one of its cells) until the shape is edited.

import { CodedError } from "../../core/bigint_utils.mjs";
import { cellKey, keyToCell, compareCells, sortCells, neighbourhood } from "../../core/geometry.mjs";
import { genusOfCells, holeCount, isConnected } from "../../core/regions.mjs";
import { residueTest } from "../../core/admissible.mjs";
import { fieldsOf, labInputRecord } from "../pages/lab/model.mjs";
import { longestRow, rowProblem } from "../../construct/row_limit.mjs";

// Largest |i| and |j| of an editor cell (the limit of the shapes the site accepts is 2^20).
export const EDITOR_LIMIT = 1048575;
// Number of strokes kept for undo.
export const UNDO_DEPTH = 500;
// The colours the editor builds, in the order of its colour menu: green, red, blue.
export const COLOURS = Object.freeze([1, -1, 0]);

const isCell = (c) => Array.isArray(c) && c.length === 2 && Number.isInteger(c[0]) && Number.isInteger(c[1]);
const inRange = (i, j) => Math.abs(i) <= EDITOR_LIMIT && Math.abs(j) <= EDITOR_LIMIT;

// firstCell(cells) is the first cell of a list in the cell order (by j, then i), or null for an empty list.
export function firstCell(cells) {
  let best = null;
  for (const c of cells) if (best === null || compareCells(c, best) < 0) best = c;
  return best === null ? null : [best[0], best[1]];
}

// repairSeed(cells, seed) returns seed when it is a cell of the list, else the first cell of the list in the cell
// order, or null when the list is empty.
export function repairSeed(cells, seed) {
  if (isCell(seed) && cells.some(([i, j]) => i === seed[0] && j === seed[1])) return [seed[0], seed[1]];
  return firstCell(cells);
}

// A closed stroke of the history: { added, removed (lists of cellKey numbers), seedBefore, seedAfter }, and
// colourBefore, colourAfter for a stroke that also changed the colour (replace).
const isStroke = (s) => !!s && Array.isArray(s.added) && Array.isArray(s.removed) && s.added.every(Number.isSafeInteger) && s.removed.every(Number.isSafeInteger)
  && (s.colourAfter === undefined || (COLOURS.includes(s.colourBefore) && COLOURS.includes(s.colourAfter)));

// createEditorState({ cells, seed, colour }) returns the editor state. Methods:
//   cells() sorted copy, size, has(i, j), seed (getter), colour (getter), snapshot() { cells, seed, colour },
//   begin() opens a stroke, end() closes it (one undo step, nothing recorded when the stroke changed nothing),
//   abort() takes back every change of the open stroke and records nothing,
//   draw(i, j) applies the draw rule to one cell (inside a stroke the stroke's first cell decides between adding and
//   removing, outside a stroke the call is a stroke of its own that adds an empty cell or removes a cell of the
//   shape) and returns true when the shape changed,
//   setColour(c) (1, -1 or 0, not undoable), load({ cells, seed, colour, undo, redo }) replaces everything (the
//   history by the given lists of history(), else empty), clear() empties the shape (undoable), editCells({ remove,
//   add }) removes and adds the listed cells as one stroke (one undo step, the cells are checked before anything
//   changes) and returns true when the shape changed, replace({ cells, seed, colour }) makes the shape, its seed and
//   its colour the given ones as one stroke (one undo step, which also takes the colour back; the cells are checked
//   before anything changes) and returns true when anything changed,
//   undo() reverts the last stroke and redo() applies the last undone stroke again (each returns true when there was
//   one), canUndo(), canRedo(), history() { undo, redo } (lists of closed strokes, plain numbers, for the store), and
//   version (a counter raised by every change). A new stroke clears the redo list.
// Throws "bad_format" for a cell that is not an integer pair and "out_of_range" beyond EDITOR_LIMIT.
export function createEditorState({ cells = [], seed = null, colour = 1 } = {}) {
  let set = new Map();
  let sd = null;
  let col = 1;
  let history = [];
  let future = [];
  let stroke = null;
  let version = 0;

  const check = (i, j) => {
    if (!Number.isInteger(i) || !Number.isInteger(j)) throw new CodedError("bad_format", "A cell is an integer pair.");
    if (!inRange(i, j)) throw new CodedError("out_of_range", `The cell (${i}, ${j}) is outside |i|, |j| <= ${EDITOR_LIMIT}.`);
  };
  const setColourValue = (c) => {
    if (!COLOURS.includes(c)) throw new CodedError("bad_format", "The region type is 1, -1 or 0.");
    col = c;
  };
  const repair = () => {
    if (sd !== null && set.has(cellKey(sd[0], sd[1]))) return;
    sd = firstCell(set.values());
  };
  const loadCells = (list, s) => {
    if (!Array.isArray(list)) throw new CodedError("bad_format", "The cells are a list of integer pairs.");
    const m = new Map();
    for (const c of list) {
      if (!isCell(c)) throw new CodedError("bad_format", "A cell is an integer pair.");
      check(c[0], c[1]);
      m.set(cellKey(c[0], c[1]), [c[0], c[1]]);
    }
    set = m;
    sd = isCell(s) ? [s[0], s[1]] : null;
    repair();
  };

  const copySeed = (s) => (s ? [s[0], s[1]] : null);
  // An open stroke records the keys it added and removed, the seed and the colour before it and its mode ("add",
  // "remove", or null before its first cell).
  const open = () => ({ added: new Set(), removed: new Set(), seedBefore: copySeed(sd), colourBefore: col, mode: null });
  const record = (k, adding) => {
    const st = stroke;
    if (adding) {
      if (st.removed.has(k)) st.removed.delete(k);
      else st.added.add(k);
    } else if (st.added.has(k)) st.added.delete(k);
    else st.removed.add(k);
  };
  const sameSeed = (a, b) => (a === null ? b === null : b !== null && a[0] === b[0] && a[1] === b[1]);
  const push = (st) => {
    const recoloured = st.colourBefore !== col;
    if (st.added.size === 0 && st.removed.size === 0 && sameSeed(st.seedBefore, sd) && !recoloured) return;
    const colours = recoloured ? { colourBefore: st.colourBefore, colourAfter: col } : {};
    history.push(Object.freeze({ added: [...st.added], removed: [...st.removed], seedBefore: st.seedBefore, seedAfter: copySeed(sd), ...colours }));
    if (history.length > UNDO_DEPTH) history = history.slice(history.length - UNDO_DEPTH);
    future = [];
  };
  const withStroke = (fn) => {
    if (stroke) return fn();
    stroke = open();
    try {
      return fn();
    } finally {
      const st = stroke;
      stroke = null;
      push(st);
    }
  };
  // an edit moves the seed to the first cell of the shape (seed rule)
  const change = (k, cell, adding) => {
    if (adding) set.set(k, cell);
    else set.delete(k);
    record(k, adding);
    sd = firstCell(set.values());
    version++;
  };
  // apply(st, forward) applies a closed stroke (forward) or takes it back
  const apply = (st, forward) => {
    for (const k of forward ? st.removed : st.added) set.delete(k);
    for (const k of forward ? st.added : st.removed) set.set(k, keyToCell(k));
    sd = copySeed(forward ? st.seedAfter : st.seedBefore);
    repair();
    if (st.colourAfter !== undefined) col = forward ? st.colourAfter : st.colourBefore;
    version++;
  };

  loadCells(cells, seed);
  setColourValue(colour);

  const api = {
    cells() {
      return sortCells([...set.values()].map(([i, j]) => [i, j]));
    },
    get size() {
      return set.size;
    },
    has(i, j) {
      return set.has(cellKey(i, j));
    },
    get seed() {
      return sd ? [sd[0], sd[1]] : null;
    },
    get colour() {
      return col;
    },
    get version() {
      return version;
    },
    snapshot() {
      return { cells: api.cells(), seed: api.seed, colour: col };
    },
    begin() {
      if (!stroke) stroke = open();
    },
    end() {
      if (!stroke) return;
      const st = stroke;
      stroke = null;
      push(st);
    },
    abort() {
      if (!stroke) return;
      const st = stroke;
      stroke = null;
      for (const k of st.added) set.delete(k);
      for (const k of st.removed) set.set(k, keyToCell(k));
      sd = st.seedBefore;
      version++;
    },
    draw(i, j) {
      return withStroke(() => {
        check(i, j);
        const k = cellKey(i, j);
        if (stroke.mode === null) stroke.mode = set.has(k) ? "remove" : "add";
        const adding = stroke.mode === "add";
        if (adding === set.has(k)) return false;
        change(k, [i, j], adding);
        return true;
      });
    },
    setColour(c) {
      setColourValue(c);
      version++;
    },
    load({ cells: list = [], seed: s = null, colour: c = col, undo: u = [], redo: r = [] } = {}) {
      stroke = null;
      loadCells(list, s);
      setColourValue(c);
      const ok = Array.isArray(u) && Array.isArray(r) && u.every(isStroke) && r.every(isStroke);
      history = ok ? u.slice(-UNDO_DEPTH) : [];
      future = ok ? r.slice(-UNDO_DEPTH) : [];
      version++;
    },
    editCells({ remove = [], add = [] } = {}) {
      if (!Array.isArray(remove) || !Array.isArray(add) || !remove.every(isCell) || !add.every(isCell)) throw new CodedError("bad_format", "A cell is an integer pair.");
      for (const [i, j] of add) check(i, j);
      if (stroke) api.end();
      let changed = false;
      withStroke(() => {
        for (const [i, j] of remove) {
          const k = cellKey(i, j);
          if (set.has(k)) {
            change(k, null, false);
            changed = true;
          }
        }
        for (const [i, j] of add) {
          const k = cellKey(i, j);
          if (!set.has(k)) {
            change(k, [i, j], true);
            changed = true;
          }
        }
      });
      return changed;
    },
    replace({ cells: list, seed: s = null, colour: c = col } = {}) {
      if (!Array.isArray(list) || !list.every(isCell)) throw new CodedError("bad_format", "A cell is an integer pair.");
      for (const [i, j] of list) check(i, j);
      if (!COLOURS.includes(c)) throw new CodedError("bad_format", "The region type is 1, -1 or 0.");
      if (stroke) api.end();
      const want = new Map(list.map(([i, j]) => [cellKey(i, j), [i, j]]));
      const before = { seed: copySeed(sd), colour: col, version };
      withStroke(() => {
        for (const k of [...set.keys()]) if (!want.has(k)) change(k, null, false);
        for (const [k, cell] of want) if (!set.has(k)) change(k, cell, true);
        sd = repairSeed([...want.values()], s);
        col = c;
      });
      const changed = version !== before.version || !sameSeed(before.seed, sd) || before.colour !== col;
      if (changed && version === before.version) version++;
      return changed;
    },
    clear() {
      if (set.size === 0) return false;
      withStroke(() => {
        for (const k of [...set.keys()]) change(k, null, false);
      });
      return true;
    },
    canUndo() {
      return history.length > 0;
    },
    canRedo() {
      return future.length > 0;
    },
    undo() {
      if (stroke) api.end();
      const st = history.pop();
      if (!st) return false;
      apply(st, false);
      future.push(st);
      return true;
    },
    redo() {
      if (stroke) api.end();
      const st = future.pop();
      if (!st) return false;
      apply(st, true);
      history.push(st);
      return true;
    },
    history() {
      return { undo: history.slice(), redo: future.slice() };
    },
  };
  return api;
}

function summarise(records) {
  const failures = records.filter((r) => r.missed === null);
  return { records, admissible: failures.length === 0, failures };
}

// analyseShape(cells) is the live analysis of a cell list: { area, empty, connected, chi, genus (1 - chi, null when
// empty), holes (bounded components of the complement, null when empty or too large), residue, ring } where residue
// and ring are { records (residueTest), admissible, failures (the records without a missed class) } of the shape and
// of its neighbour ring N(S) (the condition for a blue region), ringSize = |N(S)| and rowMax, the number of cells of
// its longest row (longestRow of src/construct/row_limit.mjs).
export function analyseShape(cells) {
  const area = cells.length;
  if (area === 0) {
    const none = { records: [], admissible: true, failures: [] };
    return { area: 0, empty: true, connected: false, chi: 0, genus: null, holes: null, residue: none, ring: none, ringSize: 0, rowMax: 0 };
  }
  const g = genusOfCells(cells);
  let holes = null;
  try {
    holes = holeCount(cells);
  } catch {
    holes = null;
  }
  const ring = neighbourhood(cells);
  return {
    area,
    empty: false,
    connected: isConnected(cells),
    chi: g.chi,
    genus: g.genus,
    holes,
    residue: summarise(residueTest(cells)),
    ring: summarise(residueTest(ring)),
    ringSize: ring.length,
    rowMax: longestRow(cells).n,
  };
}

// colourCheckOf(analysis, colour) is the residue test that decides a colour: the part of the analysis that its kind
// tests (analysisPart of the Lab's kind fields: the shape's own test analysis.residue for green and red, the one of
// its neighbour ring analysis.ring for blue).
export function colourCheckOf(analysis, colour) {
  return analysis[fieldsOf({ colour }).analysisPart];
}

// canSendToLab(analysis, colour) is true when the shape is non-empty, connected, passes the residue test of the colour
// (default 1: the shape itself for 1 and -1, its neighbour ring N(S) for 0) and the one rule of a shape refused before
// a run (rowProblem of src/construct/row_limit.mjs: no row longer than the row limit for 1 and -1).
export function canSendToLab(analysis, colour = 1) {
  return !!analysis && !analysis.empty && analysis.connected && colourCheckOf(analysis, colour).admissible && rowProblem(analysis.rowMax, colour) === null;
}

// labInputOf({ cells, seed, colour }) is the input object the Lab reads, numbers only (the Lab's input record of the
// kind): { shape (sorted copy), seed, colour, lift: 1, id: null } for green and red, { shape, seed, colour: 0, id:
// null } for blue (no lift). Throws "empty_shape", "seed_not_in_shape" or "bad_format".
export function labInputOf({ cells, seed, colour }) {
  if (!Array.isArray(cells) || cells.length === 0) throw new CodedError("empty_shape", "The shape is empty.");
  if (!COLOURS.includes(colour)) throw new CodedError("bad_format", "The region type is 1, -1 or 0.");
  const shape = sortCells(cells.map(([i, j]) => [i, j]));
  if (!isCell(seed) || !shape.some(([i, j]) => i === seed[0] && j === seed[1])) throw new CodedError("seed_not_in_shape", "The start cell is not a cell of the shape.");
  return labInputRecord({ shape, seed, colour, lift: 1, id: null });
}

// cellsText(n) is a number of cells in words: "1 cell", "0 cells", "541 cells".
export function cellsText(n) {
  return `${n} ${n === 1 ? "cell" : "cells"}`;
}
