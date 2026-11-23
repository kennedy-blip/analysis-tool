# Render: staging first, production last

Production today: **https://analysis-tool-82jq.onrender.com** — a Render Static
Site built from the repository root with the legacy Vite pipeline. Its settings
live only in the Render dashboard; the repository contained no `render.yaml`
before this migration.

Nothing in this branch changes that service. `render.yaml` declares one **new**
staging service and never references production.

## 1. What the blueprint creates

```yaml
type: static
name: analysis-tool-static-staging
rootDir: site
env: static
buildCommand: pip install -r requirements.txt && python3 build.py && python3 -m unittest discover -s tests -t tests
publishDir: public
envVars: PYTHON_VERSION=3.11.9, NODE_VERSION=22.11.0
```

The build command runs the test-suite before publishing, so a broken build cannot
produce a deployable `public/` directory.

## 2. Read production's real settings first

Do not assume the dashboard matches the repository. Before touching anything,
record these five values from the production service in Render →
`analysis-tool` → Settings, and paste them into the table below:

| Setting | Where to look | Value (fill in) |
| --- | --- | --- |
| Service type | Settings → General | ☐ Static Site ☐ Web Service |
| Runtime / environment | Settings → General (or Environment) | |
| Root directory | Settings → Build & deploy | |
| Build command | Settings → Build & deploy | |
| Publish directory | Settings → Build & deploy | |
| Node/Python version | Settings → Environment | |
| Branch deployed | Settings → Build & deploy | |
| Custom domain / TLS | Settings → Domains | |

Two outcomes are possible and both are handled below:

* **Static Site with root `/` and publish `dist/`** — the migration is a drop-in:
  only the root directory, build command and publish directory change.
* **Web Service running `vite preview`/`serve`** — then the new build must be
  served the same way, or the service type must change. Do that on staging first
  and treat it as a separate decision.

## 3. Verify the staging build environment

`env: static` with `PYTHON_VERSION` is the assumption this blueprint makes.
Confirm it on the staging deploy before trusting it:

1. Create the service from the blueprint (Render → New → Blueprint → this repo →
   this branch), or create a Static Site manually with the values from § 1 of
   `render.yaml`.
2. Open the first deploy log and check:
   * `python3 --version` reports 3.11.x (add `python3 --version` to the build
     command temporarily if the log does not show it);
   * `pip install -r requirements.txt` installs Jinja2 3.1.6;
   * `python3 build.py` prints `Built DataLens static site -> /opt/render/project/site/public`;
   * `Ran 107 tests ... OK`.
3. If Python is unavailable or pinned to another version, fall back in this order:
   * set `PYTHON_VERSION` explicitly to a value Render lists for static builds;
   * or switch the staging service to a Docker static site using a
     `python:3.11-slim` image that runs `build.py` and serves `public/`;
   * or, as a last resort, commit `site/public/` and publish it directly — least
     preferred, because generated files then live in Git.
4. Confirm the deploy URL serves the app: `/` returns the shell, `/404.html`
   renders for an unknown path, and `/assets/js/app.js?v=…` returns
   `Content-Type: text/javascript` with the `Cache-Control` from the blueprint.

## 4. Staging acceptance checklist

Run these against the staging URL. Every item is already automated locally
(`./site/run_tests.sh`); this is the human, real-browser pass.

- [ ] Overview: drag & drop a `.csv` — table, statistics and charts populate.
- [ ] Overview: upload an `.xlsx` — parses via the vendored SheetJS.
- [ ] Overview: upload a `.txt` — error "Please upload an Excel (.xlsx, .xls) or CSV file".
- [ ] Overview: "Generate Sample Dataset" — 200 rows × 10 columns, `~KB` estimate shows.
- [ ] Overview: "Clear & Upload New" — every view returns to its empty state.
- [ ] Data Table: 15 rows per page, pager window slides correctly, search filters, header sort toggles asc/desc.
- [ ] Statistics: six summary cards, per-column cards expand, numeric columns show mean…kurtosis, text columns show most/least common.
- [ ] Probability: defaults show 24.6094% / 14.0374% / 0.398942; C(10,3)=120, P(10,3)=720, n=200 → N/A; correlation on two numeric columns.
- [ ] Visualization: bar, line, area, pie (with legend), scatter, histogram all draw; selects hide/show per chart type.
- [ ] Mobile width (≤ 1023px): drawer opens, overlay closes it, Escape closes it.
- [ ] Hard reload with no dataset: every view shows its empty state (no persistence, as before).
- [ ] No console errors; no request to any CDN.

## 5. Parity comparison against production

Because this sandbox cannot reach `analysis-tool-82jq.onrender.com` (TLS egress is
blocked), the side-by-side check has to happen in a normal browser:

1. Open production and staging in two windows at the same viewport.
2. Load the same CSV into both.
3. Compare, per view: summary numbers, every expanded column statistic, all
   probability outputs for identical inputs, and each chart's shape and ordering.
4. Screenshot both and diff visually for spacing, colour and icon differences.
5. Record the result in the pull request description. Any difference is either a
   bug in the new build or an accepted intentional change listed in
   [parity.md](parity.md) §"Intentional changes".

## 6. Cutover and rollback

Cutover is a separate, deliberate act — never a side effect of merging this
branch.

**Preconditions (all required):**

- [ ] § 2 table filled in from the dashboard.
- [ ] Staging deployed from this branch, build log shows tests passing.
- [ ] § 4 checklist complete on staging.
- [ ] § 5 comparison complete, differences explained.
- [ ] CI green on the branch, including the `legacy-app` job.

**Cutover (choose one):**

* *Preferred, smallest blast radius:* keep the existing production service and
  change only Root directory → `site`, Build command → the one in `render.yaml`,
  Publish directory → `public`, plus `PYTHON_VERSION`. Note the previous values
  first. Trigger a manual deploy and watch the log.
* *Alternative:* point the production domain at the staging service once staging
  has been verified, then retire the old service.

**Verify immediately after:**

- [ ] `https://analysis-tool-82jq.onrender.com` returns the new build (check the
      `<meta name="generator">` tag reads `DataLens static site builder …`).
- [ ] Upload a CSV in a real browser and exercise all five views.
- [ ] Assets load with 200s and the expected `Cache-Control`.

**Rollback (do this on any failure, before investigating):**

* If the old settings were changed in place: restore Root directory `/`, Build
  command `npm install && npm run build`, Publish directory `dist`, remove
  `PYTHON_VERSION`, and redeploy. The legacy app is untouched on `main`, so this
  always rebuilds the known-good site.
* If a previous deploy exists: Render → Deploys → pick the last successful
  production deploy → Rollback.
* Then keep staging up, reproduce the failure there, and only retry the cutover
  with a fix that has passed § 4 and § 5 again.

## 7. After a successful cutover

Proceed to step 9 of [plan.md](plan.md): delete the legacy source and tooling,
drop the `legacy-app` CI job, update the README, and check the repository's
reported language breakdown on GitHub (it should become Python + JavaScript
instead of TypeScript).
