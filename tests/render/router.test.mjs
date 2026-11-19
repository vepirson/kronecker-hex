// Routing: hash parsing, route matching for every route of the manifest, the hash targets of navigate, and that every
// route loads a page module with a mount function.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ROUTES, EXPLORE_PATH, HOME_VIEW, LAB_PATH, LAB_ALIAS, homeQuery } from "../../src/ui/routes.mjs";
import { parseHash, parseQuery, matchPattern, matchRoute, buildHash, normalisePath, navigate, markShown, homeRedirect, aliasRedirect, pageOf } from "../../src/ui/router.mjs";

const tokens = JSON.parse(fs.readFileSync(new URL("../../data/tokens.json", import.meta.url), "utf8"));
const token = tokens.genus100_green;

test("parseQuery decodes pairs, keeps + and the last repeated key", () => {
  assert.deepEqual(parseQuery(""), {});
  assert.deepEqual(parseQuery("a=1&b=x%2Cy&c&d=a+b&a=2"), { a: "2", b: "x,y", c: "", d: "a+b" });
  assert.deepEqual(parseQuery("x=-123456789012345678901234567890&d=7"), { x: "-123456789012345678901234567890", d: "7" });
  assert.deepEqual(parseQuery("bad=%E0%A4%A"), { bad: "%E0%A4%A" });
});

test("normalisePath and parseHash", () => {
  assert.equal(normalisePath(""), "#/");
  assert.equal(normalisePath("#"), "#/");
  assert.equal(normalisePath("#/"), "#/");
  assert.equal(normalisePath("#/explore/"), "#/explore");
  assert.equal(normalisePath("#explore"), "#/explore");
  assert.deepEqual(parseHash(""), { path: "#/", query: {} });
  assert.deepEqual(parseHash("#/explore?x=5&d=-7&z=22&sel=3,-4"), { path: "#/explore", query: { x: "5", d: "-7", z: "22", sel: "3,-4" } });
  assert.deepEqual(parseHash("#/algorithm?preset=c100&colour=green&mode=replay"), { path: "#/algorithm", query: { preset: "c100", colour: "green", mode: "replay" } });
});

test("matchPattern: literals, parameters, lengths", () => {
  assert.deepEqual(matchPattern("#/", "#/"), {});
  assert.equal(matchPattern("#/", "#/explore"), null);
  assert.deepEqual(matchPattern("#/w/:token", "#/w/abc_-9"), { token: "abc_-9" });
  assert.equal(matchPattern("#/w/:token", "#/w"), null);
  assert.equal(matchPattern("#/w/:token", "#/w/a/b"), null);
  assert.deepEqual(matchPattern("#/algorithm/w/:token", "#/algorithm/w/a%20b"), { token: "a b" });
  assert.equal(matchPattern("#/algorithm/w/:token", "#/algorithm/x/abc"), null);
});

test("matchRoute finds the page of every route of the manifest", () => {
  const want = [
    ["#/explore?x=1&d=2", "#/explore", {}],
    [`#/w/${token}`, "#/w/:token", { token }],
    ["#/edit?s=AAAA", "#/edit", {}],
    ["#/algorithm?preset=s3", "#/algorithm", {}],
    [`#/algorithm/w/${token}`, "#/algorithm/w/:token", { token }],
    ["#/gallery/", "#/gallery", {}],
  ];
  for (const [hash, pattern, params] of want) {
    const m = matchRoute(hash, ROUTES);
    assert.ok(m, hash);
    assert.equal(m.route.pattern, pattern, hash);
    assert.deepEqual(m.params, params, hash);
  }
  assert.deepEqual(matchRoute("#/explore?x=1&d=2").query, { x: "1", d: "2" });
  assert.equal(matchRoute("#/nowhere"), null);
  // the proofs are on the question's page (the header's entry Proofs): "#/proof" is an unknown address
  assert.equal(matchRoute("#/proof"), null);
  assert.equal(matchRoute("#/algorithm/w"), null);
  // the old path of the Algorithm page is no route of its own: the router replaces it first (aliasRedirect)
  assert.equal(matchRoute("#/lab"), null);
  // the site has no page of its own at "#/": the router replaces that address by the Explorer's home view
  for (const hash of ["", "#", "#/"]) assert.equal(matchRoute(hash), null, hash);
  assert.equal(ROUTES.length, 6);
});

test("homeRedirect: an address without a page becomes the Explorer at x = 0, d = 0, zoom 20, every other stays", () => {
  for (const hash of ["", "#", "#/", "#/?a=1"]) assert.equal(homeRedirect(hash), "#/explore?x=0&d=0&z=20", hash);
  assert.equal(buildHash(EXPLORE_PATH, homeQuery()), "#/explore?x=0&d=0&z=20");
  assert.deepEqual(HOME_VIEW, { x: 0n, d: 0n, cell: 20 });
  for (const hash of ["#/explore", "#/gallery", `#/w/${token}`, "#/nowhere"]) assert.equal(homeRedirect(hash), null, hash);
});

test("aliasRedirect: the old addresses #/lab... of the Algorithm page keep working, as the same address under #/algorithm", () => {
  assert.equal(LAB_PATH, "#/algorithm");
  assert.equal(LAB_ALIAS, "#/lab");
  const cases = [
    ["#/lab", "#/algorithm"],
    ["#/lab/", "#/algorithm"],
    ["#/lab?preset=c100&colour=green&mode=replay", "#/algorithm?preset=c100&colour=green&mode=replay"],
    ["#/lab?genus=7&colour=red", "#/algorithm?genus=7&colour=red"],
    [`#/lab/w/${token}`, `#/algorithm/w/${token}`],
    [`#/lab/w/${token}?step=3`, `#/algorithm/w/${token}?step=3`],
  ];
  for (const [old, now] of cases) {
    assert.equal(aliasRedirect(old), now, old);
    const m = matchRoute(now, ROUTES);
    assert.ok(m && m.route.page === "lab", now);
    assert.equal(pageOf(old), null, "the old address itself matches no route");
  }
  assert.equal(matchRoute(aliasRedirect(`#/lab/w/${token}`)).params.token, token);
  for (const hash of ["#/algorithm", "#/algorithm?preset=c100", "#/explore", "#/label", "#/labs/w/x", "#/w/abc", "", "#/"]) assert.equal(aliasRedirect(hash), null, hash);
});

test("buildHash: the targets of navigate", () => {
  assert.equal(buildHash("#/"), "#/");
  assert.equal(buildHash("#/explore", { x: "-5", d: "7", z: "22", sel: "3,-4" }), "#/explore?x=-5&d=7&z=22&sel=3,-4");
  assert.equal(buildHash("#/algorithm", { preset: "c100", colour: "green", mode: "replay" }), "#/algorithm?preset=c100&colour=green&mode=replay");
  assert.equal(buildHash("#/explore", { x: "1", d: undefined, z: null }), "#/explore?x=1");
  assert.equal(buildHash("#/explore/", {}), "#/explore");
  assert.equal(buildHash("#/gallery", { q: "a b&c=d" }), "#/gallery?q=a%20b%26c%3Dd");
  assert.equal(buildHash("#/explore?x=1", { d: "2" }), "#/explore?x=1&d=2");
  assert.equal(buildHash(`#/w/${token}`), `#/w/${token}`);
  assert.throws(() => buildHash("/explore"), { code: "bad_path" });
  assert.throws(() => buildHash("explore"), { code: "bad_path" });
  const q = { x: "-1".padEnd(500, "7"), d: "12", sel: "-3,4", preset: "maxhex" };
  assert.deepEqual(parseHash(buildHash("#/explore", q)).query, q);
});

test("navigate writes the hash, replaces or pushes history entries", () => {
  const calls = [];
  globalThis.location = { hash: "#/" };
  globalThis.history = {
    pushState: (s, t, u) => calls.push(["push", u]),
    replaceState: (s, t, u) => calls.push(["replace", u]),
  };
  try {
    navigate("#/explore", { x: "3", d: "4" });
    assert.equal(location.hash, "#/explore?x=3&d=4");
    navigate("#/explore", { x: "3", d: "4" }); // same hash: nothing
    assert.equal(calls.length, 0);
    navigate("#/algorithm", { preset: "s2" }, { replace: true });
    navigate("#/explore", { x: "9", d: "4" }, { silent: true });
    navigate("#/explore", { x: "10", d: "4" }, { silent: true, replace: true });
    assert.deepEqual(calls, [["replace", "#/algorithm?preset=s2"], ["push", "#/explore?x=9&d=4"], ["replace", "#/explore?x=10&d=4"]]);
  } finally {
    delete globalThis.location;
    delete globalThis.history;
  }
});

test("a silent navigate is dropped once the address has left the mounted page", () => {
  const calls = [];
  globalThis.location = { hash: "#/explore" };
  const write = (kind) => (s, t, u) => {
    calls.push([kind, u]);
    location.hash = u;
  };
  globalThis.history = { pushState: write("push"), replaceState: write("replace") };
  try {
    markShown(); // as the shell does when it renders #/explore
    // the page mirrors its state: the address is its own
    navigate("#/w/abc", undefined, { silent: true, replace: true });
    assert.equal(location.hash, "#/w/abc");
    // somebody goes elsewhere, the hashchange is not handled yet
    location.hash = "#/gallery";
    // the late mirror of the old page must not take the address back
    navigate("#/w/abc", undefined, { silent: true, replace: true });
    navigate("#/explore", { x: "1", d: "2" }, { silent: true, replace: true });
    assert.equal(location.hash, "#/gallery");
    assert.deepEqual(calls, [["replace", "#/w/abc"]]);
    // a navigate that is not silent still works from there
    navigate("#/algorithm", undefined, { replace: true });
    assert.equal(location.hash, "#/algorithm");
  } finally {
    delete globalThis.location;
    delete globalThis.history;
  }
});

test("every route loads a page module with mount(root, ctx)", async () => {
  for (const r of ROUTES) {
    const mod = await r.load();
    assert.equal(typeof mod.mount, "function", r.pattern);
  }
});
