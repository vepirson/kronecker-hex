// digitCount: the number of decimal digits of a bigint, exact, without writing a long number in decimal. Checked
// against the length of the decimal text around every power of ten up to 10^3000 and on pseudo-random numbers of up to
// 20000 digits, both signs.

import { test } from "node:test";
import assert from "node:assert/strict";

import { digitCount } from "../../src/core/bigint_utils.mjs";

const len = (b) => (b < 0n ? -b : b).toString().length;

test("digitCount around every power of ten: 10^k - 1, 10^k, 10^k + 1 and both signs", () => {
  assert.equal(digitCount(0n), 1);
  let p = 1n;
  for (let k = 0; k <= 3000; k++) {
    for (const b of [p - 1n, p, p + 1n, 2n * p - 1n, 5n * p, 9n * p + (p - 1n)]) {
      if (b === 0n) continue;
      assert.equal(digitCount(b), len(b), `k = ${k}`);
      assert.equal(digitCount(-b), len(b), `k = ${k}, negative`);
    }
    p *= 10n;
  }
});

test("digitCount on pseudo-random numbers of up to 20000 digits", () => {
  let s = 12345n;
  const next = () => (s = (s * 6364136223846793005n + 1442695040888963407n) % (1n << 64n));
  for (let n = 1; n <= 400; n++) {
    let b = 0n;
    const words = 1 + ((n * 37) % 1040);
    for (let w = 0; w < words; w++) b = (b << 64n) | next();
    assert.equal(digitCount(b), len(b), `${words} words`);
    // a number just below and at a power of ten of about the same size
    const p = 10n ** BigInt(len(b) - 1);
    assert.equal(digitCount(p - 1n), len(b) - 1);
    assert.equal(digitCount(p), len(b));
  }
});
