// The licence of the repository: the MIT text in LICENSE with the copyright line of the contributors, the field license
// of package.json, one line in the README, and no copyright notice on the pages.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("LICENSE holds the MIT licence with the copyright line of the contributors, package.json and the README say MIT", () => {
  const text = read("LICENSE");
  assert.ok(text.startsWith("MIT License\n"));
  assert.ok(text.includes("\nCopyright (c) 2026 the kronecker-hex contributors\n"));
  assert.ok(text.includes("Permission is hereby granted, free of charge, to any person obtaining a copy"));
  assert.ok(text.includes('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND'));
  assert.equal(JSON.parse(read("package.json")).license, "MIT");
  assert.equal(read("README.md").split("\n").filter((l) => l.includes("LICENSE")).length, 1);
});

test("no page shows a copyright notice", () => {
  const files = ["index.html"];
  const walk = (dir) => {
    for (const e of fs.readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|html|json)$/.test(e.name)) files.push(p);
    }
  };
  walk("src/ui");
  walk("content");
  const bad = files.filter((f) => /copyright|\(c\) 20/i.test(read(f)));
  assert.deepEqual(bad, []);
});
