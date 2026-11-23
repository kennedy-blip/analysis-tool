# Migration plan and status

Branch: `arena/0fbcf013-analysis-tool` (from `440f1c18` on `main`).
Rule for the whole migration: **parallel development, small verified steps, and
no production cutover based only on a successful local build.**

| # | Step | Status |
| --- | --- | --- |
| 1 | Inspect the app and deployment, record baseline | ✅ done — [baseline.md](baseline.md) |
| 2 | Protect production (feature branch, separate directory, no Render changes) | ✅ done |
| 3 | Choose a target the environment can build | ✅ done — Python 3.11 + Jinja2 |
| 4 | Minimal independent build, verified before content migration | ✅ done |
| 5 | Move data and content in small steps | ✅ done |
| 6 | Preserve behaviour with tests | ✅ done — 88 Python + 74 Node + 106 DOM checks |
| 7 | Prepare staging, confirm Render's real settings, verify its build | 🔶 staged — blueprint committed, dashboard settings still to be read |
| 8 | Cut over only with evidence | ⬜ not started — gated on step 7 |
| 9 | Clean up old source and tooling, update docs | ⬜ not started — gated on step 8 |

## Step 1 — inspect first

Everything found in the repository and everything that could *not* be verified
from this sandbox (the live URL is unreachable here) is written down in
[baseline.md](baseline.md), including the entry point, build and publish
commands, dependency list, the absence of tests and CI, and the fact that Render's
configuration lives only in the dashboard.

## Step 2 — protect production

* All work is on the assigned feature branch; `main` is untouched.
* The legacy app is unmodified: `package.json`, `package-lock.json`,
  `vite.config.ts`, `tsconfig.json`, `postcss.config.js`, `index.html` and all of
  `src/` are byte-identical to the baseline commit, so Render keeps building and
  serving exactly what it serves today.
* The replacement lives in a separate directory, `site/`, with its own config,
  templates, assets, build script and tests.
* Nothing was merged and no Render setting was changed. `render.yaml` at the
  repository root declares **one new staging service only** and never mentions
  the production service.

## Step 3 — choose a buildable target

Runtime availability checked in this environment:

| Runtime | Available | Note |
| --- | --- | --- |
| Python | ✅ 3.11.2 | `python3`, `pip3` present |
| Node.js | ✅ v22.22.3 | used for parity tests and the legacy build |
| Ruby | ❌ not installed | `ruby: command not found` |

Ruby was not an option, so the target is **Python 3.11 + Jinja2** producing a
static site: one build dependency (`Jinja2`), no framework runtime, and the
calculations stay in the browser where the data already lives. Structure agreed
before scaffolding:

```
site/
├── build.py            # renders templates -> site/public
├── stats.py            # Python port of src/utils/statistics.ts
├── sample.py           # seeded sample-dataset generator
├── jsfmt.py            # JS-compatible toFixed / toLocaleString
├── site.json           # content + behaviour configuration
├── requirements.txt    # Jinja2 only
├── templates/          # base, 5 view partials, macros (icons, upload), 404
├── assets/             # css, js (ES modules), img, vendored SheetJS
├── tests/              # python unittest, node parity, jsdom harness, golden
└── public/             # build output (gitignored, published by Render)
```

## Step 4 — minimal independent build first

`build.py`, `site.json`, the base template and stub assets were added and the
build was run immediately. The first green build produced `index.html`,
`404.html`, both data JSON files and the copied assets, which were inspected
(injected config, embedded statistics, pre-rendered calculator defaults) before
any content was migrated. Two real defects surfaced at this stage and were fixed
before proceeding: an unbalanced `{% if %}` in the generated icon macro, and
`site.json` referencing icon names (`table`, `bar-chart`, `rows`, `columns`,
`spreadsheet`) that are not the lucide identifiers the components use. Build-time
config validation was added so that class of error fails the build instead of
rendering an empty glyph.

## Step 5 — move data and content in small steps

The legacy app was treated as read-only reference:

1. `src/utils/statistics.ts` → `site/stats.py` (build-time engine) and
   `site/assets/js/statistics.js` (browser engine).
2. Sample dataset exported to static JSON: `data/sample_sales_data.json`
   (200 × 10) plus pre-computed `data/sample_stats.json`.
3. Each view recreated as a Jinja2 partial with matching copy, structure and
   control defaults; interactions rewritten as framework-free ES modules
   (`store.js`, `parser.js`, `views/*.js`).
4. Recharts replaced by `assets/js/charts.js` (inline SVG, same palette, grid,
   angled labels, tooltips, pie legend).
5. Tailwind replaced by a hand-written design system in `assets/css/styles.css`
   using the same Tailwind palette values, radii and shadows.
6. `lucide-react` replaced by an inline SVG sprite extracted from
   `lucide-static@0.563.0`.
7. SheetJS vendored at `assets/vendor/xlsx.full.min.js` (0.18.5, the version the
   legacy lockfile resolves to) so no CDN or npm install is needed at runtime.

Obsolete tooling was **not** carried over: no Vite, no TypeScript, no Tailwind,
no React, no `vite-plugin-singlefile`, and no secrets — the app has none.

## Step 6 — preserve behaviour with tests

| Suite | Scope | Result |
| --- | --- | --- |
| `site/tests/test_statistics_parity.py` | Python engine vs golden values from the legacy TypeScript | ✅ |
| `site/tests/parity/statistics.test.mjs` | Browser engine vs the same golden values | ✅ 51 checks |
| `site/tests/parity/views.test.mjs` | Aggregation, binning, caps, pagination logic | ✅ 23 checks |
| `site/tests/test_jsfmt.py` | `toFixed` / `toLocaleString` vs values captured from V8 | ✅ 246 comparisons |
| `site/tests/test_sample.py` | Deterministic sample dataset shape, ranges, naming | ✅ |
| `site/tests/test_build.py` | Generated pages, embedded data, asset refs, ids used by JS, reproducibility | ✅ |
| `site/tests/test_config.py` | Config vs constants read out of the legacy components | ✅ |
| `site/tests/dom/harness.mjs` | jsdom boots the built page and drives the UI end to end | ✅ 106 checks |

Run everything with `./site/run_tests.sh`. CI runs the same suites plus a build
of the legacy app, so both stacks stay green until cutover
(`.github/workflows/static-site.yml`).

Bugs the suites caught during migration, all fixed in the new code:

* `mode()` tie-breaking — JavaScript iterates `Object.entries` with integer-like
  keys first in ascending numeric order, so `mode([5230, 1875, …, 760])` returns
  `760`, not the first inserted value. `stats.py` now reproduces that ordering
  (`js_object_entries`).
* `StatCard` formatting — React prints raw numbers, so `6044` must not become
  `6,044`.
* `toFixed` rounding — V8 rounds the exact binary value half away from zero
  (`(1.005).toFixed(2) === "1.00"`), and `toLocaleString` groups the shortest
  decimal representation (`(9.999999e20).toLocaleString()`).
* A malformed `</button>` in the table footer template.

Browser review: the built site is served locally (`python3 -m http.server 4173
--directory site/public`) and was driven through every view by the jsdom harness.
A side-by-side comparison with the live production URL still has to be done by a
human, because that host is unreachable from this sandbox.

## Step 7 — staging (current step)

`render.yaml` defines `analysis-tool-static-staging` as a Static Site with
`rootDir: site`, `publishDir: public`, a build command that installs Jinja2,
builds and runs the Python tests, and cache headers for the hashed assets.
Remaining work, all in the Render dashboard: read the production service's actual
runtime, root directory, build command and publish directory; create the staging
service from the blueprint; confirm it builds and behaves; then compare staging
against production using the checklist in [render.md](render.md).

## Step 8 — cutover (gated)

Not started. Requires a green staging deployment, a passed parity checklist, and
an explicit decision to repoint production. Rollback plan documented in
[render.md](render.md) § 6.

## Step 9 — cleanup (gated)

Not started. Only after production serves the new build: delete `src/`, the root
`index.html`, `package.json`, `package-lock.json`, `vite.config.ts`,
`tsconfig.json`, `postcss.config.js`, remove the `legacy-app` CI job, rewrite the
README, and check GitHub's reported language breakdown for the repository.
