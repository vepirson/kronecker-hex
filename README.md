# kronecker-hex

The hexagonal grid whose cells are the Kronecker symbol of any input size $x,d$.

Plain ES modules, exact big-integer arithmetic (`bigint`), using KaTeX in `vendor/katex/`.

The code is under the MIT licence (see [`LICENSE`](LICENSE)).

The website supports **colorblind** mode and **dark** mode.

## Credits

The question: [math.stackexchange.com/questions/5145414](https://math.stackexchange.com/questions/5145414).

- Source is the MSE question above, asked by user fgrieu, whose viewer is at https://ai-me.fr/.
- Authors are Claude Fable 5.2, and the user Vepir from the answer to the MSE question above.

## Pages

| Page | Route |
|---|---|
| Explorer | `#/explore`, `#/w/<token>` |
| Shape editor | `#/edit` |
| Algorithm | `#/algorithm`, `#/algorithm/w/<token>` (the earlier addresses `#/lab...` lead there) |
| Proofs | [https://math.stackexchange.com/q/5145414/318073](https://math.stackexchange.com/q/5145414/318073) |
| Gallery | `#/gallery` |

## Run it locally

Node 24 or later:

```
npm run serve
```

then open the printed address (default `http://127.0.0.1:8000/`). `node tools/serve.mjs --port 9000` picks another
port, `--port 0` a free one. 

Any other static file server works too, every URL inside the code is relative to its
module (`new URL(path, import.meta.url)`), so the site also runs under a sub-path such as `/kronecker-hex/`.

## Deploy

`.github/workflows/pages.yml` runs the tests on every push to `main` and on every pull request, and after a push to
`main` publishes the repository as it is (there is no build step) to GitHub Pages. 

For the workflow to deploy, the repository setting Pages must be set to "Source: GitHub Actions".

## Tests

```
npm test
```

runs `node --test` from the repository root: every file named `*.test.mjs` under `tests/`. One folder alone:
`node --test "tests/core/*.test.mjs"`. 

With the environment variable `FULL=1` the token test also tries all 63
replacements at every position of one token (26586 cases, a few minutes).

The Node suite covers everything that runs without a browser. Three development pages in `tests/browser/` show
parts of the site on their own, served by the local server like the site itself (for example
`http://127.0.0.1:8000/tests/browser/kit_demo.html`):

| Page | What it is for |
|---|---|
| `kit_demo.html` | the UI kit: the interactive hex view, a fixed window, big numbers, the stepper, the PASS and FAIL badges |
| `floodfill_demo.html` | the region worker: fills the cells given as `?cells=x,d[,cap];x,d;...` and prints the records as JSON |
| `live_timing.html` | a live construction in the worker (`?preset=c100\|genus0hex\|maxhex&colour=green\|red`), with the time of every row |

Each page module also exports `testHandles()`: read-only handles on the mounted page (its view, its state, the
shown result) for automated checks in a browser. They are not part of the site's interface.

## Layout

| Folder | Content |
|---|---|
| `index.html` | the single HTML page: header and the router |
| `src/core/` | exact arithmetic: Kronecker symbol, primes, CRT, SHA-256, grid geometry, regions, shapes, admissibility |
| `src/formats/` | the witness, packed and token formats (defined in [`docs/formats.md`](docs/formats.md)) |
| `src/construct/` | the construction of a region of a given shape (small primes, row primes, row solver, verification) and its replay |
| `src/render/` | the hex canvas (interactive view and fixed windows), overlays, PNG export |
| `src/workers/` | the module workers: region flood fill and witness verification, the construction |
| `src/ui/` | the router, the store, the pages (`pages/`), the shape editor (`editor/`), the gallery cards (`gallery/`) and the widgets (`widgets/`) |
| `content/` | the texts of the pages as JSON (the Algorithm page's steps in `content/lab/`) |
| `styles/` | the stylesheets |
| `data/` | shipped shapes, witnesses and tokens, the gallery list and the natural examples |
| `docs/` | the definition of the file formats |
| `vendor/katex/` | KaTeX (script, stylesheet and fonts) for the formulas |
| `tests/` | the test suite and its fixtures (`tests/fixtures/MANIFEST.json` lists the size and sha256 of every fixture and data file), and the development pages of `tests/browser/` |
| `tools/serve.mjs` | the local static server |
| `tools/build_family_tokens.mjs` | writes the stored tokens of the Gallery's family cards from the second page of each family on (`data/family_tokens_v2.json`, the first page of each family is built in the browser): `node tools/build_family_tokens.mjs <new file>` runs every construction with a progress line per member and never writes over a file, so a regenerated file gets a new name and is compared with the shipped one |
| `tools/build_lab_search.mjs` | writes the tries of the Algorithm page's presets that replay a stored token (`data/lab_search.json`: the rejected candidates $d_0$ and the residues $R$ tried, from the live run of each preset, which gives the token's numbers): `node tools/build_lab_search.mjs <new file>` prints a progress line per preset and never writes over a file |
| `.github/workflows/` | the workflow that tests and publishes the site |
