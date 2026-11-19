// Builds the stored tries of the Algorithm page's presets that replay a stored token: for every preset and region type
// whose plan has a token (resolveSignPreset of src/ui/pages/lab/model.mjs), it runs the live construction of that shape
// (runToEnd, the construction the page runs), checks that it gives exactly the stored token's x0 and d0, and writes
// the record of its tries (searchRecord of src/ui/pages/lab/search.mjs: the rejected candidates d0 and the residues R
// tried in each row) into one JSON file:
//   { "format": "lab_search_v1", "note": "...", "records": { "<token label>": { key, candidates, attempts } | null } }
// key is searchKey of the result (the sha256 of x0 and d0). A label whose live run gives other numbers than its token
// gets null: its tries are not those of the stored result, and the page leaves them out.
//
// Usage: node tools/build_lab_search.mjs <output.json>
//   The output file must not exist (the tool never writes over a file: to regenerate the records, write a new file
//   and compare it with the shipped one).
// No dependency. Prints a progress line per preset (its share of the work, its time, the time so far and an estimate
// of the rest from the times measured so far) and a final RESULT line.

import fs from "node:fs";
import { LAB_SEARCH_FORMAT, searchKey, searchRecord, storedPlans } from "../src/ui/pages/lab/search.mjs";
import { runToEnd } from "../src/construct/index.mjs";
import { buildLabView } from "../src/construct/lab_view.mjs";
import { openToken } from "../src/formats/token.mjs";
import { sha256Hex } from "../src/core/sha256.mjs";

const read = (rel) => JSON.parse(fs.readFileSync(new URL(`../${rel}`, import.meta.url), "ascii"));

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw new Error("usage: node tools/build_lab_search.mjs <output.json>");
  const path = args[0];
  if (fs.existsSync(path)) throw new Error(`${path} exists: the tool never writes over a file`);
  const tokens = read("data/tokens.json");
  const plans = storedPlans();
  const t0 = performance.now();
  const records = {};
  for (const [k, plan] of plans.entries()) {
    const tc = performance.now();
    const file = read(`data/shapes/${plan.file}`);
    const { events, result } = runToEnd({ shape: file.shape, seed: file.seed, colour: plan.colour, lift: plan.lift, id: null });
    if (!result || result.pass !== true) throw new Error(`the live construction of ${plan.tokenLabel} failed`);
    const op = openToken(tokens[plan.tokenLabel]);
    const same = result.sha256.x0 === sha256Hex(op.x0.toString()) && result.sha256.d0 === sha256Hex(op.d0.toString());
    records[plan.tokenLabel] = same ? { key: searchKey(result), ...searchRecord(buildLabView(events)) } : null;
    const ms = performance.now() - tc;
    const spent = (performance.now() - t0) / 1000;
    const rest = (spent / (k + 1)) * (plans.length - k - 1);
    console.log(`${Math.round((100 * (k + 1)) / plans.length)}% ${k + 1} of ${plans.length} ${plan.tokenLabel}: ${(ms / 1000).toFixed(2)} s, ${same ? "same numbers as the token" : "OTHER numbers than the token: null"}, ${spent.toFixed(1)} s so far, about ${rest.toFixed(0)} s left`);
  }
  const doc = {
    format: LAB_SEARCH_FORMAT,
    note: "The tries of the Algorithm page's presets that replay a stored token (rejected candidates d0, residues R tried per row), each from the live construction of the preset, which gives the token's x0 and d0, written by tools/build_lab_search.mjs.",
    records,
  };
  const text = `${JSON.stringify(doc, null, 1)}\n`;
  if (!/^[\x00-\x7f]*$/.test(text)) throw new Error("the output is not ASCII");
  fs.writeFileSync(path, text, { flag: "wx" });
  console.log(`RESULT: ${plans.length} records written to ${path} (${text.length} bytes), ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

main();
