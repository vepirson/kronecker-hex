// The Gallery's memory within one loaded page (a reload starts empty): what a card found stays known when the visitor
// changes a page of a section, switches a type or leaves the Gallery and comes back, so that the card is shown at
// once and nothing is computed again.
//   built     the result of a live construction of a family card (only cards without a stored token are built),
//             keyed by familyKey (section, member, type)
//   checked   the prepared region and the result of the card's check (facts, state, caption, reason), keyed by the
//             card's key (cardKey). A check that failed because the page was left is not kept.
//   pictures  the finished picture of a card, keyed by the card's key, the picture's pixel size and the colours it was
//             drawn with (theme and palette): another size or other colours draw again. At most PICTURE_LIMIT_BYTES
//             in all (4 bytes per pixel), the least recently used dropped first.
// No DOM work here except copying a picture (a canvas) and drawing it back.

import { familyKey, familyInput } from "./model.mjs";

// The bound of the kept pictures, in bytes (a picture of w x h pixels takes 4 w h bytes).
export const PICTURE_LIMIT_BYTES = 48 * 1024 * 1024;
// The bound of the kept construction results and checks (more than the cards of the Gallery: nothing of a visit is
// dropped by it, it only stops a growth that should not happen).
export const ENTRY_LIMIT = 1000;

const built = new Map();
const checked = new Map();
const pictures = new Map(); // key -> { canvas, bytes }, in order of last use
let pictureBytes = 0;

// cardKey(card) is the key of a card: its reference ("token:<label>", "witness:<file>", "natural:<x>,<d>",
// "square:<section>:<n>") or, for a family card, "family:" and its familyKey (the type is part of it).
export function cardKey(card) {
  if (card.kind === "family") return `family:${familyKey(card)}`;
  if (card.kind === "square") return `square:${card.section}:${card.n}`;
  if (card.kind === "token") return `token:${card.label}`;
  if (card.kind === "witness") return `witness:${card.file}`;
  return `natural:${card.x},${card.d}`;
}

// pictureKey(card, { side, dpr, colours }) is the key of a card's picture: the card, the side of its square in CSS
// pixels and the device pixel ratio (together the canvas's pixel size) and the colours of the drawing
// (resolveColours of the page: theme and palette).
export function pictureKey(card, { side, dpr, colours }) {
  return `${cardKey(card)}|${side}@${dpr}|${JSON.stringify(colours)}`;
}

const setBounded = (map, key, value) => {
  map.delete(key);
  map.set(key, value);
  if (map.size > ENTRY_LIMIT) map.delete(map.keys().next().value);
};

// loadFamilyCard(card, { stored, open, build }) is the one loader of a family card's region, in this order:
//   (a) the stored token of the card's key (stored: the parsed FAMILY_TOKENS_FILE of the model, or null): open(token)
//   (b) else the result of an earlier live construction of this visit
//   (c) else a live construction build(familyInput(card)) (a promise of the construction's result), kept for (b)
// Resolves with { x0, d0, witness, token, from: "stored" | "visit" | "built" }. open(token) returns { x0, d0, witness }
// or a promise of it.
export async function loadFamilyCard(card, { stored, open, build }) {
  const key = familyKey(card);
  const token = stored && stored.tokens ? stored.tokens[key] : undefined;
  if (typeof token === "string") return { ...(await open(token)), token, from: "stored" };
  const kept = built.get(key);
  if (kept) return { ...kept, from: "visit" };
  const r = await build(familyInput(card));
  const out = { x0: r.x0, d0: r.d0, witness: r.witness, token: r.token };
  setBounded(built, key, out);
  return { ...out, from: "built" };
}

// keepChecked(card, entry) and checkedOf(card): the prepared region and the check of a card (see above).
export function keepChecked(card, entry) {
  setBounded(checked, cardKey(card), entry);
}
export function checkedOf(card) {
  return checked.get(cardKey(card)) || null;
}

// keepPicture(key, canvas, about) keeps a copy of the canvas's pixels under key (pictureKey) with about (what the
// page needs of the drawing: its renderWindow record and its fit), dropping the least recently used pictures above
// PICTURE_LIMIT_BYTES. A picture larger than the bound alone is not kept.
export function keepPicture(key, canvas, about) {
  const bytes = 4 * canvas.width * canvas.height;
  dropPicture(key);
  if (bytes === 0 || bytes > PICTURE_LIMIT_BYTES) return false;
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext("2d").drawImage(canvas, 0, 0);
  pictures.set(key, { canvas: copy, bytes, style: canvas.style.width, about });
  pictureBytes += bytes;
  while (pictureBytes > PICTURE_LIMIT_BYTES) dropPicture(pictures.keys().next().value);
  return true;
}

function dropPicture(key) {
  const p = pictures.get(key);
  if (!p) return;
  pictures.delete(key);
  pictureBytes -= p.bytes;
}

// hasPicture(key): a picture is kept under key
export function hasPicture(key) {
  return pictures.has(key);
}

// showPicture(key, canvas) draws the kept picture of key into canvas (its pixel size and style width as they were)
// and returns its about, or returns null when no picture is kept under key.
export function showPicture(key, canvas) {
  const p = pictures.get(key);
  if (!p) return null;
  pictures.delete(key);
  pictures.set(key, p);
  canvas.width = p.canvas.width;
  canvas.height = p.canvas.height;
  canvas.style.width = p.style;
  canvas.getContext("2d").drawImage(p.canvas, 0, 0);
  return p.about;
}

// memoryStats() is { built, checked, pictures, pictureBytes } (counts and bytes kept now).
export function memoryStats() {
  return { built: built.size, checked: checked.size, pictures: pictures.size, pictureBytes };
}
