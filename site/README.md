# DataLens static site

The Python 3.11 + Jinja2 build that replaces the legacy React/Vite app. It
generates a dependency-free static bundle in `site/public/` that Render publishes
as a Static Site. All dataset processing still happens in the browser — uploaded
files never leave the machine.

```
site/
├── build.py                 # renders templates + exports data -> public/
├── site.json                # content and behaviour configuration
├── stats.py                 # Python port of src/utils/statistics.ts (build time)
├── sample.py                # seeded generator for the bundled sample dataset
├── jsfmt.py                 # V8-compatible toFixed / toLocaleString
├── requirements.txt         # Jinja2 only
├── run_tests.sh             # every check, in order
├── templates/
│   ├── base.html.j2         # app shell: sidebar, header, sprite, scripts
│   ├── index.html.j2        # composes the five views
│   ├── 404.html.j2
│   ├── macros/              # icons (lucide-static 0.563.0), upload zone
│   └── views/               # overview, data, statistics, probability, visualization
├── assets/
│   ├── css/styles.css       # design system replacing Tailwind
│   ├── js/                  # ES modules: app, store, parser, statistics, charts,
│   │                        # aggregate, paging, views/*
│   ├── img/favicon.svg
│   └── vendor/              # SheetJS xlsx.full.min.js 0.18.5 + license
├── tests/
│   ├── golden_stats.json    # captured from the legacy TypeScript engine
│   ├── jsfmt_expectations.json  # captured from V8
│   ├── golden/              # regenerate + compare golden values
│   ├── parity/              # node --test suites for the browser engine
│   ├── dom/                 # optional jsdom harness that drives the built pages
│   └── test_*.py            # python unittest suites
└── public/                  # build output (gitignored)
```

## Build

```bash
cd site
python3 -m venv .venv && . .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
python3 build.py                                # writes site/public/
python3 build.py --output /tmp/preview          # or build elsewhere
```

The build prints a summary of pages, data files and asset count, and writes
`public/build-manifest.json` with a truncated SHA-256 for every artifact. Two
builds of the same commit are byte-identical.

## Preview locally

```bash
python3 -m http.server 4173 --bind 0.0.0.0 --directory site/public
# http://localhost:4173
```

Deep links work with a hash: `index.html#statistics`.

## Test

```bash
./site/run_tests.sh            # build + python + node parity + golden + DOM harness
./site/run_tests.sh --quick    # build + python only
```

Individually:

```bash
cd site && python3 -m unittest discover -s tests -t tests   # 107 tests
node --test "site/tests/parity/*.test.mjs"                  # 74 checks
cd site/tests/dom && npm install && npm test                # 106 checks (needs a build first)
```

`site/tests/golden/generate_golden.mjs` re-derives `golden_stats.json` by
executing the legacy `src/utils/statistics.ts`; `run_tests.sh` does that into a
temp file and fails if the values drift. Once the legacy source is deleted the
committed golden file remains the frozen reference and that step is skipped.

## Configure

Everything user-visible lives in `site.json`: site identity, the five views and
their subtitles, upload copy and accepted extensions, sample-dataset row count
and seed, table page size, chart caps and the 18-colour palette, probability
modes, chart types and aggregations. `build.py` validates icon names against the
bundled sprite and fails the build on an unknown one.

Behaviour constants in `site.json` are asserted against the legacy components by
`tests/test_config.py`, so they cannot drift silently.

## Deploy

Render publishes this directory as a Static Site. See the root
[`render.yaml`](../render.yaml) (staging service) and
[`docs/migration/render.md`](../docs/migration/render.md) for the production
settings, the acceptance checklist and the rollback plan.

| Setting | Value |
| --- | --- |
| Root directory | `site` |
| Build command | `pip install -r requirements.txt && python3 build.py && python3 -m unittest discover -s tests -t tests` |
| Publish directory | `public` |
| Environment | `PYTHON_VERSION=3.11.9` |
| Runtime dependencies | none — static files only |
