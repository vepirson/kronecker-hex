// Integers of any length: the one short form of a long number on the site (shortNumber), and the big number widget:
// a copy button for the full value, then the number in its short form, and for a shortened number the first 16 hex
// characters of the sha256 of its decimal string (in the tooltip, or as a line where a page is about checking it).

import { sha256Hex } from "../../core/sha256.mjs";
import { parseBigIntStrict, CodedError } from "../../core/bigint_utils.mjs";
import { h, copyText } from "../dom.mjs";
import { iconButton, setIconLabel } from "./icons.mjs";

// Numbers with at most this many digits are shown in full.
export const SHORT_FULL_DIGITS = 24;
// Digits shown at each end of a longer number.
export const SHORT_END_DIGITS = 4;

// shortNumber(value) is the short form of an integer (bigint, safe integer or decimal string): the number itself up
// to SHORT_FULL_DIGITS digits, else its first and last SHORT_END_DIGITS digits and its digit count, with its sign:
// "4833...4072 (656 digits)". A text that is not one integer is returned as it is.
export function shortNumber(value) {
  const s = typeof value === "bigint" || typeof value === "number" ? String(value) : String(value === undefined || value === null ? "" : value).trim();
  if (!/^-?[0-9]+$/.test(s)) return s;
  const neg = s.startsWith("-");
  const a = neg ? s.slice(1) : s;
  if (a.length <= SHORT_FULL_DIGITS) return s;
  return `${neg ? "-" : ""}${a.slice(0, SHORT_END_DIGITS)}...${a.slice(-SHORT_END_DIGITS)} (${a.length} digits)`;
}

function toDecimal(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  const b = parseBigIntStrict(typeof value === "string" ? value : "");
  if (b === null) throw new CodedError("bad_integer", "bigNumber takes a bigint, a safe integer or a decimal string");
  return b.toString();
}

// bigNumberParts(value) returns { text (plain decimal string), negative, digits (of |value|), abbreviated,
// head, tail (first and last SHORT_END_DIGITS digits), display (shortNumber of the value), sha16 (16 hex characters
// of sha256(text) for an abbreviated number, else null) }.
export function bigNumberParts(value) {
  const text = toDecimal(value);
  const negative = text.startsWith("-");
  const abs = negative ? text.slice(1) : text;
  const digits = abs.length;
  const abbreviated = digits > SHORT_FULL_DIGITS;
  const head = abs.slice(0, SHORT_END_DIGITS);
  const tail = abs.slice(-SHORT_END_DIGITS);
  const display = shortNumber(text);
  const sha16 = abbreviated ? sha256Hex(text).slice(0, 16) : null;
  return { text, negative, digits, abbreviated, head, tail, display, sha16 };
}

// The tooltip of the copy button.
const COPY_LABEL = "Copy number";

// bigNumber(el, value, { label, sha }) fills el with the widget for value (bigint, safe integer or decimal string): the
// copy button first, then the label and the short form, whose tooltip is the sha256 prefix of a shortened number
// (unless the line below shows it). sha true (a place about checking a number) also writes that prefix as a labelled line
// under it. After a click the button's tooltip says "Copied" (or "Copy failed") for a moment. Returns { parts,
// update(value) }.
export function bigNumber(el, value, { label, sha = false } = {}) {
  let parts = null;
  const render = (v) => {
    parts = bigNumberParts(v);
    const p = parts;
    const btn = iconButton("copy", COPY_LABEL, { class: "bignum-copy" });
    btn.addEventListener("click", async () => {
      const ok = await copyText(p.text);
      setIconLabel(btn, ok ? "Copied" : "Copy failed");
      btn.dataset.copied = ok ? "true" : "false";
      setTimeout(() => {
        setIconLabel(btn, COPY_LABEL);
        delete btn.dataset.copied;
      }, 1200);
    });
    el.replaceChildren(
      h(
        "div",
        { class: "bignum", dataset: { digits: p.digits } },
        btn,
        h(
          "div",
          { class: "bignum-text" },
          h(
            "div",
            { class: "bignum-line" },
            label ? h("span", { class: "bignum-label" }, label) : null,
            h("span", { class: "bignum-value", title: p.abbreviated && !sha ? `sha256 ${p.sha16}` : null }, p.display),
          ),
          sha && p.sha16 ? h("div", { class: "bignum-sha" }, `sha256 ${p.sha16}`) : null,
        ),
      ),
    );
  };
  render(value);
  return {
    get parts() {
      return parts;
    },
    update: render,
  };
}
