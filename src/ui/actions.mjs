// The actions that send a region shown on the site to a page (open it in the Explorer, edit its shape, show its
// construction on the Algorithm page, called "the Lab" in the code) and the selection of the site that the Edit page
// and the Algorithm page open. One function and one condition per action, used by the Explorer's region chip, the
// Gallery's cards, the header's entries Edit and Algorithm and the shape editor (their buttons carry the page icons of
// widgets/icons.mjs). Also the addresses of the pages that hold a region (explorerHref, explorerTokenHref, labHref,
// labTokenHref, labActionHref) and the token in a pasted link (tokenInLink). No DOM access here.
//
// The selection (store key selection): the region selected last, { shape, seed, colour, token, home, stamp }, a
// complete region of the Explorer (found by a click, or opened from a link, a token, a name or a file) or the region of
// a Gallery card whose pencil or flask was used. Every visit starts with the home cell's region as the selection
// (appState of router.mjs), as the Explorer's default state selects it. home tells whether its seed cell is the home cell (isHomeCell). stamp
// grows by one with every new selection. Clearing the selection in the Explorer keeps it. The editor's drawing and the
// Lab's input carry the stamp of the selection they came from (editor.stamp, lab.stamp), and the Edit page and the Lab
// take the selection when it is newer (isNewer).
//
// The home cell: the Explorer's default state selects the cell (HOME_VIEW.x, HOME_VIEW.d). While that cell is the
// selection, every action that opens the Algorithm page for it opens HOME_CELL_EXAMPLE instead (the action
// { example } of regionActions, enabled whatever the cell's own region is).

import { labInputOf } from "./editor/editor_state.mjs";
import { buildHash } from "./router.mjs";
import { EXPLORE_PATH, EDIT_PATH, LAB_PATH, LAB_ALIAS, HOME_VIEW, SHAPES_QUERY } from "./routes.mjs";
import { shapeProblem } from "../construct/row_limit.mjs";
import { compareCells } from "../core/geometry.mjs";
import { tokenInText } from "../formats/token.mjs";

// The one rule that refuses a shape before a run (src/construct/row_limit.mjs): a row of the shape longer than the
// row limit, reason ROW_TOO_LONG.
export { ROW_TOO_LONG, longestRow, shapeProblem } from "../construct/row_limit.mjs";
// The reason of the edit and Lab actions of a region found in the grid whose flood fill did not end complete
// (infinite, larger than the cap, stopped or failed), when the subject gives no reason of its own.
export const NOT_COMPLETE = "Region not complete";

// explorerHref(query) is the Explorer's address of a view or of a shipped witness: "#/explore" with the query (x, d,
// z, sel, or w with z and at), the bare "#/explore" for null.
export function explorerHref(query = null) {
  return buildHash(EXPLORE_PATH, query);
}

// explorerTokenHref(token, query) is the Explorer's address of a token: "#/w/<token>", with the query of its view
// (z, at) when given.
export function explorerTokenHref(token, query = null) {
  return buildHash(`#/w/${token}`, query);
}

// labHref(query) is the address of the Algorithm page: "#/algorithm" with the query (preset, genus, colour, mode), the
// bare "#/algorithm" for null.
export function labHref(query = null) {
  return buildHash(LAB_PATH, query);
}

// labTokenHref(token) is the address of the Algorithm page replaying a token: "#/algorithm/w/<token>".
export function labTokenHref(token) {
  return buildHash(`${LAB_PATH}/w/${token}`);
}

// The example the Algorithm page shows for the home cell: the member S_1 of the family S_g^{+-1} (6 cells, genus 1) in
// region type +1, the Lab's preset s1 in green (the same shape, seed and type as the Gallery's card of genus 1 of that
// family in type +1).
export const HOME_CELL_EXAMPLE = Object.freeze({ preset: "s1", colour: "green" });

// isHomeCell(region) is true when the seed cell of a region is the home cell (HOME_VIEW.x, HOME_VIEW.d): region.at is
// the point [x, d] (bigints) of its offset (0, 0) and region.seed the offset of its seed (default [0, 0]). A region
// without at is not the home cell. A selection keeps the answer in its field home, which is read when present.
export function isHomeCell(region) {
  const r = region || {};
  if (typeof r.home === "boolean") return r.home;
  const at = r.at;
  if (!Array.isArray(at) || typeof at[0] !== "bigint" || typeof at[1] !== "bigint") return false;
  const [i, j] = Array.isArray(r.seed) ? r.seed : [0, 0];
  return at[0] + BigInt(i) === HOME_VIEW.x && at[1] + BigInt(j) === HOME_VIEW.d;
}

// labActionHref(act) is the address of the Algorithm page for a Lab action of regionActions: the example's address
// for { example }, the replay of { token }, else the bare "#/algorithm" (the Lab runs its input).
export function labActionHref(act) {
  if (act && act.example) return labHref(act.example);
  return act && act.token ? labTokenHref(act.token) : labHref();
}

// The token inside a link of a page of the site: #/w/<token>, #/algorithm/w/<token> or the old #/lab/w/<token>.
const LINK_TOKEN = new RegExp(`#/(?:${LAB_PATH.slice(2)}/|${LAB_ALIAS.slice(2)}/)?w/([A-Za-z0-9_-]+)`);

// tokenInLink(text) is the token in a pasted text: the token of a link of a page of the site that holds one
// (LINK_TOKEN), else tokenInText of the token format (a bare token), else null. It does not open the token.
export function tokenInLink(text) {
  const m = LINK_TOKEN.exec(String(text || ""));
  return m ? m[1] : tokenInText(text);
}

// regionActions(subject) tells which actions a shown region offers, as { edit, lab, labWhy, editWhy } (edit and lab
// null when not offered, labWhy and editWhy the reason when the action is not offered for a region that has one, else
// null).
// subject: { kind: "region" (found in the grid by a flood fill) | "witness" (opened from a token, a link or a file),
// complete (the flood fill of a region ended, for a witness always true), why (for a region that is not complete: the
// short reason, or null for NOT_COMPLETE), cells (offsets), seed (offset of the seed cell, null for none), colour (1,
// -1 or 0), token (of a witness, or null), at (optional, see isHomeCell) }.
//   edit  { cells, seed, colour }: a complete region or any witness with cells.
//   lab   { example: HOME_CELL_EXAMPLE } when the seed cell is the home cell (isHomeCell, before every other test),
//         { token } for a witness with a token (the Lab replays it), { cells, seed, colour } for a witness without
//         token or a complete region of the grid when shapeProblem accepts its shape (the Lab builds it live), else
//         null (labWhy says why: ROW_TOO_LONG).
//   A region of the grid that is not complete offers neither, both with the reason why (else NOT_COMPLETE), except the
//   Lab's example of the home cell.
export function regionActions(subject) {
  const acts = shapeActions(subject);
  return isHomeCell(subject) ? { ...acts, lab: { example: HOME_CELL_EXAMPLE }, labWhy: null } : acts;
}

// shapeActions(subject) is regionActions without the home cell's example.
function shapeActions(subject) {
  const s = subject || {};
  const has = Array.isArray(s.cells) && s.cells.length > 0;
  const shape = { cells: s.cells, seed: Array.isArray(s.seed) ? s.seed : null, colour: [1, -1, 0].includes(s.colour) ? s.colour : 1 };
  const none = { edit: null, lab: null, labWhy: null, editWhy: null };
  const live = () => {
    const why = shapeProblem(s.cells, shape.colour);
    return { edit: shape, lab: why ? null : shape, labWhy: why, editWhy: null };
  };
  if (s.kind === "witness") {
    if (s.token) return { edit: has ? shape : null, lab: { token: s.token }, labWhy: null, editWhy: null };
    return has ? live() : none;
  }
  if (s.kind === "region" && s.complete === true && has) return live();
  if (s.kind === "region") {
    const why = typeof s.why === "string" && s.why ? s.why : NOT_COMPLETE;
    return { ...none, labWhy: why, editWhy: why };
  }
  return none;
}

// ---------- the selection ----------

// sameShape(a, b) is true when the two lists of cells hold the same cells (any order).
export function sameShape(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  if (a === b) return true;
  const x = a.map(([i, j]) => [i, j]).sort(compareCells);
  const y = b.map(([i, j]) => [i, j]).sort(compareCells);
  return x.every((c, k) => c[0] === y[k][0] && c[1] === y[k][1]);
}

const sameSeed = (a, b) => (Array.isArray(a) ? Array.isArray(b) && a[0] === b[0] && a[1] === b[1] : !Array.isArray(b));

// sameRegion(a, b): two regions { shape, seed, colour, token } with the same cells, seed, type and token
const sameRegion = (a, b) => a.colour === b.colour && (a.token || null) === (b.token || null) && sameSeed(a.seed, b.seed) && sameShape(a.shape, b.shape);

// isNewer(selection, stamp) is true when there is a selection and it was made after the one of stamp (0 or absent:
// none).
export function isNewer(selection, stamp) {
  return !!selection && selection.stamp > (Number.isInteger(stamp) ? stamp : 0);
}

// selectRegion(store, subject) makes the region of subject (in the terms of regionActions) the selection when it
// offers the edit action: with a new stamp, unless it is the selection already (the same cells, seed, type and token,
// then only its list of cells and its field home are the new ones). Returns the selection (null when there is none).
export function selectRegion(store, subject) {
  const edit = regionActions(subject).edit;
  const old = store.get().selection || null;
  if (!edit) return old;
  const next = { shape: edit.cells, seed: edit.seed, colour: edit.colour, token: subject.token || null, home: isHomeCell(subject) };
  if (old && sameRegion(old, next)) {
    if (old.shape !== next.shape || old.home !== next.home) store.set({ selection: { shape: next.shape, home: next.home } });
  } else {
    store.set({ selection: { ...next, stamp: (old ? old.stamp : 0) + 1 } });
  }
  return store.get().selection;
}

// selectionLab(selection) is the Lab action of the selection: the one the Explorer's chip or the Gallery's card that
// selected it offers (regionActions), null when shapeProblem refuses the shape.
function selectionLab(sel) {
  return regionActions({ kind: "witness", complete: true, cells: sel.shape, seed: sel.seed, colour: sel.colour, token: sel.token, home: sel.home === true }).lab;
}

// ownInput(store) is true when the Lab has an input of its own that came after the selection was made: lab.input
// with the selection's stamp (a drawing sent by the editor's flask, or built by its eye, while that selection stood).
function ownInput(store) {
  const { selection: sel, lab } = store.get();
  return !!sel && !!lab && !!lab.input && lab.stamp === sel.stamp;
}

// takeForLab(store) is the Lab action of the selection: while the selection is the home cell, the example of the home
// cell, unless the Lab has an input of its own since that selection (ownInput: then null, the Lab runs that input),
// the Lab's input left as it is. Else, when the selection is newer than the Lab's input and the Lab can run it, the
// selection becomes that input: a shape becomes lab.input (labInputOf), a token clears it (the token is replayed),
// and lab.stamp becomes the selection's. Returns the Lab action ({ example }, { token } or the shape), or null.
function takeForLab(store) {
  const { selection: sel, lab } = store.get();
  if (sel && sel.home === true) return ownInput(store) ? null : selectionLab(sel);
  if (!isNewer(sel, lab && lab.stamp)) return null;
  const act = selectionLab(sel);
  if (!act) return null;
  store.set({ lab: { input: act.token ? null : labInputOf(act), stamp: sel.stamp } });
  return act;
}

// ---------- the actions ----------

// openInEditor({ store, navigate }, subject) opens the Edit page: the region of subject (in the terms of
// regionActions), when given, first becomes the selection. The page takes the selection when it is newer than its
// drawing (startOf of pages/edit.mjs). The Explorer's chip and a Gallery card give their region, the header's entry
// Edit none.
export function openInEditor({ store, navigate }, subject = null) {
  if (subject) selectRegion(store, subject);
  navigate(EDIT_PATH);
}

// openInLab({ store, navigate }, subject) opens the Algorithm page: the region of subject, when given, first becomes
// the selection, and the selection's Lab action is taken (takeForLab). The home cell (of subject, or the selection)
// opens HOME_CELL_EXAMPLE, a token so taken is replayed (#/algorithm/w/<token>), anything else opens #/algorithm,
// which runs the Lab's input (labParams). The Explorer's chip and a Gallery card give their region, the header's entry
// Algorithm none.
export function openInLab({ store, navigate }, subject = null) {
  if (subject) selectRegion(store, subject);
  const own = subject ? regionActions(subject).lab : null;
  navigate(labActionHref(own && own.example ? own : takeForLab(store)));
}

// labParams(store, params, query) is the route parameters the Lab reads its input from. An address with a token, a
// genus, a preset or the list of shapes (SHAPES_QUERY) keeps its own and takes nothing. Else a newer selection is
// taken first (takeForLab): the example of the home cell is { example } (the Lab shows it when nothing else gives an
// input, startPlanOf of pages/lab/model.mjs), and the selection's token is the input while no shape has come since it
// was taken ({ token }).
export function labParams(store, params = {}, query = {}) {
  if (params.token || query.genus !== undefined || query.preset !== undefined || query[SHAPES_QUERY] !== undefined) return params;
  const act = takeForLab(store);
  if (act && act.example) return { example: act.example };
  const { selection: sel, lab } = store.get();
  return sel && sel.token && lab && lab.stamp === sel.stamp && !lab.input ? { token: sel.token } : params;
}

// sendToLab({ store, navigate }, drawing) opens the Algorithm page on the editor's drawing { cells, seed, colour }: it
// becomes the Lab's input with the stamp of the present selection, so that the header's Algorithm keeps it until a new
// region is selected. A drawing that is still the selection of the home cell (taken from it, editor.stamp, with its
// cells, seed and type) opens HOME_CELL_EXAMPLE as the other actions of the home cell do.
export function sendToLab({ store, navigate }, drawing) {
  const { selection: sel, editor } = store.get();
  if (sel && sel.home === true && editor && editor.stamp === sel.stamp && sameRegion(sel, { shape: drawing.cells, seed: drawing.seed, colour: drawing.colour, token: sel.token })) {
    navigate(labActionHref(selectionLab(sel)));
    return;
  }
  inputForLab(store, drawing);
  navigate(labHref());
}

// inputForLab(store, drawing) makes the drawing { cells, seed, colour } the Lab's input with the stamp of the present
// selection (sendToLab, and the editor's Build).
export function inputForLab(store, drawing) {
  const sel = store.get().selection;
  store.set({ lab: { input: labInputOf(drawing), stamp: sel ? sel.stamp : 0 } });
}
