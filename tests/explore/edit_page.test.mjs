// The editor page without a browser: the shape in the address (#/edit?s=<text>&colour=<word>, the shape rows of the
// token format) with its round trip and its bad texts, the start of the page from the address and the store, and
// Build (the Lab's constructions without the step display) on the main thread.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { shapeRowsToText, shapeRowsFromText, openToken, decodeToken } from "../../src/formats/token.mjs";
import { shapeQuery, readShapeQuery, SHAPE_ADDRESS_LIMIT, ADDRESS_COLOUR_SENTENCE, ADDRESS_SHAPE_SENTENCE } from "../../src/ui/editor/shape_address.mjs";
import { startOf, sameShape, ADDRESS_MS } from "../../src/ui/pages/edit.mjs";
import { startBuild } from "../../src/ui/editor/build.mjs";
import { labInputOf } from "../../src/ui/editor/editor_state.mjs";
import { buildHash, parseHash } from "../../src/ui/router.mjs";
import { shapeS, shapeZ, seedZ } from "../../src/core/shapes.mjs";
import { compareCells } from "../../src/core/geometry.mjs";

const sorted = (cells) => cells.map(([i, j]) => [i, j]).sort(compareCells);
const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), "ascii"));

test("shape text: the shape rows of a token, round trip on S_g, Z_g, C_100 and the two hexagons, and on the six tokens", () => {
  const shapes = [shapeS(1), shapeS(10), shapeZ(3), [[5, -7]], [[-3, 2], [-2, 2], [-4, 3]]];
  for (const f of ["c100.json", "genus0_hexagon.json", "hexagon_genus117.json"]) shapes.push(readJson(`../../data/shapes/${f}`).shape);
  for (const cells of shapes) {
    const s = shapeRowsToText(cells);
    assert.match(s, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(shapeRowsFromText(s), sorted(cells));
  }
  // the text is the part of a token after its first fields: the shape of each shipped token reads back the same
  const tokens = readJson("../../data/tokens.json");
  for (const [label, tok] of Object.entries(tokens)) {
    const shape = decodeToken(tok).data.shape;
    assert.deepEqual(shapeRowsFromText(shapeRowsToText(shape)), shape, label);
  }
  // C_100 (541 cells) is far below the address limit
  assert.ok(shapeRowsToText(readJson("../../data/shapes/c100.json").shape).length < 300);
  assert.equal(SHAPE_ADDRESS_LIMIT, 2000);
});

test("shape text: bad texts end in an error with its code, never in another shape", () => {
  const good = shapeRowsToText(shapeS(2));
  const codes = (t) => {
    try {
      shapeRowsFromText(t);
      return "accepted";
    } catch (e) {
      return e.code;
    }
  };
  assert.equal(codes(""), "truncated");
  assert.equal(codes("ab*d"), "bad_alphabet");
  assert.equal(codes("A"), "not_canonical");
  assert.ok(["truncated", "not_canonical"].includes(codes(good.slice(0, 3))), "a cut text");
  assert.equal(codes(`${good}AAAA`), "not_canonical", "bits after the last field");
  // every single-character change is refused or reads back as a shape whose own text it is
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let accepted = 0;
  for (let k = 0; k < good.length; k++) {
    for (const c of alpha) {
      if (c === good[k]) continue;
      const t = good.slice(0, k) + c + good.slice(k + 1);
      let cells = null;
      try {
        cells = shapeRowsFromText(t);
      } catch (e) {
        assert.ok(typeof e.code === "string", t);
        continue;
      }
      accepted++;
      assert.equal(shapeRowsToText(cells), t, "an accepted text is the canonical text of its shape");
    }
  }
  assert.ok(accepted < good.length * 63);
  // a shape with an empty row has no text
  assert.throws(() => shapeRowsToText([[0, 0], [0, 2]]), { code: "bad_format" });
  assert.throws(() => shapeRowsToText([]), { code: "bad_format" });
});

test("the editor address: #/edit?s=<text>&colour=<word>, written for a short shape, read back with its colour", () => {
  const q = shapeQuery(shapeZ(2), 0);
  assert.deepEqual(q, { s: shapeRowsToText(shapeZ(2)), colour: "blue" });
  const hash = buildHash("#/edit", q);
  assert.equal(hash, `#/edit?s=${q.s}&colour=blue`, "base64url needs no percent coding");
  const back = readShapeQuery(parseHash(hash).query);
  assert.deepEqual(back, { cells: sorted(shapeZ(2)), colour: 0 });
  assert.deepEqual(readShapeQuery({ s: shapeRowsToText(shapeS(1)) }).colour, 1, "no colour: green");
  assert.equal(shapeQuery(shapeS(1), -1).colour, "red");
  // not mirrored: an empty shape, a shape with an empty row, a text above the limit
  assert.equal(shapeQuery([], 1), null);
  assert.equal(shapeQuery([[0, 0], [3, 2]], 1), null);
  const wide = Array.from({ length: 13000 }, (_, i) => [2 * i, 0]);
  assert.ok(shapeRowsToText(wide).length > SHAPE_ADDRESS_LIMIT);
  assert.equal(shapeQuery(wide, 1), null);
  // read: no s, a bad s, a bad colour
  assert.equal(readShapeQuery({}), null);
  assert.equal(readShapeQuery({ s: "ab*d" }).error.code, "bad_alphabet");
  assert.equal(readShapeQuery({ s: q.s, colour: "violet" }).error.code, "bad_format");
  assert.equal(readShapeQuery({ s: "A".repeat(SHAPE_ADDRESS_LIMIT + 4) }).error.code, "too_large");
  assert.equal(ADDRESS_MS, 300);
  // each error carries one plain sentence for a visitor, without its code
  assert.equal(readShapeQuery({ s: "ab*d" }).sentence, ADDRESS_SHAPE_SENTENCE);
  assert.equal(readShapeQuery({ s: "A".repeat(SHAPE_ADDRESS_LIMIT + 4) }).sentence, ADDRESS_SHAPE_SENTENCE);
  assert.equal(readShapeQuery({ s: q.s, colour: "violet" }).sentence, "The region type in the address is not valid.");
  assert.equal(ADDRESS_COLOUR_SENTENCE, "The region type in the address is not valid.");
  assert.equal(ADDRESS_SHAPE_SENTENCE, "The shape in the address cannot be read.");
});

test("docs/formats.md: the example of the editor address", () => {
  const doc = fs.readFileSync(new URL("../../docs/formats.md", import.meta.url), "ascii");
  const m = /<!-- check:shape-text-example -->\s*```[a-z]*\n([\s\S]*?)\n```/.exec(doc);
  assert.ok(m, "block shape-text-example");
  const triangle = [[0, 0], [1, 0], [2, 0], [1, 1], [2, 1], [2, 2]];
  assert.equal(m[1].trim(), buildHash("#/edit", shapeQuery(triangle, 0)));
  assert.deepEqual(readShapeQuery(parseHash(m[1].trim()).query), { cells: sorted(triangle), colour: 0 });
});

test("the start of the editor page: the address shape, or the stored shape with its history when it is the same", () => {
  const z = sorted(shapeZ(2));
  const s = shapeRowsToText(z);
  const kept = { cells: z, seed: seedZ(2), colour: 0, undo: [{ added: [1], removed: [], seedBefore: null, seedAfter: null }], redo: [] };
  assert.deepEqual(startOf({}, kept), { start: null }, "no s: resume the stored shape");
  assert.deepEqual(startOf({ s, colour: "blue" }, kept), { start: null }, "the same shape and colour: resume it with its history");
  assert.deepEqual(startOf({ s, colour: "red" }, kept), { start: { cells: z, seed: null, colour: -1 } }, "another colour: the address wins");
  assert.deepEqual(startOf({ s: shapeRowsToText(shapeS(1)) }, kept), { start: { cells: sorted(shapeS(1)), seed: null, colour: 1 } });
  const bad = startOf({ s: "ab*d" }, kept);
  assert.deepEqual(bad.start, { cells: [], seed: null, colour: 1 }, "a bad text gives an empty editor");
  assert.equal(bad.error.code, "bad_alphabet");
  assert.equal(bad.sentence, ADDRESS_SHAPE_SENTENCE);
  assert.equal(sameShape([[1, 0], [0, 0]], [[0, 0], [1, 0]]), true);
  assert.equal(sameShape([[1, 0]], [[0, 0]]), false);
});

// run(input) runs startBuild to its end: { done: result } or { error: info }
const run = (input) =>
  new Promise((resolve) => {
    startBuild(input, { onDone: (result) => resolve({ done: result }), onError: (info) => resolve({ error: info }) });
  });

test("Build of a blue shape on the main thread (the Lab's rule): a token that opens and holds the shape", async () => {
  const input = labInputOf({ cells: shapeZ(2), seed: seedZ(2), colour: 0 });
  let main = null;
  const out = await new Promise((resolve) => {
    const b = startBuild(input, { onDone: (r) => resolve({ done: r }), onError: (e) => resolve({ error: e }) });
    main = b.runOn;
  });
  assert.equal(main, "main", "a blue shape of at most 100 cells runs on the main thread, as in the Lab");
  assert.ok(out.done, JSON.stringify(out.error));
  assert.equal(out.done.pass, true);
  const op = openToken(out.done.token);
  assert.equal(op.data.colour, 0);
  assert.deepEqual(op.data.shape, sorted(shapeZ(2)));
});

test("Build failures carry the Lab's error texts: a blue shape whose neighbours meet every class mod 2, a sign run without a worker", async () => {
  const bad = await run({ shape: sorted(shapeS(2)), seed: [1, 0], colour: 0, id: null });
  assert.ok(bad.error);
  assert.equal(bad.error.code, "inadmissible");
  assert.equal(bad.error.title, "The neighbours are not admissible");
  // green and red always run in the worker, as in the Lab: Node has no Worker, so the run stops with the Lab's text
  const sign = await run(labInputOf({ cells: shapeS(1), seed: [1, 0], colour: 1 }));
  assert.ok(sign.error);
  assert.equal(sign.error.code, "stopped");
  assert.equal(typeof sign.error.sentence, "string");
  // cancel: no callback follows
  let called = false;
  const b = startBuild(labInputOf({ cells: shapeZ(1), seed: seedZ(1), colour: 0 }), { onDone: () => (called = true), onError: () => (called = true) });
  b.cancel();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(called, false);
});
