// The static route manifest. Each entry is { pattern, page, layout, title, load }: the pattern is a hash path of
// literal segments and ":name" parameters, page the page it belongs to (the key of the header's entry and of its icon
// in PAGE_ICONS of widgets/icons.mjs), layout is "app" (the page fills the height under the header and never
// scrolls) or "doc" (one centred text column), title is the name of the page in the document title (the word of the
// header's link), load() is the dynamic import of the page module (which exports mount(root, ctx)). The router sets
// the layout as data-layout on <body> and the document title before it mounts the page.

// The path of the Explorer, and the view every visit starts from: the address "#/" (or none) is replaced by the
// Explorer at (HOME_VIEW.x, HOME_VIEW.d) at HOME_VIEW.cell pixels per cell, the view of the Explorer's reset button.
export const EXPLORE_PATH = "#/explore";
export const HOME_VIEW = Object.freeze({ x: 0n, d: 0n, cell: 20 });
// The path of the shape editor.
export const EDIT_PATH = "#/edit";
// The path of the Algorithm page (the page of the construction, "lab" in the code), and its earlier path, kept as an
// alias: every address under LAB_ALIAS is replaced by the same address under LAB_PATH (aliasRedirect of router.mjs).
export const LAB_PATH = "#/algorithm";
export const LAB_ALIAS = "#/lab";

// The query key of the Algorithm page's list of shapes (its start panel): #/algorithm?shapes=1 shows the list whatever
// the page's input and the selection are (the bare #/algorithm runs the input when there is one).
export const SHAPES_QUERY = "shapes";

// homeQuery() is the address query of HOME_VIEW: { x, d, z }.
export function homeQuery() {
  return { x: String(HOME_VIEW.x), d: String(HOME_VIEW.d), z: String(HOME_VIEW.cell) };
}

// The region of the home cell, as the Explorer's default state selects it: the cell (HOME_VIEW.x, HOME_VIEW.d) alone is
// a region of type 0 (offsets from that cell, its seed the cell itself). Every visit starts with it as the selection
// of the site (appState of router.mjs), wherever the visit starts.
export const HOME_REGION = Object.freeze({ shape: Object.freeze([Object.freeze([0, 0])]), seed: Object.freeze([0, 0]), colour: 0 });

export const ROUTES = [
  { pattern: EXPLORE_PATH, page: "explore", layout: "app", title: "Explore", load: () => import("./pages/explore.mjs") },
  { pattern: "#/w/:token", page: "explore", layout: "app", title: "Explore", load: () => import("./pages/explore.mjs") },
  { pattern: EDIT_PATH, page: "edit", layout: "app", title: "Edit", load: () => import("./pages/edit.mjs") },
  { pattern: LAB_PATH, page: "lab", layout: "app", title: "Algorithm", load: () => import("./pages/lab/index.mjs") },
  { pattern: `${LAB_PATH}/w/:token`, page: "lab", layout: "app", title: "Algorithm", load: () => import("./pages/lab/index.mjs") },
  { pattern: "#/gallery", page: "gallery", layout: "doc", title: "Gallery", load: () => import("./pages/gallery.mjs") },
];

// The title of the site (the <title> of index.html, shown until the first page is mounted).
export const SITE_TITLE = "Kronecker Hex: the Kronecker symbol on the hexagonal grid";
// The short name of the site after the page name in every document title.
export const SITE_NAME = "Kronecker Hex";

// pageTitle(route) is the document title of a route entry: "<title> - Kronecker Hex", SITE_TITLE for an entry without
// a title, "Page not found - Kronecker Hex" for null (no route matches).
export function pageTitle(route) {
  if (!route) return `Page not found - ${SITE_NAME}`;
  return route.title ? `${route.title} - ${SITE_NAME}` : SITE_TITLE;
}

// The two layouts.
export const LAYOUTS = Object.freeze(["app", "doc"]);

// layoutOf(route) is the layout of a route entry: "app" when its layout says so, "doc" otherwise (also for null, the
// page that is not found).
export function layoutOf(route) {
  return route && route.layout === "app" ? "app" : "doc";
}
