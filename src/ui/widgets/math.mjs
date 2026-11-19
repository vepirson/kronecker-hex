// Mathematics typesetting for the pages, on the vendored KaTeX (vendor/katex/, version in its VERSION.json).
//
// renderMath(el, tex, { display }) typesets one formula into el. renderMathIn(el) typesets every $...$ (inline) and
// $$...$$ (display) found in the text nodes below el, skipping code, pre, script, style, textarea and elements
// marked data-no-math. A backslash before a dollar sign (\$) gives a literal dollar sign. A dollar sign without
// its closing partner stays as text. A formula KaTeX cannot parse never throws: the page shows its source in a
// span of class "math-error" and the problem is logged once per formula (console.warn).
//
// The KaTeX stylesheet is added once with useStyles. Its fonts are the woff2 files next to it, found by the
// stylesheet's own relative URLs, so the site works under any sub-path and makes no request to another host.

import katex from "../../../vendor/katex/katex.mjs";
import { useStyles } from "../dom.mjs";

// URL of the vendored KaTeX stylesheet.
export const KATEX_CSS = new URL("../../../vendor/katex/katex.min.css", import.meta.url);

const warned = new Set();

// splitMath(text) cuts a string into segments { type: "text", value } and { type: "math", tex, display }:
// $$...$$ is display math, $...$ inline math, \$ a literal dollar sign, and a dollar sign with no closing partner
// (or an empty $$ $$ pair) is kept as text. Pure, never throws.
export function splitMath(text) {
  const s = String(text);
  const out = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ type: "text", value: buf });
    buf = "";
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "$") {
      buf += "$";
      i += 2;
      continue;
    }
    if (ch !== "$") {
      buf += ch;
      i++;
      continue;
    }
    const display = s[i + 1] === "$";
    const open = display ? 2 : 1;
    const close = findClose(s, i + open, display);
    if (close < 0) {
      buf += s.slice(i, i + open);
      i += open;
      continue;
    }
    const tex = s.slice(i + open, close);
    if (tex.trim() === "") {
      buf += s.slice(i, close + open);
      i = close + open;
      continue;
    }
    flush();
    out.push({ type: "math", tex, display });
    i = close + open;
  }
  flush();
  return out;
}

// Index of the closing delimiter of a formula starting at `from`, or -1. Inside a formula a backslash escapes the
// next character (so \$ inside TeX does not close it).
function findClose(s, from, display) {
  for (let j = from; j < s.length; j++) {
    const ch = s[j];
    if (ch === "\\") {
      j++;
      continue;
    }
    if (ch === "$") {
      if (!display) return j;
      if (s[j + 1] === "$") return j;
      return -1; // a single $ inside display math: not a valid pair
    }
  }
  return -1;
}

// texToHtml(tex, display) returns { ok: true, html } with the KaTeX markup of the formula, or { ok: false, error }
// when KaTeX cannot parse it. Pure (works in Node too), never throws.
export function texToHtml(tex, display = false) {
  try {
    const html = katex.renderToString(String(tex), { displayMode: display === true, throwOnError: true, output: "htmlAndMathml", strict: "ignore" });
    return { ok: true, html };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

// The version of the vendored KaTeX.
export const KATEX_VERSION = katex.version;

function warnOnce(tex, error) {
  if (warned.has(tex)) return;
  warned.add(tex);
  if (typeof console !== "undefined") console.warn(`math: cannot typeset ${JSON.stringify(tex)}: ${error}`);
}

function ensureStyles() {
  if (typeof document !== "undefined") useStyles(KATEX_CSS);
}

function mathNode(tex, display) {
  const span = document.createElement("span");
  span.className = display ? "math math-display" : "math";
  const r = texToHtml(tex, display);
  if (r.ok) {
    span.innerHTML = r.html;
  } else {
    span.classList.add("math-error");
    span.textContent = display ? `$$${tex}$$` : `$${tex}$`;
    span.title = r.error;
    warnOnce(tex, r.error);
  }
  return span;
}

// renderMath(el, tex, { display }) replaces the content of el by the typeset formula (display style when display
// is true). Returns true when KaTeX typeset it, false when the source is shown instead. Never throws.
export function renderMath(el, tex, { display = false } = {}) {
  ensureStyles();
  const r = texToHtml(tex, display);
  el.classList.add("math");
  if (display) el.classList.add("math-display");
  if (r.ok) {
    el.classList.remove("math-error");
    el.innerHTML = r.html;
    return true;
  }
  el.classList.add("math-error");
  el.textContent = display ? `$$${tex}$$` : `$${tex}$`;
  el.title = r.error;
  warnOnce(tex, r.error);
  return false;
}

const SKIP = new Set(["CODE", "PRE", "SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION"]);

function skipped(node, root) {
  for (let e = node.parentNode; e && e !== root.parentNode; e = e.parentNode) {
    if (e.nodeType !== 1) continue;
    if (SKIP.has(e.tagName)) return true;
    if (e.classList && (e.classList.contains("katex") || e.classList.contains("math"))) return true;
    if (e.hasAttribute && e.hasAttribute("data-no-math")) return true;
  }
  return false;
}

// mathText(el, text) replaces the content of el by a text whose $...$ formulas are typeset (renderMathIn), and
// returns el. An empty text empties el.
export function mathText(el, text) {
  el.textContent = text === null || text === undefined ? "" : String(text);
  if (el.textContent) renderMathIn(el);
  return el;
}

// renderMathIn(el) typesets every $...$ and $$...$$ in the text nodes below el (see the header). Returns
// { formulas, failed }: the number of formulas found and how many of them KaTeX could not typeset. Never throws.
export function renderMathIn(el) {
  ensureStyles();
  const found = [];
  const walker = document.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue.indexOf("$") >= 0 && !skipped(n, el)) found.push(n);
  }
  let formulas = 0;
  let failed = 0;
  for (const node of found) {
    const parts = splitMath(node.nodeValue);
    if (!parts.some((p) => p.type === "math")) {
      const plain = parts.map((p) => p.value).join("");
      if (plain !== node.nodeValue) node.nodeValue = plain;
      continue;
    }
    const frag = document.createDocumentFragment();
    for (const p of parts) {
      if (p.type === "text") {
        frag.appendChild(document.createTextNode(p.value));
      } else {
        const span = mathNode(p.tex, p.display);
        formulas++;
        if (span.classList.contains("math-error")) failed++;
        frag.appendChild(span);
      }
    }
    node.parentNode.replaceChild(frag, node);
  }
  return { formulas, failed };
}
