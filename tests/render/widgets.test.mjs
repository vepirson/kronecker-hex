// The pure parts of the widgets: the text of the big number widget (for the 10437-digit x0 of a shipped token, with
// an independent sha256 from node:crypto) and the stepper's "next" rule.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { openToken } from "../../src/formats/token.mjs";
import { bigNumberParts, shortNumber, SHORT_FULL_DIGITS, SHORT_END_DIGITS } from "../../src/ui/widgets/bignum.mjs";
import { nextPos } from "../../src/ui/widgets/stepper.mjs";

const tokens = JSON.parse(fs.readFileSync(new URL("../../data/tokens.json", import.meta.url), "utf8"));

test("bigNumber text of the 10437-digit x0 of the genus 100 token: the short form of the site", () => {
  const { x0 } = openToken(tokens.genus100_green);
  const s = x0.toString();
  const p = bigNumberParts(x0);
  assert.equal(p.digits, 10437);
  assert.equal(p.text, s);
  assert.equal(p.abbreviated, true);
  assert.equal(p.head, s.slice(0, 4));
  assert.equal(p.tail, s.slice(-4));
  assert.equal(p.display, `${s.slice(0, 4)}...${s.slice(-4)} (10437 digits)`);
  assert.equal(p.display, shortNumber(x0), "one short form for a long number");
  assert.equal(p.sha16, createHash("sha256").update(s, "ascii").digest("hex").slice(0, 16));
  assert.deepEqual(bigNumberParts(s), p, "the decimal string gives the same parts");
});

test("bigNumber text of small, negative and 24 / 25 digit numbers", () => {
  assert.deepEqual(bigNumberParts(0n), { text: "0", negative: false, digits: 1, abbreviated: false, head: "0", tail: "0", display: "0", sha16: null });
  const n24 = "-" + "123456789012".repeat(2);
  const p24 = bigNumberParts(n24);
  assert.equal(p24.digits, SHORT_FULL_DIGITS);
  assert.equal(p24.display, n24);
  assert.equal(p24.sha16, null);
  const n25 = "-9" + "123456789012".repeat(2);
  const p25 = bigNumberParts(BigInt(n25));
  assert.equal(p25.digits, 25);
  assert.equal(p25.display, `-${n25.slice(1, 1 + SHORT_END_DIGITS)}...${n25.slice(-SHORT_END_DIGITS)} (25 digits)`);
  assert.equal(p25.display, "-9123...9012 (25 digits)");
  assert.equal(p25.sha16, createHash("sha256").update(n25, "ascii").digest("hex").slice(0, 16), "the sha256 is taken over the string with its sign");
  assert.equal(bigNumberParts(-42).text, "-42");
  assert.throws(() => bigNumberParts("12a"), { code: "bad_integer" });
  assert.throws(() => bigNumberParts(1.5), { code: "bad_integer" });
});

test("stepper next: raises sub up to subCount, then the next step at sub 0", () => {
  assert.deepEqual(nextPos({ step: 0, sub: 0, subCount: 2 }, 3), { step: 0, sub: 1 });
  assert.deepEqual(nextPos({ step: 0, sub: 1, subCount: 2 }, 3), { step: 0, sub: 2 });
  assert.deepEqual(nextPos({ step: 0, sub: 2, subCount: 2 }, 3), { step: 1, sub: 0 });
  assert.deepEqual(nextPos({ step: 1, sub: 0, subCount: 0 }, 3), { step: 2, sub: 0 });
  assert.equal(nextPos({ step: 2, sub: 0, subCount: 0 }, 3), null);
  assert.deepEqual(nextPos({ step: 2, sub: 0, subCount: 1 }, 3), { step: 2, sub: 1 });
});
