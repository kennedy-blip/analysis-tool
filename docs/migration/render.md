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
buildCommand: python3 -m pip install --upgrade pip && pip install -r requirements.txt && python3 build.py && python3 -m unittest discover -s tests -t tests
publishDir: public
envVars: PYTHON_VERSION=3.11.9, NODE_VERSION=22.11.0
pullRequestPreviewsEnabled: false
```

The build command runs the test-suite before publishing, so a broken build cannot
produce a deployable `public/` directory.

Create it with **New → Blueprint → this repository → branch
`arena/0fbcf013-analysis-tool`**. A Blueprint only manages the services it
declares, so the dashboard-created production service is not touched — but confirm
that immediately after creation: production should still be listed, still show its
last successful deploy, and still serve the old build.

⚠️ **If Render offers to "adopt", "sync" or "link" existing services into the new
Blueprint, decline.** Adoption would put the production service under Blueprint
management, and a later Blueprint apply could then rewrite settings that
`render.yaml` does not describe (or report the service as removed, since the file
declares only the staging site). Production must stay a plain dashboard-managed
service until cutover, so that changing it remains one deliberate manual act with
the rollback values in hand.

### Merging the migration branch does not change production

Worth stating plainly, because it is the part that feels risky and isn't: the
production service builds from the repository root with the legacy Vite pipeline,
and this branch leaves that pipeline byte-identical. `site/` is not referenced by
`index.html`, `vite.config.ts` or `package.json`, so a root-directory build
ignores it entirely, and the presence of `render.yaml` changes nothing for a
service that was created in the dashboard rather than from a Blueprint.

So merging to `main` redeploys the same legacy app it deploys today. Cutover is
still a separate manual act (§ 6) — merging is not cutover, and the two should not
be conflated.

This is not just reasoning: the `legacy-app` CI job runs `npm ci && npm run build`
on a checkout that already contains `site/`, `render.yaml` and `docs/`, asserts
`dist/index.html` exists, and passes on every commit of this branch.

## 2. Production's real settings

Confirmed by the repository owner on 2026-11-23:

| Setting | Value | Source |
| --- | --- | --- |
| Service type | **Static Site** | owner, dashboard |
| Root directory | **`/`** (repository root) | owner, dashboard |
| Publish directory | **`dist/`** | owner, dashboard |

Good news: that is exactly the shape this migration targets, so the cutover is a
**drop-in change of three settings** (root directory, build command, publish
directory) on the existing service. No service type change, no re-pointed domain,
no new hostname. § 6 has the values to restore if it goes wrong.

Still to read from the dashboard before cutover — these were *not* confirmed and
must not be guessed, because they are the rollback values:

| Setting | Where to look | Value |
| --- | --- | --- |
| Build command (exact string) | Settings → Build & deploy | ⬜ |
| Node version / environment | Settings → Environment | ⬜ |
| Branch deployed | Settings → Build & deploy | ⬜ |
| Custom domain or TLS certificate | Settings → Domains | ⬜ |
| Any header/redirect rules | Settings → Headers & redirects | ⬜ |
| Auto-deploy enabled? | Settings → Build & deploy | ⬜ |

Write them into this table, or into the pull request, before touching production.
The last two matter most: if production auto-deploys on push to the deployed
branch, merging changes the live site without a separate cutover decision.

## 3. Verify the staging build environment

`env: static` with `PYTHON_VERSION` is the assumption the blueprint makes, and it
is the one thing this workspace could not test — there is no Render access here.
Confirm it on the first staging deploy:

1. Create the service from the blueprint (§ 1).
2. Open the deploy log and check, in order:
   * `pip install -r requirements.txt` installs Jinja2 3.1.6 on Python 3.11;
   * `python3 build.py` prints
     `Built DataLens static site -> /opt/render/project/site/public`;
   * `Ran 141 tests ... OK`;
   * the publish step reports `public` with ~21 files.
3. If the Python version is wrong, add `python3 --version` to the build command
   temporarily, or set `PYTHON_VERSION` to a value Render documents for static
   builds.
4. Check the deployed site: `/` serves the app, an unknown path serves
   `404.html`, `/assets/js/app.js?v=…` returns
   `Content-Type: text/javascript` with `Cache-Control: public, max-age=31536000,
   immutable`, `/data/sample_sales_data.json` returns `application/json`, and
   `index.html` returns `Cache-Control: no-cache`.

### If Python is unavailable on the static build

Two fallbacks, in this order of preference.

**A. Publish the pre-built output.** Commit `site/public/` (remove it from
`.gitignore`) and reduce the build command to a no-op such as `echo "using
committed build"`, keeping `publishDir: public`.

* Keeps the service type and therefore the production URL unchanged, and needs no
  interpreter on Render at all.
* Costs: generated files live in Git (~1 MB, including the vendored SheetJS), and
  the published bundle is only as fresh as the last commit — so the Python tests
  must run in CI (they already do) and the committed output must be regenerated
  whenever templates, data or config change. `site/run_tests.sh` is the command
  that does it.

**B. Serve the site from a container.** `site/docker/` holds a complete fallback
image: `Dockerfile`, `nginx.conf.template`, `render-port.envsh`.

```bash
# context is site/ — paths inside the Dockerfile are relative to it
docker build -f site/docker/Dockerfile -t datalens-static site
docker run --rm -e PORT=8080 -p 8080:8080 datalens-static
curl -i localhost:8080/ | head -12
curl -sI localhost:8080/assets/css/styles.css | grep -i cache-control
curl -i localhost:8080/does-not-exist | head -8      # -> the generated 404 page
```

How it works:

| Stage | Base image | What it does |
| --- | --- | --- |
| `builder` | `python:3.11-slim` | installs `requirements.txt`, runs `build.py --output /build/public`, then runs the full Python suite so a broken site cannot be baked in |
| `runtime` | `nginxinc/nginx-unprivileged:1.27-alpine` | copies **only** `/build/public` to `/usr/share/nginx/html`; no Python, no source, no tests ship |

The runtime stage honours Render's `$PORT` through
`docker/render-port.envsh`, installed as
`/docker-entrypoint.d/15-render-port.envsh`. Two details there are load-bearing
and easy to break:

* it must be `.envsh`, not `.sh` — the nginx entrypoint **sources** `*.envsh` but
  **executes** `*.sh` in a subshell, where an `export` cannot reach the
  substitution step, so nginx would silently listen on the baked-in default;
* the `15-` prefix must sort before the base image's
  `20-envsubst-on-templates.sh`, which renders `${NGINX_PORT}` into the config.

Cache headers in `nginx.conf.template` mirror `render.yaml` exactly
(`/assets/` immutable for a year, `/data/` one hour, `*.html` no-cache,
`X-Content-Type-Options: nosniff` on everything), so the two deployment routes
cannot drift apart.

On Render this is a **Web Service** with runtime **Docker**, Root Directory
`site`, Dockerfile Path `docker/Dockerfile`, and the default health check path
`/` (which `index.html` answers with 200).

> ⚠️ **Read this before using fallback B for production.** Render Static Sites
> cannot run Docker, so this route means a *Web Service* — and a Web Service gets
> a **different `.onrender.com` hostname**. It therefore cannot take over
> `analysis-tool-82jq.onrender.com` in place. Using it for production requires a
> custom domain or accepting a URL change, which is a bigger decision than the
> migration itself. Use B for staging verification, and prefer A if production
> must keep its URL.

Why the image files are not at `site/Dockerfile`: Render auto-detects a Dockerfile
in a service's root directory, and the staging static site's root *is* `site`. A
`site/Dockerfile` could make the static build do something nobody asked for, so
the definition lives one directory down and
`site/tests/test_docker_fallback.py` fails the build if `site/Dockerfile` ever
appears.

What is and is not verified about fallback B:

* ✅ verified without a daemon (34 tests): stage contract, pinned base images,
  build-then-test ordering, runtime ships only generated output, entrypoint
  filename ordering and executable bit, template renders to a structurally valid
  config with `$uri` intact, no IPv6 listener, cache policy identical to
  `render.yaml`, `$PORT` plumbing **executed** through `sh` (1234 → 1234, unset →
  8080, empty → 8080).
* ❌ not verified here: no Docker daemon and no Docker Hub egress in this
  workspace, so neither base image was pulled and no container was started. The
  first `docker build` is the real test. Run the smoke commands above before
  trusting it.

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
- [ ] Response headers match § 3 step 4.
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

- [ ] § 2 "still to read" table filled in from the dashboard.
- [ ] Staging deployed from this branch; log shows Jinja2 installed, the build
      summary and `Ran 141 tests ... OK`.
- [ ] § 4 checklist complete on staging.
- [ ] § 5 comparison complete, differences explained.
- [ ] CI green on the branch, including the `legacy-app` job.
- [ ] Auto-deploy behaviour understood (does merging alone change production?).

**Cutover — the drop-in path** (production is a Static Site, root `/`, publish
`dist/`):

1. In production → Settings → Build & deploy, write down the current values
   (screenshot them), then set:
   * Root directory: `/` → **`site`**
   * Build command: → **`python3 -m pip install --upgrade pip && pip install -r requirements.txt && python3 build.py && python3 -m unittest discover -s tests -t tests`**
   * Publish directory: `dist/` → **`public`**
2. In Settings → Environment, add **`PYTHON_VERSION=3.11.9`** (the `NODE_VERSION`
   entry can stay or be removed; the new build needs no Node).
3. Copy the four header rules from `render.yaml` into Settings → Headers &
   redirects if they are not inherited from the Blueprint.
4. Trigger a manual deploy and watch the log to completion.

**Alternative:** point the production domain at the verified staging service, then
retire the old one. More moving parts; prefer the drop-in path.

**Verify immediately after:**

- [ ] `https://analysis-tool-82jq.onrender.com` returns the new build — check
      `<meta name="generator">` reads `DataLens static site builder …` and that
      `index.html` is ~58 KB, not ~1 MB.
- [ ] Upload a CSV in a real browser and exercise all five views.
- [ ] Assets return 200 with the expected `Cache-Control`; an unknown path serves
      the generated 404 page.

**Rollback (do this on any failure, before investigating):**

1. Restore the three settings to the values written down in step 1: Root
   directory `/`, the legacy build command, Publish directory `dist/`.
2. Remove `PYTHON_VERSION` (a static build may otherwise select Python and skip
   the Node install the legacy build needs).
3. Redeploy. The legacy app is byte-identical to `main` on this branch, so this
   rebuilds the known-good site; alternatively Render → Deploys → last successful
   production deploy → Rollback.
4. Keep staging up, reproduce the failure there, and only retry the cutover with a
   fix that has passed § 4 and § 5 again.

## 7. After a successful cutover

Proceed to step 9 of [plan.md](plan.md): delete the legacy source and tooling,
drop the `legacy-app` CI job, update the README, and check the repository's
reported language breakdown on GitHub (it should become Python + JavaScript
instead of TypeScript).
