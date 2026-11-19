// PNG export of a fixed window: the picture of renderWindow at 1 image pixel per CSS pixel, on the fixed light
// theme (white background and lines between the hexagons, outline #111111, soft cells mixed with white at 0.45) with
// the light fills of the current palette in every page theme, and an optional caption strip below. Also the names and
// the JSON of the downloads of a region (fileStem, jsonBlob, witnessFile), the same on every page.

import { renderWindow, fittedWindow, exportColours, DEFAULT_PAD, WINDOW_LIMITS } from "./hex_canvas.mjs";
import { CodedError } from "../core/bigint_utils.mjs";
import { colourName } from "../core/regions.mjs";

// fileStem({ colour, genus, area }) is the start of the file names of the downloads of a region:
// kronecker-<colour word>-genus<g>-area<n> (green for an unknown colour).
export function fileStem(r) {
  return `kronecker-${colourName(r.colour) || colourName(1)}-genus${r.genus}-area${r.area}`;
}

// jsonBlob(obj) is a JSON download: one space of indent and a final new line.
export function jsonBlob(obj) {
  return new Blob([JSON.stringify(obj, null, 1) + "\n"], { type: "application/json" });
}

// witnessFile(witness) is the download of a witness (a kron_hex_witness_v1 object: colour, genus, area, ...), the same
// on the Explorer and the Algorithm page: { blob, name: "<fileStem>.witness.json" }.
export function witnessFile(witness) {
  return { blob: jsonBlob(witness), name: `${fileStem(witness)}.witness.json` };
}

const CAPTION_FONT = "13px sans-serif";
const CAPTION_LINE = 18;
const CAPTION_PAD = 14;

function newCanvas(w, h) {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

function captionLines(caption) {
  if (caption === undefined || caption === null || caption === "") return [];
  const list = Array.isArray(caption) ? caption : String(caption).split("\n");
  return list.map((t) => String(t));
}

// exportCanvas({ source, bounds, cell, overlays, caption, pad }) draws the export into a new canvas and returns
// { canvas, meta }. meta: { width, height (of the image), pictureWidth, pictureHeight (= fittedWindow(bounds, cell,
// pad)), pictureLeft (x offset of the picture, > 0 only when the caption is wider), originX, originY (image pixel
// centre of cell (0, 0)), cell, pad, captionTop, captionLines, colours, ms }. caption: a string (lines split at
// "\n") or a list of lines. Extra options: signal, onProgress, soft (as renderWindow).
export async function exportCanvas({ source, bounds, cell = 12, overlays = [], caption, pad = DEFAULT_PAD, signal, onProgress, soft = false } = {}) {
  const t0 = performance.now();
  const colours = exportColours();
  const fw = fittedWindow(bounds, cell, pad);
  const pic = newCanvas(fw.width, fw.height);
  const r = await renderWindow(pic, { source, bounds, cell, overlays, pad, dpr: 1, colours, signal, onProgress, soft });
  const lines = captionLines(caption);
  if (lines.length === 0) {
    return {
      canvas: pic,
      meta: { width: r.width, height: r.height, pictureWidth: r.width, pictureHeight: r.height, pictureLeft: 0, originX: r.originX, originY: r.originY, cell, pad, captionTop: null, captionLines: [], colours, ms: performance.now() - t0 },
    };
  }
  const measure = newCanvas(1, 1).getContext("2d");
  measure.font = CAPTION_FONT;
  const textW = Math.ceil(Math.max(...lines.map((t) => measure.measureText(t).width)));
  const W = Math.max(r.width, textW + 16);
  const H = r.height + CAPTION_LINE * lines.length + CAPTION_PAD;
  if (W > WINDOW_LIMITS.maxSide || H > WINDOW_LIMITS.maxSide || W * H > WINDOW_LIMITS.maxPixels) {
    throw new CodedError("too_large", `the image with its caption would be ${W} x ${H} pixels, over the limits`);
  }
  const out = newCanvas(W, H);
  const c = out.getContext("2d");
  c.fillStyle = colours.canvas;
  c.fillRect(0, 0, W, H);
  const left = Math.floor((W - r.width) / 2);
  c.drawImage(pic, left, 0);
  c.fillStyle = colours.text;
  c.font = CAPTION_FONT;
  c.textBaseline = "top";
  const top = r.height + 8;
  lines.forEach((t, k) => c.fillText(t, 8, top + CAPTION_LINE * k));
  return {
    canvas: out,
    meta: { width: W, height: H, pictureWidth: r.width, pictureHeight: r.height, pictureLeft: left, originX: r.originX + left, originY: r.originY, cell, pad, captionTop: top, captionLines: lines, colours, ms: performance.now() - t0 },
  };
}

// exportPng({ source, bounds, cell, overlays, caption }) returns a promise of a PNG Blob of the window
// fittedWindow(bounds, cell, pad) (pad default 3.5 hexes, cell default 12 pixels), see exportCanvas. The look of
// the examples: { soft: true, overlays: [region(shape)] } or overlays [fadeOutside(shape), outline(shape)].
export async function exportPng(opts = {}) {
  const { canvas } = await exportCanvas(opts);
  if (typeof canvas.convertToBlob === "function" && typeof canvas.toBlob !== "function") return canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new CodedError("encode_failed", "the browser could not encode the PNG"))), "image/png");
  });
}

// downloadBlob(blob, name) offers a Blob to the viewer as a file download.
export function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
