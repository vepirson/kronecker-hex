// The pure parts of the Gallery page: the table of its sections (SECTIONS, the one description of each family and of
// each list of cards), the cards of a section for a page and a region type, reading data/gallery.json, card captions,
// card links, the construction inputs of a family card, the symmetry order of a shape, and the fitting of a region into a square card. No DOM access here (the Node tests import this module).

import { CodedError, parseBigIntStrict } from "../../core/bigint_utils.mjs";
import { shapeS, seedS, shapeZ, seedZ, hexDisc } from "../../core/shapes.mjs";
import { shapeC, seedC } from "../../core/shapes_compact.mjs";
import { cellKey, compareCells } from "../../core/geometry.mjs";
import { fittedWindow, nearestCell, planeOf, boundsExtents } from "../../render/hex_canvas.mjs";
import { kronecker } from "../../core/kronecker.mjs";
import { polygonCells } from "../../core/polygon.mjs";
import { pagesOf } from "../widgets/pager.mjs";
import { explorerHref, explorerTokenHref } from "../actions.mjs";
import { cellsText } from "../editor/editor_state.mjs";

// The format name of data/gallery.json.
export const GALLERY_FORMAT = "gallery_v2";
// Card kinds. family: a member of a family of SECTIONS in the type of its section's switch, { kind, section, member,
// colour } (built in the browser on the first page, else opened from its stored token).
// token, witness, natural: a card of data/gallery.json (see checkGallery).
// square: a term of a section of kind "squares", { kind, section, n, r, s, text } (squareCard).
export const KINDS = Object.freeze(["family", "token", "witness", "natural", "square"]);
// Cards per page of a family section.
export const PAGE_SIZE = 5;
// Cards per page of a card section with pages (the section found: 3 rows of 5 on a wide screen), its pages counted per
// region type from its cards.
export const CARD_PAGE_SIZE = 15;
// The first page of every family is built in the browser, the members of the pages from this index on come from stored
// tokens (FAMILY_TOKENS_FILE, written by tools/build_family_tokens.mjs).
export const FIRST_STORED_PAGE = 1;
// The stored tokens of the family cards and their format name.
export const FAMILY_TOKENS_FILE = "data/family_tokens_v2.json";
export const FAMILY_TOKENS_FORMAT = "family_tokens_v2";
// Flood fill cap of a natural region.
export const NATURAL_CAP = 200000;
// Padding of a card picture, in hexes.
export const CARD_PAD = 1;
// Below this many pixels per cell a card shows a part of the region (around its middle) at CROP_CELL pixels.
export const MIN_CELL = 1.5;
export const CROP_CELL = 4;
// Largest cell size of a card picture.
export const MAX_CELL = 44;

// The terms of OEIS A052157 shown by the section of kind "squares": a(n) is the least r such that some s with
// 0 <= s < r has gcd(r - i, s - j) > 1 for all 0 <= i, j < n. In the grid the cell (x, d) is of type 0 exactly when
// gcd(x, d) > 1, so the cells (r - i, s - j) of a term form an n x n square of type 0 (a rhombus of the grid with n
// cells on each side, (r, s) its corner of largest x and largest d). r = a(n) and an s of it, decimal strings. a(1) to
// a(4) are those of the OEIS, a(5) comes from an exhaustive search of every r up to 402063189178. Each card checks in
// the browser that its n^2 cells are of type 0 (squareFacts).
export const A052157_TERMS = Object.freeze([
  { n: 1, r: "2", s: "0" },
  { n: 2, r: "21", s: "15" },
  { n: 3, r: "1310", s: "1276" },
  { n: 4, r: "10199373", s: "7247646" },
  { n: 5, r: "131487690156", s: "37945747192" },
].map((t) => Object.freeze(t)));
// The link of the section's title: the word text of the title is a link to href.
export const A052157_LINK = Object.freeze({ text: "A052157", href: "https://oeis.org/A052157" });

// A family section: its name (tex, a formula without the $ signs), the generator of its shapes (shape(m), seed(m)) for
// its members m = from, from + step, ... to, what a member counts (param "genus" or "radius") with the genus of a member
// (genusOf), and the region types of its switch. The title is the name with the range.
function family(id, tex, { shape, seed, param = "genus", from = 1, to, step = 1, genusOf = (m) => m, colours }) {
  return Object.freeze({
    id, kind: "family", tex, shape, seed, param, from, to, step, genusOf, colours: Object.freeze(colours),
    title: `$${tex}$, ${param} ${from} to ${to}`,
  });
}

// The sections of the Gallery page, in page order, each with its title only. kind "cards": the cards of
// data/gallery.json under the key id, with a switch of region types when colours is a list (the cards of the chosen type
// are shown), in pages of pageSize cards when it has one (the pages of each type counted from its own cards: the
// section found has one card per shape up to the 12 symmetries of the grid and per type, written from the census of
// the square |x|, |d| <= 5000, smallest first, its pages counted from the cards of each type). kind "family": the members of a family (the first page built in the browser, the others from stored
// tokens), in pages of PAGE_SIZE, with a switch when colours has two entries. A title may hold a $...$ formula (typeset
// by the page). The family C_0^0 is the solid hexagon hexDisc(R) as a region of type 0: its ring of neighbours misses a
// class modulo 2 only for an even R, so its members are the even radii, one page of them (the cells grow fast). kind
// "squares": one card per term of its list terms (the n x n squares of A052157_TERMS, squareCard), one page, no
// switch, its title with the word link.text a link to link.href (the page makes that word an external link).
export const SECTIONS = Object.freeze([
  Object.freeze({ id: "featured", kind: "cards", title: "Featured", colours: null }),
  family("s", "S_{g}^{\\pm1}", { shape: shapeS, seed: seedS, to: 25, colours: [1, -1] }),
  family("s0", "S_{g}^{0}", { shape: shapeZ, seed: seedZ, to: 25, colours: [0] }),
  family("c", "C_{g}^{\\pm1}", { shape: shapeC, seed: seedC, to: 25, colours: [1, -1] }),
  family("c00", "C_{0}^{0}", { shape: hexDisc, seed: () => [0, 0], param: "radius", from: 2, to: 10, step: 2, genusOf: () => 0, colours: [0] }),
  Object.freeze({ id: "a052157", kind: "squares", title: "Smallest Rhombus, A052157", link: A052157_LINK, colours: null, terms: A052157_TERMS }),
  Object.freeze({ id: "found", kind: "cards", title: "Unique Symmetric with $|x|, |d| \\le 5000$", colours: Object.freeze([1, -1, 0]), pageSize: CARD_PAGE_SIZE }),
]);

// sectionById(id) is the entry of SECTIONS with that id (undefined for none).
export function sectionById(id) {
  return SECTIONS.find((s) => s.id === id);
}

// typeText(colour) is the name of a region type: "+1", "-1" or "0" (typeLabel of the editor's verdict).
export { typeLabel as typeText } from "../editor/verdict.mjs";

// familyShape(sectionId, m) is { shape, seed } of member m of a family section. Throws "bad_format" for an unknown
// family or a member outside its range.
export function familyShape(sectionId, m) {
  const f = sectionById(sectionId);
  if (!f || f.kind !== "family") throw new CodedError("bad_format", `no family ${JSON.stringify(sectionId)}`);
  if (!Number.isInteger(m) || m < f.from || m > f.to || (m - f.from) % f.step !== 0) {
    throw new CodedError("bad_format", `${f.param} ${m} is not a member of ${f.id}`);
  }
  return { shape: f.shape(m), seed: f.seed(m) };
}

// familyMembers(section) is the list of the members of a family section, in order.
export function familyMembers(section) {
  const out = [];
  for (let m = section.from; m <= section.to; m += section.step) out.push(m);
  return out;
}

// familyInput(card) is the construction input of a family card { section, member, colour } (lift 1 for the types +1
// and -1, a blue input has no lift). Throws "bad_colour" for a type its section does not build.
export function familyInput(card) {
  const f = sectionById(card.section);
  if (!f || !f.colours || !f.colours.includes(card.colour)) throw new CodedError("bad_colour", `the family ${card.section} has no region type ${card.colour}`);
  const { shape, seed } = familyShape(card.section, card.member);
  return card.colour === 0 ? { shape, seed, colour: 0, id: null } : { shape, seed, colour: card.colour, lift: 1, id: null };
}

// familyKey(card) is the key of a family card { section, member, colour } in the stored tokens and in the Gallery's
// memory: "<section>:<member>:<type>" with the type -1, 0 or 1.
export function familyKey(card) {
  return `${card.section}:${card.member}:${card.colour}`;
}

// the cards of data/gallery.json of a card section (only those of type colour when the section has a switch)
function typeCards(section, gallery, colour) {
  const cards = (gallery && gallery[section.id]) || [];
  return section.colours ? cards.filter((c) => c.colour === colour) : cards.slice();
}

// sectionPages(section, gallery, colour) is the list of pages of a section (pagesOf of the page widget): for a family
// its members cut into pages of PAGE_SIZE, for a card section with a pageSize the positions 1, 2, ... of its cards of
// type colour in data/gallery.json cut into pages of pageSize ([] when it has none), [] for another card section.
export function sectionPages(section, gallery = null, colour = null) {
  if (section.kind === "family") return pagesOf(section.from, section.to, PAGE_SIZE, section.step);
  if (!section.pageSize) return [];
  const n = typeCards(section, gallery, colour).length;
  return n > 0 ? pagesOf(1, n, section.pageSize) : [];
}

// storedMembers(section) is the list of the members of a family section that come from stored tokens: those of the
// pages from FIRST_STORED_PAGE on.
export function storedMembers(section) {
  const first = sectionPages(section)[FIRST_STORED_PAGE];
  return first ? familyMembers(section).filter((m) => m >= first.from) : [];
}

// pageName(section, page) is the tooltip and accessible name of a page button: for a family "Genus 6 to 10", "Radius
// 12 to 20" (or "Genus 7" for one member), for a card section "Shapes 26 to 50" (or "Shape 726" for one card).
export function pageName(section, page) {
  if (section.kind !== "family") return page.from === page.to ? `Shape ${page.from}` : `Shapes ${page.from} to ${page.to}`;
  const what = section.param.charAt(0).toUpperCase() + section.param.slice(1);
  return page.from === page.to ? `${what} ${page.from}` : `${what} ${page.from} to ${page.to}`;
}

// sectionCards(section, gallery, { page, colour }) is the list of cards shown by a section: for a family the members
// of page `page` in the type colour ({ kind: "family", section, member, colour }), for a card section its cards of
// data/gallery.json (only those of type colour when the section has a switch), those of page `page` when it has a
// pageSize. Throws "bad_format" for a page the section does not have (page 0 of a type without cards is empty).
export function sectionCards(section, gallery, { page = 0, colour = null } = {}) {
  if (section.kind === "squares") {
    if (page !== 0) throw new CodedError("bad_format", `the section ${section.id} has no page ${page}`);
    return section.terms.map((t) => squareCard(section.id, t));
  }
  if (section.kind === "family") {
    const p = sectionPages(section)[page];
    if (!p) throw new CodedError("bad_format", `the section ${section.id} has no page ${page}`);
    return familyMembers(section).filter((m) => m >= p.from && m <= p.to).map((member) => ({ kind: "family", section: section.id, member, colour }));
  }
  const cards = typeCards(section, gallery, colour);
  if (!section.pageSize) return cards;
  const p = sectionPages(section, gallery, colour)[page];
  if (!p) {
    if (page === 0 && cards.length === 0) return [];
    throw new CodedError("bad_format", `the section ${section.id} has no page ${page} of type ${colour}`);
  }
  return cards.slice(p.from - 1, p.to);
}

// sectionSlots(section, gallery) is the most cards a section shows at once (over its pages and types): its grid keeps
// that many places so that nothing moves when a page or a type changes.
export function sectionSlots(section, gallery) {
  if (section.kind === "family") return PAGE_SIZE;
  if (section.kind === "squares") return section.terms.length;
  const most = section.colours ? Math.max(0, ...section.colours.map((c) => typeCards(section, gallery, c).length)) : typeCards(section, gallery, null).length;
  return section.pageSize ? Math.min(section.pageSize, most) : most;
}

// statedOf(card) is the { genus, area } a card claims: for a family card the genus of its member and the number of
// cells of its shape, for a square card n^2 cells and no genus (null: it is not a region), for the other kinds the
// numbers written in the card.
export function statedOf(card) {
  if (card.kind === "family") {
    return { genus: sectionById(card.section).genusOf(card.member), area: familyShape(card.section, card.member).shape.length };
  }
  if (card.kind === "square") return { genus: null, area: card.n * card.n };
  return { genus: card.genus, area: card.area };
}

// cardRef(card) is the reference that identifies a card on the page: "token:<label>", "witness:<file>",
// "natural:<x>,<d>", "family:<section>:<member>" or "square:<section>:<n>".
export function cardRef(card) {
  switch (card.kind) {
    case "square":
      return `square:${card.section}:${card.n}`;
    case "token":
      return `token:${card.label}`;
    case "witness":
      return `witness:${card.file}`;
    case "natural":
      return `natural:${card.x},${card.d}`;
    case "family":
      return `family:${card.section}:${card.member}`;
    default:
      return `unknown:${card.kind}`;
  }
}

// cardHref(card, token) is the address a card opens: "#/w/<token>" for a token card (and for a family card once its
// token is known, else null), "#/explore?w=<file>" for a witness file, "#/explore?x=..&d=..&sel=0,0" for a natural
// region, squareHref for a square.
export function cardHref(card, token = null) {
  switch (card.kind) {
    case "square":
      return squareHref(card);
    case "family":
      return token ? explorerTokenHref(token) : null;
    case "token":
      if (!token) throw new CodedError("bad_format", "a token card needs its token text");
      return explorerTokenHref(token);
    case "witness":
      return `#/explore?w=${encodeURIComponent(card.file)}`;
    case "natural":
      return `#/explore?x=${card.x}&d=${card.d}&sel=0,0`;
    default:
      throw new CodedError("bad_format", `unknown card kind ${JSON.stringify(card.kind)}`);
  }
}

// captionParts(card, facts) returns the parts of the one caption line of a card from verified facts { genus, area,
// digits (decimal digits of x0), symmetry }: ["A cells", "genus G", "x N digits"] (cells first, as the Explorer's
// chip, "1 cell" for one), for a natural region the last part is "(x, d)", and a card that states its symmetry has
// "symmetry S" before it. A narrow card shows the first two parts only. A square card has its own two parts, in the
// one line of every card (its s is in the card's tooltip text, not in the caption): ["n x n", "a(n) = r"].
export function captionParts(card, facts) {
  if (card.kind === "square") return [`${card.n} x ${card.n}`, `a(${card.n}) = ${card.r}`];
  const parts = [cellsText(facts.area), `genus ${facts.genus}`];
  if (card.symmetry !== undefined) parts.push(`symmetry ${facts.symmetry}`);
  parts.push(card.kind === "natural" ? `(${card.x}, ${card.d})` : `x ${facts.digits} digits`);
  return parts;
}

// captionText(card, facts) is the caption line: the parts of captionParts joined by " | ".
export function captionText(card, facts) {
  return captionParts(card, facts).join(" | ");
}

// ---------- the squares of a section of kind "squares" ----------

// squareCard(section, term) is the card of a term { n, r, s } of the section: { kind: "square", section, n, r, s,
// text } (text: the tooltip and accessible description of the card, which cells form the square, with the value of s,
// which the caption leaves out).
export function squareCard(section, { n, r, s }) {
  return { kind: "square", section, n, r, s, text: `cells (a(${n}) - i, s - j) for 0 <= i, j < ${n}, s = ${s}` };
}

// squareCorners(n) is the corners of the n x n square as offsets from its corner (r, s): [0, 0], [-(n - 1), 0],
// [-(n - 1), -(n - 1)], [0, -(n - 1)], the one corner [0, 0] for n = 1 (the polygon of the Explorer's address part b).
export function squareCorners(n) {
  if (!Number.isInteger(n) || n < 1) throw new CodedError("bad_format", `a square has a side n >= 1, got ${n}`);
  const m = -(n - 1);
  return n === 1 ? [[0, 0]] : [[0, 0], [m, 0], [m, m], [0, m]];
}

// squareZoom(n) is the zoom (pixels per cell) of the Explorer's view of the n x n square, centred on its corner (r, s):
// 40 at most, and the square reaches at most about 150 pixels from the middle of the view on every side (n - 1/2
// cells), so that it fits a phone's screen.
export function squareZoom(n) {
  return Math.min(40, Math.floor(150 / Math.max(1, n - 0.5)));
}

// squareOf(card) is { x0, d0 (bigints: r and s), corners (squareCorners), cells (polygonCells of the corners: the
// offsets of the n^2 cells from (r, s)) } of a square card.
export function squareOf(card) {
  const x0 = parseBigIntStrict(String(card.r));
  const d0 = parseBigIntStrict(String(card.s));
  if (x0 === null || d0 === null) throw new CodedError("bad_format", "the r and s of a square are integers");
  const corners = squareCorners(card.n);
  return { x0, d0, corners, cells: polygonCells(corners) };
}

// squareHref(card) is the Explorer's address of a square card: its corner (r, s) in the middle at squareZoom(n), the
// square highlighted by the address part b (its corners as offsets from (r, s)): "#/explore?x=r&d=s&z=Z&b=0,0,...".
export function squareHref(card) {
  const b = squareCorners(card.n).map(([i, j]) => `${i},${j}`).join(",");
  return explorerHref({ x: String(card.r), d: String(card.s), z: String(squareZoom(card.n)), b });
}

// checkSquares(section) returns the list of problems (strings) of the terms of a section of kind "squares": a
// non-empty list, the terms n = 1, 2, 3, ... in order, r and s decimal strings with 0 <= s < r, and the polygon of
// each square holding exactly n^2 cells. (Whether the cells are of type 0 is squareFacts, the card's own check.) An
// empty list means well formed.
export function checkSquares(section) {
  const out = [];
  const terms = section && section.terms;
  if (!Array.isArray(terms) || terms.length === 0) return [`${section ? section.id : "?"}: no terms`];
  terms.forEach((t, k) => {
    const what = `${section.id} term ${k}`;
    if (t.n !== k + 1) out.push(`${what}: n is ${t.n}, expected ${k + 1}`);
    const r = typeof t.r === "string" ? parseBigIntStrict(t.r) : null;
    const s = typeof t.s === "string" ? parseBigIntStrict(t.s) : null;
    if (r === null || s === null || String(r) !== t.r || String(s) !== t.s) {
      out.push(`${what}: r and s must be decimal strings`);
      return;
    }
    if (!(s >= 0n && s < r)) out.push(`${what}: needs 0 <= s < r`);
    if (Number.isInteger(t.n) && t.n >= 1) {
      const cells = polygonCells(squareCorners(t.n));
      if (!cells || cells.length !== t.n * t.n) out.push(`${what}: the square does not hold n^2 cells`);
    }
  });
  return out;
}

// squareIsRegion(card, fill) is the rule of the pencil and the flask of a square card: true exactly when the flood
// fill of its corner (r, s) (fill: { complete, cells (offsets from (r, s)) }, the fill and cap of a region card of the
// grid) is complete AND its cells are exactly the n^2 cells of the square (the square is a whole region), else false.
export function squareIsRegion(card, fill) {
  if (!fill || fill.complete !== true || !Array.isArray(fill.cells)) return false;
  const { cells } = squareOf(card);
  if (!cells || fill.cells.length !== cells.length) return false;
  const keys = new Set(cells.map(([i, j]) => cellKey(i, j)));
  return fill.cells.every(([i, j]) => keys.has(cellKey(i, j)));
}

// squareSubject(card, fill) is the subject of the actions of a square card (in the terms of regionActions of
// src/ui/actions.mjs): the region of (r, s) when squareIsRegion (the pencil and the flask open it: it is the square),
// else { kind: "custom" } (both disabled with the reason NOT_A_REGION, "Not a region"). fill: { complete, cells, colour }
// or null (the fill failed).
export function squareSubject(card, fill) {
  if (squareIsRegion(card, fill)) return { kind: "region", complete: true, cells: fill.cells, seed: [0, 0], colour: fill.colour, token: null };
  return { kind: "custom", complete: true, cells: squareOf(card).cells, seed: null, colour: 0, token: null };
}

// squareFacts(card) is the check of a square card, computed here: { pass, reasons, genus (null), area (the number of
// its cells), digits (null) }. It passes when the cells of its polygon are exactly n^2 and the Kronecker symbol of
// every cell (r - i, s - j) is 0 (gcd > 1), each a reason otherwise.
export function squareFacts(card) {
  const { x0, d0, cells } = squareOf(card);
  const reasons = [];
  if (!cells || cells.length !== card.n * card.n) reasons.push(`${cells ? cells.length : 0} cells, stated ${card.n * card.n}`);
  const bad = (cells || []).filter(([i, j]) => kronecker(x0 + BigInt(i), d0 + BigInt(j)) !== 0).length;
  if (bad > 0) reasons.push(`${bad} of the cells not of type 0`);
  return { pass: reasons.length === 0, reasons, genus: null, area: cells ? cells.length : 0, digits: null };
}

// The 12 symmetries of the grid that fix (0, 0): r^k and r^k s for k = 0 .. 5, with the turn r(i, j) = (i - j, i) by
// 60 degrees and the mirror s(i, j) = (j, i). Each maps the six neighbours of a cell onto themselves.
const GRID_SYMMETRIES = (() => {
  const out = [];
  for (let k = 0; k < 6; k++) {
    for (const mirror of [false, true]) {
      out.push(([i, j]) => {
        let a = mirror ? j : i;
        let b = mirror ? i : j;
        for (let t = 0; t < k; t++) [a, b] = [a - b, a];
        return [a, b];
      });
    }
  }
  return Object.freeze(out);
})();

// the cells moved so that their least cell in the order (j, i) is (0, 0), as a set of keys
function normalKeys(cells) {
  let m = cells[0];
  for (const c of cells) if (compareCells(c, m) < 0) m = c;
  return new Set(cells.map(([i, j]) => cellKey(i - m[0], j - m[1])));
}

// symmetryOrder(cells) is the number of the 12 symmetries of the grid that map a finite cell set onto a translate of
// itself (1 to 12). Throws "empty_shape" for an empty list.
export function symmetryOrder(cells) {
  if (!Array.isArray(cells) || cells.length === 0) throw new CodedError("empty_shape", "a symmetry order needs cells");
  const base = normalKeys(cells);
  let n = 0;
  for (const f of GRID_SYMMETRIES) {
    const img = normalKeys(cells.map(f));
    let same = img.size === base.size;
    if (same) for (const k of img) if (!base.has(k)) { same = false; break; }
    if (same) n++;
  }
  return n;
}

const isDec = (s) => typeof s === "string" && parseBigIntStrict(s) !== null;
const isNat = (v) => Number.isInteger(v) && v >= 0;
const isText = (s) => typeof s === "string" && s.length > 0 && /^[\x20-\x7e]+$/.test(s) && !s.includes(";");

// checkGallery(gallery, { tokens, witnessFiles, naturals }) returns the list of problems (strings) of a parsed
// data/gallery.json: the format GALLERY_FORMAT, a non-empty list of cards for every card section of SECTIONS, every
// card of kind token, witness or natural with its stated genus and area, its reference resolved (token label in
// tokens, witness file name in witnessFiles, natural (x, d) in the list naturals with the same colour, genus and area,
// except a card of the section found: its region is checked by its own flood fill alone, its numbers are compared when
// it is in the list), the type of a card of a section with a switch among its types, a stated symmetry (1 to 12) on
// every card of the section found, a description text (optional) ASCII without a semicolon, and no card twice on the
// page. An empty list means well formed.
export function checkGallery(gallery, { tokens = {}, witnessFiles = [], naturals = [] } = {}) {
  const out = [];
  if (!gallery || gallery.format !== GALLERY_FORMAT) return [`format is not ${GALLERY_FORMAT}`];
  const seen = new Set();
  for (const s of SECTIONS.filter((x) => x.kind === "cards")) {
    const cards = gallery[s.id];
    if (!Array.isArray(cards) || cards.length === 0) {
      out.push(`${s.id}: no cards`);
      continue;
    }
    for (const [m, c] of cards.entries()) {
      const ct = `${s.id} card ${m}`;
      if (!["token", "witness", "natural"].includes(c.kind)) {
        out.push(`${ct}: unknown kind ${c.kind}`);
        continue;
      }
      const ref = cardRef(c);
      if (seen.has(ref)) out.push(`${ct}: ${ref} is shown twice`);
      seen.add(ref);
      if (!isNat(c.genus) || !isNat(c.area) || c.area < 1) out.push(`${ct}: stated genus and area missing`);
      if (c.kind === "token" && typeof tokens[c.label] !== "string") out.push(`${ct}: token label ${c.label} not in data/tokens.json`);
      if (c.kind === "witness" && !witnessFiles.includes(c.file)) out.push(`${ct}: witness file ${c.file}.json not in data/witnesses/`);
      if (c.kind === "natural") {
        if (!isDec(c.x) || !isDec(c.d)) {
          out.push(`${ct}: x and d must be decimal strings`);
          continue;
        }
        const n = naturals.find((e) => e.x === c.x && e.d === c.d);
        if (!n) {
          if (s.id !== "found") out.push(`${ct}: (${c.x}, ${c.d}) not in data/natural_examples.json`);
        } else if (n.genus !== c.genus || n.area !== c.area || n.colour !== c.colour) out.push(`${ct}: colour, genus or area differ from data/natural_examples.json`);
      }
      if (s.colours && !s.colours.includes(c.colour)) out.push(`${ct}: region type ${c.colour} is not one of the switch`);
      if (s.id === "found" && (!Number.isInteger(c.symmetry) || c.symmetry < 1 || c.symmetry > 12)) out.push(`${ct}: symmetry must be 1 .. 12`);
      if (c.text !== undefined && !isText(c.text)) out.push(`${ct}: the description text must be ASCII without a semicolon`);
    }
  }
  return out;
}

// windowSize(bounds, cell, pad) is [width, height] in CSS pixels of fittedWindow(bounds, cell, pad).
function windowSize(bounds, cell, pad) {
  const fw = fittedWindow(bounds, cell, pad);
  return [fw.width, fw.height];
}

// squareCover(cx, cy, cell, side) is the bounds (four corner cells) of a window at cell pixels per cell that covers the
// square of side pixels centred on the plane point (cx, cy): at least side pixels wide and high, at most about two
// cells more (the card shows its middle square, the rest is cut off).
function squareCover(cx, cy, cell, side) {
  let hx = (side / cell - 1) / 2;
  let hy = (side / cell - 2 / Math.sqrt(3)) / 2;
  let bounds = null;
  for (let k = 0; k < 40; k++) {
    bounds = [nearestCell(cx - hx, cy - hy), nearestCell(cx + hx, cy - hy), nearestCell(cx - hx, cy + hy), nearestCell(cx + hx, cy + hy)];
    const [w, h] = windowSize(bounds, cell, 0);
    if (w >= side && h >= side) break;
    if (w < side) hx += 0.25;
    if (h < side) hy += 0.25;
  }
  return bounds;
}

// fitCard(cells, side, { pad, minCell, cropCell, maxCell }) chooses how a region (offset cells) is drawn in a square
// of side pixels: { cell, bounds, pad (to pass to renderWindow), cropped }. Every card draws the same square: the
// window covers the square around the middle of the region (the region is fitted into the square, never the square
// to the region). The cell size is the largest at which the whole region with pad hexes around it fits the square
// (at most maxCell), or, when that size is below minCell, cropCell around the cell of the region nearest to the
// middle of its extent (cropped true, a part of the region is shown).
export function fitCard(cells, side, { pad = CARD_PAD, minCell = MIN_CELL, cropCell = CROP_CELL, maxCell = MAX_CELL } = {}) {
  if (!Array.isArray(cells) || cells.length === 0) throw new CodedError("empty_shape", "a card needs the cells of its region");
  if (!(side > 0)) throw new CodedError("bad_cell", "the card side is a positive number of pixels");
  const { ax, bx, ay, by } = boundsExtents(cells);
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const [w1, h1] = windowSize(cells, 100, pad).map((v) => v / 100);
  let cell = Math.min(maxCell, (side - 1) / w1, (side - 1) / h1);
  if (cell >= minCell) {
    cell = Math.floor(cell * 100) / 100;
    for (let k = 0; k < 20; k++) {
      const [w, h] = windowSize(cells, cell, pad);
      if (w <= side && h <= side) break;
      cell = Math.floor(cell * 97) / 100;
    }
    return { cell, bounds: squareCover(mx, my, cell, side), pad: 0, cropped: false };
  }
  // cropped: the region cell nearest to the middle of its extent, the square around that cell
  let best = cells[0];
  let bd = Infinity;
  for (const c of cells) {
    const [px, py] = planeOf(c[0], c[1]);
    const dd = (px - mx) ** 2 + (py - my) ** 2;
    if (dd < bd) {
      bd = dd;
      best = c;
    }
  }
  const [cx, cy] = planeOf(best[0], best[1]);
  return { cell: cropCell, bounds: squareCover(cx, cy, cropCell, side), pad: 0, cropped: true, centre: [best[0], best[1]] };
}
