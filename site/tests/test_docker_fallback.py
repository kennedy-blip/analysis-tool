"""Validation for the Docker fallback image in `site/docker/`.

The fallback is a contingency (Render Static Sites cannot run Docker), but it is
still deployment configuration: a wrong port, a stale cache header or an
entrypoint script that runs too late would produce a container that starts and
then serves nothing useful. This sandbox has no Docker daemon and no egress to
Docker Hub, so nothing here builds an image. What it does instead:

* parses `site/docker/Dockerfile` and asserts the stage contract (build + test in
  the builder, publish only the generated site from the runtime stage);
* **executes** `site/docker/render-port.envsh` under `sh` to prove Render's
  `$PORT` really becomes the listen port, including the unset-`$PORT` default;
* simulates the nginx image's `envsubst` pass over
  `site/docker/nginx.conf.template` and structurally checks the rendered config,
  verifying that nginx's own `$uri` survives substitution;
* asserts the cache-control policy is identical to `render.yaml`, so the static
  site and the container cannot drift apart;
* guards the hazard that motivated the odd file location: `site/Dockerfile` must
  not exist, because Render auto-detects a Dockerfile in a service's root
  directory and the staging static site's root is `site`.
"""

from __future__ import annotations

import os
import re
import stat
import subprocess
import unittest
from pathlib import Path

# `_helpers` first: it puts site/ on sys.path regardless of the discovery cwd.
from _helpers import REPO_ROOT, SITE_DIR

DOCKER_DIR = SITE_DIR / "docker"
DOCKERFILE = DOCKER_DIR / "Dockerfile"
TEMPLATE = DOCKER_DIR / "nginx.conf.template"
ENVSH = DOCKER_DIR / "render-port.envsh"
DOCKERIGNORE = SITE_DIR / ".dockerignore"
RENDER_YAML = REPO_ROOT / "render.yaml"

# Scripts shipped with nginxinc/nginx-unprivileged, run in lexical order.
STOCK_ENTRYPOINT_SCRIPTS = [
    "10-listen-on-ipv6-by-default.sh",
    "15-local-resolvers.envsh",
    "20-envsubst-on-templates.sh",
    "30-tune-worker-processes.sh",
]
ENVSUBST_SCRIPT = "20-envsubst-on-templates.sh"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def strip_comments(text: str) -> str:
    return "\n".join(line.split("#", 1)[0] for line in text.splitlines())


def parse_dockerfile(text: str) -> dict:
    """Split a Dockerfile into stages of (instruction, arguments) pairs."""
    stages: list[dict] = []
    current: dict | None = None
    pending = ""

    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        # Join backslash continuations into one logical instruction.
        if line.endswith("\\"):
            pending += line[:-1].strip() + " "
            continue
        pending += line
        instruction, _, arguments = pending.partition(" ")
        pending = ""
        keyword = instruction.upper()

        if keyword == "FROM":
            current = {"from": arguments, "instructions": []}
            alias = re.search(r"\bAS\s+(\S+)\s*$", arguments, re.IGNORECASE)
            current["alias"] = alias.group(1) if alias else None
            stages.append(current)
        elif current is not None:
            current["instructions"].append((keyword, arguments.strip()))

    return {
        "stages": stages,
        "stage": {stage["alias"]: stage for stage in stages if stage["alias"]},
    }


def simulate_envsubst(text: str, env: dict[str, str]) -> str:
    """Reproduce envsubst as the nginx image invokes it.

    The entrypoint builds the substitution list from the *defined* environment,
    so undefined names are left untouched — that is what keeps nginx's `$uri`
    and `$uri/` intact while `${NGINX_PORT}` is replaced.
    """

    def replace(match: re.Match) -> str:
        name = match.group(1) or match.group(2)
        return env[name] if name in env else match.group(0)

    return re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)").sub(replace, text)


def resolve_nginx_port(port: str | None) -> tuple[str, str]:
    """Source the envsh exactly as the container would; return (port, log)."""
    env = dict(os.environ)
    if port is None:
        env.pop("PORT", None)
    else:
        env["PORT"] = port

    script = f'. "{ENVSH}"; printf "%s" "$NGINX_PORT"'
    result = subprocess.run(
        ["sh", "-c", script], capture_output=True, text=True, env=env, timeout=30
    )
    if result.returncode != 0:
        raise AssertionError(f"sourcing render-port.envsh failed: {result.stderr}")

    lines = [line for line in result.stdout.splitlines() if line.strip()]
    # The script logs one line before the value we asked it to print.
    return lines[-1], "\n".join(lines[:-1])


def parse_render_headers(text: str) -> list[dict]:
    """Read the `headers:` list of render.yaml without a YAML dependency."""
    headers: list[dict] = []
    current: dict | None = None
    in_headers = False

    for raw in text.splitlines():
        stripped = raw.strip()
        if re.match(r"^\s*headers:\s*$", raw):
            in_headers = True
            continue
        if in_headers:
            # Any dedent out of the list (e.g. `envVars:`) ends the block.
            if stripped and not raw.startswith("      ") and not raw.startswith("      -"):
                if not stripped.startswith("-"):
                    in_headers = False
                    continue
            if stripped.startswith("- path:"):
                current = {"path": stripped.split(":", 1)[1].strip()}
                headers.append(current)
            elif stripped.startswith("name:") and current is not None:
                current["name"] = stripped.split(":", 1)[1].strip()
            elif stripped.startswith("value:") and current is not None:
                current["value"] = stripped.split(":", 1)[1].strip()

    return headers


class DockerfileLocationTest(unittest.TestCase):
    """Render picks up a Dockerfile from a service's root directory."""

    def test_no_dockerfile_in_the_static_site_root(self) -> None:
        self.assertFalse(
            (SITE_DIR / "Dockerfile").exists(),
            "site/Dockerfile must not exist: rootDir for the staging static site is "
            "`site`, and Render would auto-detect Docker there. Keep the image "
            "definition in site/docker/.",
        )
        self.assertFalse((REPO_ROOT / "Dockerfile").exists())

    def test_image_files_live_in_site_docker(self) -> None:
        for path in (DOCKERFILE, TEMPLATE, ENVSH):
            with self.subTest(path=str(path)):
                self.assertTrue(path.is_file(), f"missing {path}")

    def test_render_yaml_declares_only_the_static_staging_service(self) -> None:
        text = read(RENDER_YAML)
        self.assertEqual(len(re.findall(r"^\s*-\s+type:\s", text, re.MULTILINE)), 1)
        self.assertIn("type: static", text)

        # Comments are allowed to name production (to record that it is untouched);
        # configuration lines are not, and must not ask Render for a Docker or Web
        # Service — the fallback image is created by hand, not by the Blueprint.
        config = "\n".join(
            line for line in text.splitlines() if not line.strip().startswith("#")
        )
        self.assertNotIn("analysis-tool-82jq", config)
        for forbidden in ("dockerfilePath", "dockerContext", "type: web", "healthCheckPath"):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, config)

    def test_dockerignore_excludes_local_and_generated_paths(self) -> None:
        text = read(DOCKERIGNORE)
        for pattern in ("public", "__pycache__", "node_modules", ".venv", ".cache", "*.py[cod]"):
            with self.subTest(pattern=pattern):
                self.assertIn(pattern, text)


class DockerfileStageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = read(DOCKERFILE)
        cls.parsed = parse_dockerfile(cls.text)
        cls.builder = cls.parsed["stage"]["builder"]
        cls.runtime = cls.parsed["stage"]["runtime"]

    def test_uses_buildkit_syntax_and_two_named_stages(self) -> None:
        self.assertTrue(self.text.startswith("# syntax=docker/dockerfile:1"))
        self.assertEqual([s["alias"] for s in self.parsed["stages"]], ["builder", "runtime"])

    def test_base_images_are_pinned(self) -> None:
        for stage in self.parsed["stages"]:
            image = stage["from"].split()[0]
            with self.subTest(stage=stage["alias"]):
                self.assertNotIn("latest", image)
                self.assertRegex(image, r":\d")
        self.assertTrue(self.builder["from"].startswith("python:3.11"))
        self.assertIn("nginx-unprivileged", self.runtime["from"])
        self.assertIn("-alpine", self.runtime["from"])

    def test_builder_installs_dependencies_from_requirements(self) -> None:
        instructions = self.builder["instructions"]
        names = [name for name, _ in instructions]
        self.assertIn("requirements.txt", [args for name, args in instructions if name == "COPY"][0])
        # Dependency layer before the source layer, so caching works.
        first_copy = names.index("COPY")
        self.assertLess(
            next(i for i, (n, a) in enumerate(instructions) if n == "RUN" and "pip install" in a),
            next(i for i, (n, a) in enumerate(instructions) if n == "COPY" and i > first_copy and a == ". ."),
        )
        self.assertTrue(any("pip install --no-cache-dir -r requirements.txt" in a for _, a in instructions))

    def test_builder_runs_the_build_then_the_tests(self) -> None:
        run_commands = " ".join(a for n, a in self.builder["instructions"] if n == "RUN")
        build_index = run_commands.index("python3 build.py")
        test_index = run_commands.index("python3 -m unittest discover -s tests -t tests")
        self.assertLess(build_index, test_index, "tests must run after the build")
        self.assertIn("--output /build/public", run_commands)

    def test_test_invocation_matches_every_other_deployment_path(self) -> None:
        # CI, render.yaml, run_tests.sh and the image must run the same command,
        # so a suite that passes locally cannot be skipped somewhere else.
        invocation = "python3 -m unittest discover -s tests -t tests"
        self.assertIn(invocation, read(DOCKERFILE))
        self.assertIn(invocation, read(RENDER_YAML))
        self.assertIn(invocation, read(SITE_DIR / "run_tests.sh"))

    def test_runtime_publishes_only_the_generated_site(self) -> None:
        copies = [args for name, args in self.runtime["instructions"] if name == "COPY"]
        self.assertIn("--from=builder /build/public /usr/share/nginx/html", " ".join(copies))
        for args in copies:
            self.assertNotEqual(args.strip(), ". .", "the runtime stage must not ship the source tree")
        runs = " ".join(a for n, a in self.runtime["instructions"] if n == "RUN")
        self.assertNotIn("pip install", runs)
        self.assertNotIn("npm", runs)

    def test_runtime_config_files_exist_in_the_build_context(self) -> None:
        for args in (a for n, a in self.runtime["instructions"] if n == "COPY" and "--from" not in a):
            tokens = [t for t in args.split() if not t.startswith("--")]
            source, destination = tokens[0], tokens[-1]
            with self.subTest(source=source):
                self.assertTrue((SITE_DIR / source).is_file(), f"{source} missing from the context")
                self.assertTrue(destination.startswith("/"), destination)

    def test_entrypoint_script_is_installed_before_envsubst(self) -> None:
        copies = " ".join(a for n, a in self.runtime["instructions"] if n == "COPY")
        match = re.search(r"/docker-entrypoint\.d/(\S+)", copies)
        self.assertIsNotNone(match, "render-port.envsh is not installed into /docker-entrypoint.d")
        installed = match.group(1)

        self.assertTrue(installed.endswith(".envsh"), f"{installed} must be .envsh so it is SOURCED")
        self.assertNotIn(installed, STOCK_ENTRYPOINT_SCRIPTS, "collides with a stock script name")
        self.assertLess(
            installed,
            ENVSUBST_SCRIPT,
            f"{installed} sorts after {ENVSUBST_SCRIPT}, so NGINX_PORT would be substituted too late",
        )
        self.assertIn("--chmod=0755", copies, "the entrypoint only sources executable files")

    def test_entrypoint_script_is_executable_on_disk(self) -> None:
        mode = ENVSH.stat().st_mode
        self.assertTrue(mode & stat.S_IXUSR, "render-port.envsh lost its executable bit")

    def test_template_replaces_the_stock_server_config(self) -> None:
        copies = " ".join(a for n, a in self.runtime["instructions"] if n == "COPY")
        self.assertIn("/etc/nginx/templates/default.conf.template", copies)
        # Rendering to default.conf replaces the stock server; a second name would
        # give two servers both binding $PORT and the container would not start.
        self.assertNotIn("/etc/nginx/conf.d/datalens.conf", copies)

    def test_exposed_port_matches_the_default(self) -> None:
        env = dict(
            re.findall(r"(\w+)=([^\s\\]+)", " ".join(a for n, a in self.runtime["instructions"] if n == "ENV"))
        )
        expose = [a for n, a in self.runtime["instructions"] if n == "EXPOSE"]
        self.assertEqual(env.get("NGINX_PORT"), "8080")
        self.assertEqual(expose, ["8080"])

    def test_no_secrets_or_credentials_in_the_image_definition(self) -> None:
        lowered = read(DOCKERFILE).lower()
        for forbidden in ("token", "password", "api_key", "secret", "aws_", "--build-arg"):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, lowered)


class PortPlumbingTest(unittest.TestCase):
    """Executed, not parsed: prove $PORT reaches nginx."""

    def test_port_from_the_environment_is_used(self) -> None:
        port, log = resolve_nginx_port("1234")
        self.assertEqual(port, "1234")
        self.assertIn("PORT=1234", log)

    def test_render_style_port_is_used(self) -> None:
        port, _ = resolve_nginx_port("10000")
        self.assertEqual(port, "10000")

    def test_missing_port_falls_back_to_8080(self) -> None:
        port, log = resolve_nginx_port(None)
        self.assertEqual(port, "8080")
        self.assertIn("PORT=<unset>", log)

    def test_empty_port_falls_back_too(self) -> None:
        port, _ = resolve_nginx_port("")
        self.assertEqual(port, "8080")

    def test_script_has_no_side_effects_beyond_the_export(self) -> None:
        # The script logs one line; silence it so only the environment is compared.
        before = subprocess.run(
            ["sh", "-c", "env"], capture_output=True, text=True, timeout=30
        )
        after = subprocess.run(
            ["sh", "-c", f'. "{ENVSH}" >/dev/null; env'],
            capture_output=True,
            text=True,
            timeout=30,
            env=dict(os.environ, PORT="9000"),
        )
        self.assertEqual(after.returncode, 0, after.stderr)
        added = set(after.stdout.splitlines()) - set(before.stdout.splitlines())
        self.assertEqual(added, {"NGINX_PORT=9000", "PORT=9000"})


class NginxTemplateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.raw = read(TEMPLATE)
        cls.rendered = simulate_envsubst(cls.raw, {"NGINX_PORT": "8080"})

    def test_all_template_variables_are_resolved(self) -> None:
        self.assertNotIn("${", self.rendered)
        self.assertIn("listen 8080;", strip_comments(self.rendered))

    def test_nginx_variables_survive_substitution(self) -> None:
        # envsubst is invoked with the defined-env list only; $uri must survive or
        # try_files would look for the literal string "$uri".
        self.assertIn("$uri", self.rendered)
        self.assertIn("try_files $uri $uri/ /index.html;", strip_comments(self.rendered))

    def test_rendered_config_is_structurally_valid(self) -> None:
        body = strip_comments(self.rendered)
        self.assertEqual(body.count("{"), body.count("}"), "unbalanced braces")
        self.assertEqual(body.count("{"), 5, "expected server + four location blocks")
        for line in body.splitlines():
            line = line.strip()
            if not line:
                continue
            with self.subTest(line=line):
                self.assertTrue(
                    line.endswith((";", "{", "}")),
                    f"directive does not terminate: {line!r}",
                )

    def test_serves_the_generated_404_page(self) -> None:
        self.assertIn("error_page 404 /404.html;", strip_comments(self.rendered))
        self.assertNotRegex(self.rendered, r"location\s*=\s*/404\.html\s*\{[^}]*\binternal\b")

    def test_root_and_index_match_the_static_build(self) -> None:
        self.assertIn("root /usr/share/nginx/html;", strip_comments(self.rendered))
        self.assertIn("index index.html;", strip_comments(self.rendered))

    def test_no_ipv6_listener(self) -> None:
        # The base image's IPv6 patcher runs before the template is rendered, so
        # an [::] listener would be fatal in a container without IPv6.
        self.assertNotIn("[::]", self.rendered)

    def test_no_hardcoded_host_or_port(self) -> None:
        for forbidden in ("localhost", "127.0.0.1", "listen 80;", "analysis-tool-82jq"):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, strip_comments(self.rendered))


class CachePolicyParityTest(unittest.TestCase):
    """render.yaml and the container must cache identically."""

    LOCATION_FOR_PATH = {
        "/assets/*": "location /assets/ {",
        "/data/*": "location /data/ {",
        "/*.html": r"location ~* \.html$ {",
        "/": "location / {",
    }

    @classmethod
    def setUpClass(cls) -> None:
        cls.headers = parse_render_headers(read(RENDER_YAML))
        cls.template = strip_comments(read(TEMPLATE))

    def test_render_yaml_headers_were_parsed(self) -> None:
        self.assertEqual(len(self.headers), 4, self.headers)
        for header in self.headers:
            self.assertEqual(sorted(header), ["name", "path", "value"])

    def test_every_render_path_has_a_matching_location(self) -> None:
        for header in self.headers:
            expected = self.LOCATION_FOR_PATH.get(header["path"])
            with self.subTest(path=header["path"]):
                self.assertIsNotNone(expected, "unmapped render.yaml path")
                self.assertIn(expected, self.template)

    def test_cache_control_values_are_identical(self) -> None:
        for header in self.headers:
            if header["name"] != "Cache-Control":
                continue
            with self.subTest(path=header["path"]):
                self.assertIn(f'add_header Cache-Control "{header["value"]}"', self.template)

    def test_x_content_type_options_is_identical(self) -> None:
        nosniff = [h for h in self.headers if h["name"] == "X-Content-Type-Options"]
        self.assertTrue(nosniff)
        for header in nosniff:
            with self.subTest(path=header["path"]):
                self.assertIn(f'add_header {header["name"]} "{header["value"]}"', self.template)

    def test_container_adds_no_caching_the_static_site_lacks(self) -> None:
        allowed = {h["value"] for h in self.headers if h["name"] == "Cache-Control"}
        rendered = re.findall(r'add_header Cache-Control "([^"]+)"', self.template)
        self.assertTrue(rendered)
        self.assertEqual(set(rendered), allowed, "cache policies have drifted apart")

    def test_headers_apply_to_error_responses_too(self) -> None:
        # Render applies its header rules to every response; `always` is what makes
        # nginx do the same (otherwise add_header skips 404s).
        add_headers = re.findall(r"add_header [^\n]*", self.template)
        self.assertTrue(add_headers)
        for directive in add_headers:
            with self.subTest(directive=directive[:50]):
                self.assertTrue(directive.rstrip(";").endswith("always"))


if __name__ == "__main__":
    unittest.main()
