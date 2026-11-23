# syntax=docker/dockerfile:1
#
# FALLBACK runtime for the DataLens static site — not the default deployment.
#
# Render Static Sites cannot run Docker, so this image exists for two purposes:
#   1. build and serve the site in a clean, reproducible environment;
#   2. act as a Web Service fallback if Render's static build image ever lacks
#      Python 3.11 (docs/migration/render.md § 3, "If Python is unavailable").
#
# WHY THIS IS NOT site/Dockerfile
# Render auto-detects a Dockerfile in a service's root directory, and the staging
# static site's rootDir is `site`. Keeping the image definition in `site/docker/`
# means the static build can never pick it up by accident. A test enforces this:
# site/tests/test_docker_fallback.py fails if site/Dockerfile appears.
#
# Build (the CONTEXT is site/, so paths below are relative to it):
#
#   docker build -f site/docker/Dockerfile -t datalens-static site
#   docker run --rm -e PORT=8080 -p 8080:8080 datalens-static
#   curl -i http://localhost:8080/
#
# On Render (Web Service, Docker runtime):
#   Root Directory  site
#   Dockerfile Path docker/Dockerfile
#   Health check    leave default (/) — index.html answers 200
#
# Neither base image could be pulled or run in the workspace this was written in
# (no Docker daemon, no Docker Hub egress), so the first staging build is the
# real verification. site/tests/test_docker_fallback.py checks everything that
# can be checked without a daemon, including the $PORT plumbing.

################ Stage 1 — build and test ################
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

# Dependency layer first, so it is cached until requirements.txt changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Generate the site, then prove it before it may reach the runtime stage.
# `python3 -m unittest` fails the build on any regression, so a broken site
# cannot be baked into an image.
RUN python3 build.py --output /build/public \
 && python3 -m unittest discover -s tests -t tests

################ Stage 2 — serve ################
# Unprivileged flavour: master and workers run as the `nginx` user (UID 101) and
# listen on 8080 rather than 80, which suits Render's $PORT convention.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# Default when $PORT is absent; docker/render-port.envsh overrides it at start.
ENV NGINX_PORT=8080

# Rendered by the base image's own 20-envsubst-on-templates.sh. The output name
# matches the stock config so it REPLACES it — two servers on 8080 would fail to
# bind. Cache policy in this file mirrors the `headers:` block of render.yaml.
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template

# `.envsh`, not `.sh`: the nginx entrypoint SOURCES *.envsh files but EXECUTES
# *.sh files in a subshell, where an `export` cannot reach 20-envsubst. The 15-
# prefix is what makes it run before the substitution script.
COPY --chmod=0755 docker/render-port.envsh /docker-entrypoint.d/15-render-port.envsh

# Only the generated site ships. No Python, no templates, no tests, no sources,
# no node_modules — a static bundle needs a static server.
COPY --from=builder /build/public /usr/share/nginx/html

EXPOSE 8080

# The base image's entrypoint + default CMD (`nginx -g 'daemon off;'`) are kept,
# so the scripts in /docker-entrypoint.d still run.
