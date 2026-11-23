# Behaviour parity map

Legacy component → static-site equivalent, with the tests that pin each
behaviour down. "Identical" means the same expression, the same constants and the
same rendered text.

## Shell

| Behaviour | Legacy | New | Parity |
| --- | --- | --- | --- |
| 5 tabs, sidebar nav | `App.tsx` `useState<Tab>` | `assets/js/app.js` `setActiveTab` | identical ids/labels/subtitles (`test_config.py`) |
| Header title + subtitle per tab | `App.tsx` | server-rendered `[data-title]` / `[data-subtitle]` | identical copy (`test_build.py`) |
| Mobile drawer + overlay | `App.tsx` `sidebarOpen` | `.sidebar.is-open` + `#sidebar-overlay` | identical breakpoints (1024px) |
| Dataset status card in sidebar | `DataContext.datasetInfo` | `renderStatus()` in `app.js` | `200 rows × 10 cols` format (DOM harness) |
| State lifetime | React state, lost on reload | `store.js`, lost on reload | identical |
| Deep link | none | `index.html#statistics` | **additive** |

## Overview

| Behaviour | Legacy | New | Parity |
| --- | --- | --- | --- |
| Drag & drop + click to browse | `FileUpload.tsx` | `assets/js/parser.js`, `views/overview.js` | identical accept list, drop copy, error copy |
| `.xlsx/.xls/.csv` only | extension check + error string | same check, strings from `site.json` | `test_config.py` reads the legacy strings |
| Parse with SheetJS | `XLSX.read(buffer)` + `sheet_to_json` first sheet | same, vendored `xlsx.full.min.js` 0.18.5 | identical library version |
| Empty file error | `'The file appears to be empty'` | same | identical |
| Loading spinner | `isLoading` | `#overview-loading` | identical copy |
| Dataset card: rows, columns, upload time, `~KB` | `DataOverview.tsx` | `renderOverview()` | `JSON.stringify(data).length / 1024` to 2dp (harness) |
| Numbered column chips | `DataOverview.tsx` | `renderOverview()` | `1. id` … format (harness) |
| Clear & Upload New | `setData([])` | `clearDataset()` | harness verifies reset of every view |
| Sample dataset | 200 rows, `Math.random()` | 200 rows from static JSON, seeded | **intentional change**, see below |
| Three feature cards | `DataOverview.tsx` | `site.json` `features` | copy asserted against the legacy source |

## Data Table

| Behaviour | Legacy | New | Parity |
| --- | --- | --- | --- |
| 15 rows per page | `const rowsPerPage = 15` | `site.json` `table.rows_per_page` | `test_config.py` reads the legacy literal |
| Five-slot page window | `Math.min(5, totalPages)` + three-branch rule | `assets/js/paging.js` `pageWindow` | `views.test.mjs` (early/middle/late/short ranges) |
| Search | any cell, case-insensitive `includes` | `filterRows()` | identical (harness compares against an independent filter) |
| Search resets to page 1 | `setCurrentPage(1)` | `view.page = 1` | identical |
| Sort | nulls last, numeric fast path, else `localeCompare`, toggling asc/desc | `sortRows()` | identical (harness: 1 → 200 → 199) |
| Row numbers, `-` for null cells | `DataTable.tsx` | `renderBody()` | identical |
| "Showing X - Y of Z rows" | `DataTable.tsx` | `paging.js` `summaryText` | `views.test.mjs` |

## Statistics

| Behaviour | Legacy | New | Parity |
| --- | --- | --- | --- |
| Six summary cards | `Statistics.tsx` | server-rendered shells + `views/stats.js` | identical labels/colours |
| Expandable per-column cards | `ColumnStatsCard` | `.column-card` + `aria-expanded` | identical stat list and order |
| Numeric vs string/mixed stat sets | `Statistics.tsx` | `numericCards()` / `categoricalCards()` | harness asserts a text column shows no Mean |
| Value formatting | `Number.isInteger(v) ? v : v.toFixed(4)` | `formatStatValue()` | `test_jsfmt.py` + harness |
| Calculation engine | `src/utils/statistics.ts` | `assets/js/statistics.js` (browser), `stats.py` (build) | golden values from the legacy TS: 51 Node checks, 88 Python tests |

## Probability

| Behaviour | Legacy | New | Parity |
| --- | --- | --- | --- |
| Basic P(A) = fav/total, `0` when total is 0 | `Probability.tsx` | `recalcBasic()` | identical incl. the bare `0` rendering |
| C(n,r) / P(n,r), `N/A` above n=170 | `Probability.tsx` | `recalcCounting()` | harness checks 120 / 720 / N/A |
| Binomial P(X=k), μ = np, σ = √(np(1-p)) | `Probability.tsx` | `recalcBinomial()` | 24.6094% / 5.0000 / 1.5811 pre-rendered at build time |
| Poisson P(X=k), μ = λ, σ = √λ | `Probability.tsx` | `recalcPoisson()` | 14.0374% / 5 / 2.2361 |
| Normal z-score + PDF | `Probability.tsx` | `recalcNormal()` | z(90, 80, 5) = 2.0000, PDF(0,0,1) = 0.398942 |
| Correlation r, covariance, R², strength label | `Probability.tsx` | `recalcCorrelation()` | identical thresholds 0.7 / 0.3 and sign wording |
| Needs ≥ 2 numeric columns, else message | `Probability.tsx` | `#correlation-empty` | identical copy |
| Default input values | component state | server-rendered `value=` attributes | `test_build.py` |

## Visualization

| Behaviour | Legacy | New | Parity |
| --- | --- | --- | --- |
| Six chart types | Recharts | `charts.js` inline SVG | identical ids/labels; harness renders all six |
| Aggregation sum/avg/count/min/max | `Visualization.tsx` | `aggregate.js` | `views.test.mjs` compares against an independent implementation |
| Descending sort, 50-category cap | `.sort(...).slice(0, 50)` | `computeChartData()` | identical |
| Scatter 500-point cap | `.slice(0, 500)` | identical | `views.test.mjs` |
| Histogram `min(20, ceil(sqrt(n)))` bins, inclusive last edge | `Visualization.tsx` | `aggregate.js` | identical, incl. `x.x-y.y` labels |
| Pie: 12 slices, `name (NN%)` labels, legend | Recharts `<Pie>` | `drawPie()` | harness asserts slice + legend counts |
| X-axis options numeric-only for scatter/histogram | `Visualization.tsx` | `xAxisOptions()` | identical |
| Y hidden for histogram, aggregation hidden for scatter/histogram | `Visualization.tsx` | `updateControls()` | harness |
| 18-colour palette | `COLORS` array | `site.json` `charts.palette` | `test_config.py` parses the legacy array |
| `Number(null) === 0` counts as a zero value | JS semantics | preserved deliberately | documented in `views.test.mjs` |

## Styling and assets

| Concern | Legacy | New | Parity |
| --- | --- | --- | --- |
| Utility CSS | Tailwind CSS 4 (built by Vite) | hand-written `styles.css` design system | same Tailwind palette values, radii, shadows, breakpoints |
| Icons | `lucide-react@^0.563.0` | inline sprite from `lucide-static@0.563.0` | same release, same 24×24 stroke-2 paths |
| Charts | Recharts 3.7 | dependency-free SVG | same colours, dashed grid, −45° labels, tooltips |
| Spreadsheet parsing | `xlsx` 0.18.5 from npm | vendored 0.18.5 build | same library, no CDN |
| Bundle shape | one inlined HTML file (`vite-plugin-singlefile`) | `index.html` + hashed asset URLs | **intentional change**, see below |

## Intentional changes

These are the only deliberate deviations. Each is recorded here so a reviewer can
accept or reject it explicitly.

1. **Deterministic sample dataset.** The legacy generator used `Math.random()`,
   so the demo data differed on every click and could not be tested or exported.
   `site/sample.py` keeps the same columns, ranges, distributions and per-row draw
   order but seeds the PRNG (`seed: 20260101` in `site.json`), and the rows are
   exported at build time to `data/sample_sales_data.json`. The button still says
   "Generate Sample Dataset" and still produces 200 × 10 rows.
2. **Multi-file output instead of a single inlined HTML.** The legacy build
   inlined everything into one ~1 MB document. The static site publishes
   `index.html` (58 KB) plus separately cacheable assets with `?v=<sha256>`
   cache-busting, and sets `Cache-Control` accordingly in `render.yaml`. Same
   single-page behaviour, better caching, no build-time Node dependency.
3. **Pre-rendered first paint.** The default calculator results, the icon sprite,
   the navigation and the sample dataset's statistics are rendered by Jinja2 at
   build time, so the page is meaningful before any JavaScript runs. The legacy
   app rendered nothing until React hydrated.
4. **Deep links.** `index.html#statistics` opens a specific view. Additive; the
   default view is unchanged.
5. **Accessibility additions.** `aria-current`, `aria-expanded`, `aria-selected`,
   `aria-sort`, `aria-label` on icon-only buttons, keyboard-activated sort
   headers, `role="tablist"`. Additive; no visual change.

Nothing else differs: no feature was dropped, no copy was rewritten, and no
calculation was changed.
