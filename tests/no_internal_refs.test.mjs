// Guard: the repository is standalone. No file name or file content may carry words of the tooling it was built
// with (see the pattern list below). Exempt: vendor/, .git/, LICENSE files, binary files, and the pattern list
// itself (the lines between the two marker comments). The first pattern of the list (marked tokenExempt) is not
// applied inside the base64url token strings of data/tokens.json and tests/fixtures/tokens.json.
//
// The environment variable SCAN_ROOT points the same scan at another folder (used to show that the guard fires).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// patterns-begin
const PATTERNS = [
  { re: /KHX|khx_/, name: "KHX", tokenExempt: true },
  { re: /SITE-[A-Z]/, name: "SITE-" },
  { re: /agent_scratch|orchestrator|\bagents?\b|referee|refereed|\bdrafts?\b/i, name: "process words" },
  { re: /derivations\/|reviews\/|PROPOSAL_|HANDOFF|SPEC_SITE|SPEC_WITNESS|SPEC section|CLAUDE/, name: "internal documents" },
  { re: /PRELIM/, name: "PRELIM" },
  { re: /\bU1b?\b/, name: "U1" },
  { re: /kron_hex_[a-z0-9_]+\.(py|mjs|html)|bench_row_solver|verify_witnesses|_20[0-9]{2}-[0-9]{2}-[0-9]{2}\.(md|json|jsonl)/, name: "internal file names" },
  { re: /[A-Za-z]:\\(Users|PROJECT)|\/Users\//i, name: "local paths" },
  { re: /\breview(s|ed|er|ers|ing)?\b/i, name: "review words" },
  { re: /\b(changed|fixed|added|updated|removed|renamed)\b.{0,60}\b20[0-9]{2}-[0-9]{2}-[0-9]{2}\b|\b20[0-9]{2}-[0-9]{2}-[0-9]{2}\b.{0,20}\b(changed|fixed|added|updated|removed|renamed)\b/i, name: "dated change notes" },
  { re: /\b(?!(?:SHA|UTF|ISO|RFC)-)[A-Z][A-Z0-9]{1,}-[A-Z0-9]{1,6}\b/, name: "work names", tokenExempt: true },
];
// patterns-end

const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".woff", ".woff2", ".ttf", ".otf", ".pdf", ".wasm", ".zip", ".gz"]);
const TOKEN_FILES = new Set(["data/tokens.json", "tests/fixtures/tokens.json"]);
const SELF = path.resolve(fileURLToPath(import.meta.url));

// All files under root (relative paths with "/"), without .git/, vendor/, node_modules/ and LICENSE files.
export function listFiles(root) {
  const out = [];
  const walk = (dir, rel) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (r === ".git" || r === "vendor" || ent.name === "node_modules") continue;
        walk(path.join(dir, ent.name), r);
      } else if (ent.isFile()) {
        if (/^LICENSE/.test(ent.name)) continue;
        out.push(r);
      }
    }
  };
  walk(root, "");
  return out.sort();
}

// Findings of the scan of one folder: [{ file, line, pattern, text }].
export function scanTree(root) {
  const findings = [];
  for (const rel of listFiles(root)) {
    for (const p of PATTERNS) if (p.re.test(rel)) findings.push({ file: rel, line: 0, pattern: p.name, text: "(file name)" });
    if (BINARY_EXT.has(path.extname(rel).toLowerCase())) continue;
    const abs = path.join(root, ...rel.split("/"));
    const buf = fs.readFileSync(abs);
    if (buf.includes(0)) continue;
    let lines = buf.toString("utf8").split(/\r?\n/);
    if (path.resolve(abs) === SELF) {
      let inside = false;
      lines = lines.map((l) => {
        if (l.trim() === "// patterns-begin") inside = true;
        const keep = inside ? "" : l;
        if (l.trim() === "// patterns-end") inside = false;
        return keep;
      });
    }
    const tokenFile = TOKEN_FILES.has(rel);
    lines.forEach((line, k) => {
      for (const p of PATTERNS) {
        const text = tokenFile && p.tokenExempt ? line.replace(/"[A-Za-z0-9_-]{64,}"/g, '""') : line;
        if (p.re.test(text)) findings.push({ file: rel, line: k + 1, pattern: p.name, text: line.slice(0, 120) });
      }
    });
  }
  return findings;
}

const ROOT = process.env.SCAN_ROOT ? path.resolve(process.env.SCAN_ROOT) : path.resolve(fileURLToPath(new URL("..", import.meta.url)));

test(`no internal references in ${process.env.SCAN_ROOT ? "the folder of SCAN_ROOT" : "the repository"}`, () => {
  const files = listFiles(ROOT);
  assert.ok(files.length > 0);
  const findings = scanTree(ROOT);
  const report = findings.map((f) => `${f.file}:${f.line} [${f.pattern}] ${f.text}`).join("\n");
  assert.equal(findings.length, 0, `${findings.length} findings:\n${report}`);
});
