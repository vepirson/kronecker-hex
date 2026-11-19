// Static file server for local development. No dependency.
//
// Usage: node tools/serve.mjs [--port N] [--host H]
//   default port 8000 (or the environment variable PORT), host 127.0.0.1. Port 0 picks a free port.
//   The first line printed is "serving <root> at http://<host>:<port>/", flushed at once, so that a parent process
//   can read the port from it.
// The root is the repository folder (the parent of tools/). Requests outside the root are refused.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
};

function argValue(name, fallback) {
  const k = process.argv.indexOf(name);
  return k >= 0 && k + 1 < process.argv.length ? process.argv[k + 1] : fallback;
}

const port = Number(argValue("--port", process.env.PORT || "8000"));
const host = argValue("--host", "127.0.0.1");
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  process.stderr.write(`bad port ${port}\n`);
  process.exit(2);
}

function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "text/plain; charset=utf-8", "method not allowed\n");
    return;
  }
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    send(res, 400, "text/plain; charset=utf-8", "bad request\n");
    return;
  }
  let file = path.resolve(ROOT, "." + rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    send(res, 403, "text/plain; charset=utf-8", "forbidden\n");
    return;
  }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) {
      if (!rel.endsWith("/")) {
        res.writeHead(301, { Location: rel + "/" });
        res.end();
        return;
      }
      file = path.join(file, "index.html");
    }
    fs.readFile(file, (err2, data) => {
      if (err2) {
        send(res, 404, "text/plain; charset=utf-8", "not found\n");
        return;
      }
      const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Content-Length": data.length, "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : data);
    });
  });
});

server.listen(port, host, () => {
  const a = server.address();
  process.stdout.write(`serving ${ROOT} at http://${host}:${a.port}/\n`);
});
