// The start panel of the Algorithm page (shown while nothing runs): one card per preset with a small picture of its
// shape, its name and the three colours (a colour the shape does not allow is disabled with its reason, the colour
// check of model.mjs), the box "any genus" (the shapes of type +-1 in green or red, of type 0 in blue, up to the
// measured limits), the paste box for a token or a link and the link to the shape editor. The family names are
// typeset as formulas in the card names, the line of the box and the problem line, and written in plain words in the
// tooltips.

import { h, svg, loadJson } from "../../dom.mjs";
import { labHref, labTokenHref, tokenInLink } from "../../actions.mjs";
import { EDIT_PATH } from "../../routes.mjs";
import { centre } from "../../../core/geometry.mjs";
// the region types in the order of the site, +1, -1, 0 (one list for the site, the shape editor's)
import { COLOURS } from "../../editor/editor_state.mjs";
import { mathText } from "../../widgets/math.mjs";
import * as model from "./model.mjs";

// The size of a card's picture in CSS pixels.
export const PICTURE = Object.freeze({ width: 96, height: 64, pad: 2 });

// swatch(c) is a small square in the present palette's colour of the region type c.
const swatch = (c) => h("span", { class: `lab-swatch lab-swatch-${model.colourWord(c)}`, "aria-hidden": "true" });
// colourLabel(c) is the content of a region type control: the swatch, then the type ("+1", "-1", "0"), never a colour
// word (the palette can change).
const colourLabel = (c) => [swatch(c), model.typeText(c)];

// hexPoints(cx, cy, r) is the point list of a pointy-top hexagon of circumradius r around (cx, cy).
function hexPoints(cx, cy, r) {
  const out = [];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k + Math.PI / 6;
    out.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${out.join("L")}Z`;
}

// shapePicture(cells, colour) is an SVG picture of a shape (one path of hexagons, filled in the colour 1, -1 or 0)
// fitted into PICTURE.
export function shapePicture(cells, colour) {
  const pts = cells.map(([i, j]) => centre(i, j, 1));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const r = 1 / Math.sqrt(3);
  const x0 = Math.min(...xs) - r, x1 = Math.max(...xs) + r, y0 = Math.min(...ys) - r, y1 = Math.max(...ys) + r;
  const w = PICTURE.width - 2 * PICTURE.pad, hh = PICTURE.height - 2 * PICTURE.pad;
  const s = Math.min(w / (x1 - x0), hh / (y1 - y0));
  const ox = PICTURE.pad + (w - s * (x1 - x0)) / 2 - s * x0, oy = PICTURE.pad + (hh - s * (y1 - y0)) / 2 - s * y0;
  const d = pts.map(([x, y]) => hexPoints(ox + s * x, oy + s * y, s * r * 0.92)).join("");
  return svg("svg", { class: "lab-card-pic", viewBox: `0 0 ${PICTURE.width} ${PICTURE.height}`, width: String(PICTURE.width), height: String(PICTURE.height), "aria-hidden": "true", focusable: "false" },
    svg("path", { d, class: `lab-card-fill lab-card-fill-${model.colourWord(colour)}` }));
}

// renderStart(el, { problem, navigate, text }) fills the start panel el and returns { ready } (a promise resolved when
// every card has its picture and its colour check).
export function renderStart(el, { problem = null, navigate, text = () => "" } = {}) {
  // a message line (typeset): the problem of the address at the top, a card's or the genus box's message under it
  const messageLine = (id, cls, t) => mathText(h("p", { class: ["lab-error-text", cls], id, hidden: !t, role: "status" }), t || "");
  const sayIn = (line) => (t) => {
    mathText(line, t || "");
    line.hidden = !t;
  };
  const problemEl = messageLine("lab-start-problem", null, problem);

  // ---------- the cards ----------
  const cards = model.LAB_PRESETS.map((p) => {
    const msg = messageLine(`lab-card-msg-${p.name}`, "lab-card-msg", null);
    const say = sayIn(msg);
    const links = COLOURS.map((c) => {
      const word = model.colourWord(c);
      const a = h("a", { class: ["btn", "lab-colour", `lab-preset-${word}`], href: labHref({ preset: p.name, colour: word }), dataset: { preset: p.name, colour: word }, "aria-label": `Region type ${model.typeText(c)}` }, colourLabel(c));
      a.addEventListener("click", (e) => {
        if (a.getAttribute("aria-disabled") !== "true") return;
        e.preventDefault();
        say(a.dataset.reason);
      });
      return a;
    });
    const pic = h("span", { class: "lab-card-pic-box" });
    const li = h("li", { class: "lab-card", dataset: { preset: p.name } }, pic, mathText(h("span", { class: "lab-preset-name" }), p.titleTex), h("span", { class: "lab-card-colours" }, links), msg);
    // the colour check of the shape decides which colours are enabled
    const apply = (cells) => {
      let first = null;
      links.forEach((a, k) => {
        const chk = model.colourCheck(cells, COLOURS[k]);
        if (!chk) {
          if (first === null) first = COLOURS[k];
          return;
        }
        // the verdict in a word or two in the tooltip, the sentence in plain words for the screen reader, the sentence
        // with the formula in the card's message
        const reason = model.blockedText(p.title, COLOURS[k], chk);
        const rid = `lab-why-${p.name}-${a.dataset.colour}`;
        a.setAttribute("aria-disabled", "true");
        a.dataset.reason = model.blockedText(p.titleTex, COLOURS[k], chk);
        a.title = model.fieldsOf({ colour: COLOURS[k] }).verdict;
        a.setAttribute("aria-describedby", rid);
        li.append(h("span", { class: "sr-only", id: rid }, reason));
      });
      pic.replaceChildren(shapePicture(cells, first === null ? 1 : first));
      li.dataset.ready = "true";
    };
    const computed = model.presetShape(p);
    const done = computed
      ? Promise.resolve(apply(computed.shape))
      : loadJson(model.shapeUrl(p.file)).then((f) => apply(f.shape), (e) => console.warn(e));
    return { li, done };
  });
  const list = h("ul", { class: "lab-presets lab-cards", id: "lab-presets" }, cards.map((c) => c.li));
  const ready = Promise.all(cards.map((c) => c.done)).then(() => {
    list.dataset.ready = "true";
  });

  // ---------- any genus ----------
  const genus = h("input", { type: "number", id: "lab-genus", min: "1", step: "1", value: "12", inputmode: "numeric", "aria-label": "Genus g", size: "5" });
  // the region type: an option per type, and beside the list the swatch of the chosen one
  const colourSel = h("select", { id: "lab-genus-colour", "aria-label": "Region type", title: "Region type" }, COLOURS.map((c) => h("option", { value: model.colourWord(c) }, model.typeText(c))));
  const selSwatch = h("span", { class: "lab-genus-swatch", id: "lab-genus-swatch" });
  const go = h("button", { type: "button", id: "lab-genus-go", title: "Pack this genus" }, "Run");
  const limits = mathText(h("p", { class: "lab-small", id: "lab-genus-limits" }), model.genusLimitsText());
  const genusMsg = messageLine("lab-genus-msg", null, null);
  const syncType = () => {
    const c = model.readColour(colourSel.value);
    genus.max = String(model.genusLimit(c));
    selSwatch.replaceChildren(swatch(c));
  };
  colourSel.addEventListener("change", syncType);
  syncType();
  go.addEventListener("click", () => {
    const plan = model.resolveGenus(genus.value, colourSel.value);
    if (!plan || plan.blocked) {
      sayIn(genusMsg)(plan ? plan.blocked.text : "The genus is a whole number from 1.");
      return;
    }
    navigate(labHref({ genus: String(plan.g), colour: colourSel.value }));
  });

  // ---------- a token or a link ----------
  const pasteArea = h("textarea", { id: "lab-paste", rows: "3", spellcheck: "false", placeholder: "A token, or a link with #/algorithm/w/... or #/w/...", "aria-label": "Token or link" });
  const pasteNote = h("p", { class: "lab-small", id: "lab-paste-note" });
  const pasteBtn = h("button", { type: "button", id: "lab-paste-open", title: "Open this construction" }, "Open");
  pasteBtn.addEventListener("click", () => {
    const tok = tokenInLink(pasteArea.value);
    if (!tok) {
      pasteNote.textContent = "No token found";
      return;
    }
    navigate(labTokenHref(tok));
  });

  el.replaceChildren(
    problemEl,
    h("div", { class: "lab-prose", html: text("start.lead") }),
    h("h2", { class: "lab-h2" }, "Shapes"),
    list,
    h("h2", { class: "lab-h2" }, "Any genus"),
    h("div", { class: "lab-row", id: "lab-genus-row" }, h("label", { for: "lab-genus" }, "g"), genus, selSwatch, colourSel, go),
    genusMsg,
    limits,
    h("h2", { class: "lab-h2" }, "A link or a token"),
    pasteArea,
    h("div", { class: "lab-row" }, pasteBtn),
    pasteNote,
    h("h2", { class: "lab-h2" }, "Your own shape"),
    h("p", null, "Draw a shape in the ", h("a", { href: EDIT_PATH, id: "lab-start-editor" }, "shape editor"), "."),
  );
  return { ready };
}
