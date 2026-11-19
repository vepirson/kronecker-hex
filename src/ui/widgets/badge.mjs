// The pass badge: the result of a witness verification (verifyWitness: { pass, id, reasons, warnings, info }) as a
// PASS or FAIL badge with the list of reasons and warnings.

import { h } from "../dom.mjs";

// badge(pass, title) is the badge element alone: PASS (classes "badge pass", data-pass "true") or FAIL ("badge fail",
// data-pass "false"), with its tooltip (default "Check passed" or "Check failed").
export function badge(pass, title = pass ? "Check passed" : "Check failed") {
  return h("span", { class: ["badge", pass ? "pass" : "fail"], dataset: { pass: String(!!pass) }, title }, pass ? "PASS" : "FAIL");
}

// passBadge(el, verifyResult) fills el with the badge. A null or undefined result shows "Not checked". Returns the
// badge element.
export function passBadge(el, verifyResult) {
  const r = verifyResult;
  if (!r || typeof r !== "object") {
    const b = h("span", { class: "badge", dataset: { pass: "none" } }, "Not checked");
    el.replaceChildren(h("div", { class: "badge-box" }, b));
    return b;
  }
  const reasons = Array.isArray(r.reasons) ? r.reasons : [];
  const warnings = Array.isArray(r.warnings) ? r.warnings : [];
  const b = badge(r.pass === true);
  el.replaceChildren(
    h(
      "div",
      { class: "badge-box" },
      b,
      reasons.length ? h("ul", { class: "badge-reasons" }, reasons.map((t) => h("li", null, String(t)))) : null,
      warnings.length ? h("ul", { class: "badge-warnings" }, warnings.map((t) => h("li", null, `warning: ${t}`))) : null,
    ),
  );
  return b;
}
