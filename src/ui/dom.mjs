// Small DOM helpers shared by every page: element creation, page stylesheets, and fetching text or JSON.
// Every URL given here should be built with new URL(path, import.meta.url) by the caller, so that the site works
// under any sub-path.

import { CodedError } from "../core/bigint_utils.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";

function applyAttrs(el, attrs) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class" || k === "className") {
      el.setAttribute("class", Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v));
    } else if (k === "style" && typeof v === "object") {
      for (const [p, pv] of Object.entries(v)) {
        if (pv === undefined || pv === null) continue;
        if (p.startsWith("--")) el.style.setProperty(p, String(pv));
        else el.style[p] = String(pv);
      }
    } else if (k === "dataset" && typeof v === "object") {
      for (const [p, pv] of Object.entries(v)) if (pv !== undefined && pv !== null) el.dataset[p] = String(pv);
    } else if (k === "html") {
      el.innerHTML = String(v);
    } else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "value" && "value" in el) {
      el.value = String(v);
    } else if (v === true) {
      el.setAttribute(k, "");
    } else {
      el.setAttribute(k, String(v));
    }
  }
}

function appendChildren(el, children) {
  for (const c of children) {
    if (c === undefined || c === null || c === false || c === true) continue;
    if (Array.isArray(c)) appendChildren(el, c);
    else if (typeof c === "object" && typeof c.nodeType === "number") el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

// h(tag, attrs, ...children) creates an HTML element. attrs: "class" (string or list), "style" (string or object,
// "--name" keys set custom properties), "dataset" (object), "html" (inner HTML), "on<event>" functions (listeners),
// true for a boolean attribute, null / undefined / false to skip, anything else as an attribute string. Children:
// nodes, strings, numbers, nested arrays, null / false skipped.
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  appendChildren(el, children);
  return el;
}

// svg(tag, attrs, ...children) is h for SVG elements (created in the SVG namespace).
export function svg(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs);
  appendChildren(el, children);
  return el;
}

// useStyles(url) adds one <link rel="stylesheet"> for the URL to the document head (once per URL, later calls reuse
// it). Returns a promise resolved with the link element when the stylesheet is loaded (or failed to load, which is
// logged by the browser as a failed request).
export function useStyles(url) {
  const href = new URL(String(url), document.baseURI).href;
  for (const l of document.head.querySelectorAll('link[rel="stylesheet"]')) {
    if (l.href === href) return l.__loaded || Promise.resolve(l);
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.__loaded = new Promise((resolve) => {
    link.addEventListener("load", () => resolve(link), { once: true });
    link.addEventListener("error", () => resolve(link), { once: true });
  });
  document.head.appendChild(link);
  return link.__loaded;
}

async function fetchOk(url) {
  let res;
  try {
    res = await fetch(String(url));
  } catch (e) {
    throw new CodedError("fetch_failed", `could not fetch ${url}: ${e && e.message}`);
  }
  if (!res.ok) throw new CodedError("fetch_failed", `fetch ${url}: HTTP ${res.status}`);
  return res;
}

// loadText(url) fetches a text file. Throws "fetch_failed" on a network error or an HTTP status other than 2xx.
export async function loadText(url) {
  return (await fetchOk(url)).text();
}

// loadJson(url) fetches and parses a JSON file. Throws "fetch_failed" as loadText, "bad_json" on invalid JSON.
export async function loadJson(url) {
  const text = await loadText(url);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new CodedError("bad_json", `${url} is not valid JSON: ${e && e.message}`);
  }
}

// messageOf(error) is the message of an error without the prefix "<code>: " that a CodedError's message may carry
// (a CodedError, { code, message }, or anything else: its text). "" when there is no message.
export function messageOf(error) {
  const code = error && error.code ? String(error.code) : null;
  const msg = error && error.message !== undefined && error.message !== null ? String(error.message) : error && typeof error !== "object" ? String(error) : "";
  return code && msg.startsWith(`${code}: `) ? msg.slice(code.length + 2) : msg;
}

// copyText(text) copies a string to the clipboard (Clipboard API when allowed, else a hidden textarea). Returns a
// promise of true on success, false when the browser refused.
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the textarea method
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}
