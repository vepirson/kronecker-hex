// The shape of the editor in the address: #/edit?s=<text>&colour=green|red|blue, the text being the shape rows of the
// token format (shapeRowsToText of src/formats/token.mjs: fields 6 and 7 of version 1, base64url, no tag). The colour
// words are the ones of the Lab's address. The seed is not written: a shape read from the address has the first cell
// in the order (j, i) as its seed.

import { shapeRowsToText, shapeRowsFromText } from "../../formats/token.mjs";
import { CodedError } from "../../core/bigint_utils.mjs";
import { readColour, colourWord } from "../pages/lab/model.mjs";

// A shape whose text is longer than this many characters is not written into the address.
export const SHAPE_ADDRESS_LIMIT = 2000;

// shapeQuery(cells, colour) is the address query { s, colour } of a shape, or null when the shape has no text that
// fits: an empty shape, a shape with an empty row between its lowest and its highest row, or a text longer than
// SHAPE_ADDRESS_LIMIT characters.
export function shapeQuery(cells, colour) {
  if (!Array.isArray(cells) || cells.length === 0) return null;
  let s;
  try {
    s = shapeRowsToText(cells);
  } catch {
    return null;
  }
  return s.length <= SHAPE_ADDRESS_LIMIT ? { s, colour: colourWord(colour) } : null;
}

// The sentences of an address that cannot be read, for a visitor (the codes stay in the error).
export const ADDRESS_COLOUR_SENTENCE = "The region type in the address is not valid.";
export const ADDRESS_SHAPE_SENTENCE = "The shape in the address cannot be read.";

// readShapeQuery(query) reads the address query of the editor page: null when it has no shape (no "s"), else
// { cells (sorted by (j, i)), colour (1, -1 or 0) }, or { error, sentence } (error a CodedError: the codes of
// shapeRowsFromText, "too_large" for a text longer than SHAPE_ADDRESS_LIMIT, "bad_format" for another colour word,
// sentence ADDRESS_COLOUR_SENTENCE or ADDRESS_SHAPE_SENTENCE).
export function readShapeQuery(query = {}) {
  if (!query || query.s === undefined) return null;
  const text = String(query.s);
  const colour = readColour(query.colour);
  if (colour === null) return { error: new CodedError("bad_format", "The region type in the address is not valid."), sentence: ADDRESS_COLOUR_SENTENCE };
  if (text.length > SHAPE_ADDRESS_LIMIT) {
    return { error: new CodedError("too_large", `The shape text has more than ${SHAPE_ADDRESS_LIMIT} characters.`), sentence: ADDRESS_SHAPE_SENTENCE };
  }
  try {
    return { cells: shapeRowsFromText(text), colour };
  } catch (e) {
    return { error: e, sentence: ADDRESS_SHAPE_SENTENCE };
  }
}
