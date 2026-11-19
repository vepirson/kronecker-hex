// Builds the stored tokens of the Gallery's family cards: for every family section of SECTIONS
// (src/ui/gallery/model.mjs), every member of its pages from the first stored page on (storedMembers) and every region
// type of the section, it runs the construction of the card (runToEnd(familyInput(card)), the same construction the
// page runs in the construct worker) and writes the tokens of the results into one JSON file:
//   { "format": "family_tokens_v2", "note": "...", "fromPage": <first stored page, counted from 1>,
//     "tokens": { "<section>:<member>:<type>": "<token>", ... } }
// keys in the order of SECTIONS, then member, then the section's types. The members of the first page of a family have
// no token: the Gallery builds them in the browser.
//
// Usage: node tools/build_family_tokens.mjs <output.json>
//   The output file must not exist (the tool never writes over a file: to regenerate the stored tokens, write a new
//   file and compare it with the shipped one).
// No dependency. Prints a progress line per member (its share of the work, its time, the time so far and an estimate
// of the rest from the times measured so far) and a final RESULT line.

import fs from "node:fs";
import { SECTIONS, FIRST_STORED_PAGE, FAMILY_TOKENS_FORMAT, familyInput, familyKey, storedMembers } from "../src/ui/gallery/model.mjs";
import { runToEnd } from "../src/construct/index.mjs";

function parseArgs(argv) {
  if (argv.length !== 1) throw new Error("usage: node tools/build_family_tokens.mjs <output.json>");
  return { path: argv[0] };
}

function main() {
  const { path } = parseArgs(process.argv.slice(2));
  if (fs.existsSync(path)) throw new Error(`${path} exists: the tool never writes over a file`);
  const t0 = performance.now();
  const cards = [];
  for (const s of SECTIONS.filter((x) => x.kind === "family")) {
    for (const member of storedMembers(s)) for (const colour of s.colours) cards.push({ kind: "family", section: s.id, member, colour });
  }
  const tokens = {};
  let slowest = { key: null, ms: 0 };
  for (const [k, card] of cards.entries()) {
    const tc = performance.now();
    const { result } = runToEnd(familyInput(card));
    if (!result || result.pass !== true || typeof result.token !== "string") throw new Error(`the construction of ${familyKey(card)} failed`);
    const ms = performance.now() - tc;
    if (ms > slowest.ms) slowest = { key: familyKey(card), ms };
    tokens[familyKey(card)] = result.token;
    // the rest at the cost of this member (the members of a family grow, so within a family the rest takes longer)
    const spent = (performance.now() - t0) / 1000;
    const rest = (ms / 1000) * (cards.length - k - 1);
    console.log(`${Math.round((100 * (k + 1)) / cards.length)}% ${k + 1} of ${cards.length} ${familyKey(card)}: ${(ms / 1000).toFixed(2)} s, token ${result.token.length} characters, ${spent.toFixed(1)} s so far, ${rest.toFixed(0)} s left at this member's cost`);
  }
  const doc = {
    format: FAMILY_TOKENS_FORMAT,
    note: `Tokens of the Gallery's family cards from page ${FIRST_STORED_PAGE + 1} of each family on, each the result of the construction of its card, written by tools/build_family_tokens.mjs.`,
    fromPage: FIRST_STORED_PAGE + 1,
    tokens,
  };
  const text = `${JSON.stringify(doc, null, 1)}\n`;
  if (!/^[\x00-\x7f]*$/.test(text)) throw new Error("the output is not ASCII");
  fs.writeFileSync(path, text, { flag: "wx" });
  console.log(`RESULT: ${cards.length} tokens written to ${path} (${text.length} bytes), ${((performance.now() - t0) / 1000).toFixed(1)} s, slowest ${slowest.key} ${(slowest.ms / 1000).toFixed(2)} s`);
}

main();
