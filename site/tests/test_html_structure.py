"""Structural validation of the generated HTML.

A static site generator can emit markup that browsers silently repair — an
unbalanced tag, a duplicate id, a `<label for>` pointing nowhere. Those are
invisible in a rendered page but they break accessibility and can detach event
targets, so the built output is parsed and checked here. (A malformed
`</button>` in the table footer was exactly this class of defect.)
"""

from __future__ import annotations

import re
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

from _helpers import SITE_DIR

import build as build_module

VOID_ELEMENTS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}


class StructureParser(HTMLParser):
    """Collects ids, label targets, asset references and tag-balance errors."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, int]] = []
        self.errors: list[str] = []
        self.ids: list[str] = []
        self.label_for: list[str] = []
        self.references: list[str] = []
        self.use_hrefs: list[str] = []
        self.data_views: list[str] = []
        self.data_tabs: list[str] = []
        self.empty_attributes: list[str] = []

    def _collect(self, tag: str, attributes: dict) -> None:
        if "id" in attributes:
            self.ids.append(attributes["id"])
        if tag == "label" and attributes.get("for"):
            self.label_for.append(attributes["for"])
        if "data-view" in attributes:
            self.data_views.append(attributes["data-view"])
        if "data-tab" in attributes:
            self.data_tabs.append(attributes["data-tab"])
        if tag == "use":
            href = attributes.get("href") or attributes.get("xlink:href")
            if href:
                self.use_hrefs.append(href)

        for attribute in ("href", "src"):
            value = attributes.get(attribute)
            if value is None or value.startswith("#"):
                continue
            if not value.strip():
                self.empty_attributes.append(f"<{tag} {attribute}=\"\"> at line {self.getpos()[0]}")
            elif not value.startswith(("http://", "https://", "mailto:")):
                self.references.append(value)

    def handle_starttag(self, tag: str, attrs) -> None:
        self._collect(tag, dict(attrs))
        if tag not in VOID_ELEMENTS:
            self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag: str, attrs) -> None:
        # Self-closing tags (<path/>, <rect/>) never enter the stack.
        self._collect(tag, dict(attrs))

    def handle_endtag(self, tag: str) -> None:
        if tag in VOID_ELEMENTS:
            return

        if not self.stack:
            self.errors.append(f"line {self.getpos()[0]}: </{tag}> with no open element")
            return

        if self.stack[-1][0] == tag:
            self.stack.pop()
            return

        # Look for a match further up: everything above it was never closed.
        names = [open_tag for open_tag, _ in self.stack]
        if tag in names:
            index = len(names) - 1 - names[::-1].index(tag)
            for open_tag, line in self.stack[index + 1:]:
                self.errors.append(f"line {line}: <{open_tag}> never closed (found </{tag}> at line {self.getpos()[0]})")
            del self.stack[index:]
        else:
            self.errors.append(f"line {self.getpos()[0]}: unexpected </{tag}>")


class HtmlStructureTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory(prefix="datalens-structure-")
        cls.out = Path(cls._tmp.name) / "public"
        build_module.build_site(output_dir=cls.out, quiet=True)
        cls.pages = {
            name: (cls.out / name).read_text(encoding="utf-8")
            for name in ("index.html", "404.html")
        }
        cls.parsed = {}
        for name, html in cls.pages.items():
            parser = StructureParser()
            parser.feed(html)
            parser.close()
            for tag, line in parser.stack:
                parser.errors.append(f"line {line}: <{tag}> left open at end of document")
            cls.parsed[name] = parser

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp.cleanup()


class TagBalanceTest(HtmlStructureTestCase):
    def test_markup_is_balanced(self) -> None:
        for name, parser in self.parsed.items():
            with self.subTest(page=name):
                self.assertEqual(parser.errors, [], f"{name}: {'; '.join(parser.errors[:6])}")

    def test_key_containers_are_present_and_closed(self) -> None:
        index = self.pages["index.html"]
        for tag, minimum in (("section", 5), ("button", 20), ("aside", 1), ("main", 1)):
            with self.subTest(tag=tag):
                self.assertEqual(
                    len(re.findall(rf"<{tag}[\s>]", index)),
                    len(re.findall(rf"</{tag}>", index)),
                    f"<{tag}> open/close counts differ",
                )
                self.assertGreaterEqual(len(re.findall(rf"<{tag}[\s>]", index)), minimum)


class IdentifierTest(HtmlStructureTestCase):
    def test_ids_are_unique(self) -> None:
        for name, parser in self.parsed.items():
            duplicates = sorted({i for i in parser.ids if parser.ids.count(i) > 1})
            with self.subTest(page=name):
                self.assertEqual(duplicates, [], f"{name}: duplicate ids {duplicates}")

    def test_label_targets_exist(self) -> None:
        parser = self.parsed["index.html"]
        missing = sorted(set(parser.label_for) - set(parser.ids))
        self.assertEqual(missing, [], f"<label for> without a target: {missing}")
        self.assertGreater(len(parser.label_for), 15, "expected the forms to stay labelled")

    def test_sprite_references_resolve(self) -> None:
        parser = self.parsed["index.html"]
        symbols = {i for i in parser.ids if i.startswith("icon-")}
        self.assertTrue(symbols, "no icon symbols found")
        for href in parser.use_hrefs:
            with self.subTest(href=href):
                self.assertTrue(href.startswith("#"))
                self.assertIn(href[1:], symbols)

    def test_navigation_and_views_line_up(self) -> None:
        parser = self.parsed["index.html"]
        self.assertEqual(sorted(parser.data_tabs), sorted(parser.data_views))
        self.assertEqual(len(parser.data_tabs), 5)
        self.assertEqual(len(set(parser.data_tabs)), 5)


class ReferenceTest(HtmlStructureTestCase):
    def test_local_references_exist_on_disk(self) -> None:
        for name, parser in self.parsed.items():
            for reference in parser.references:
                path = reference.split("?")[0].split("#")[0]
                with self.subTest(page=name, reference=reference):
                    self.assertTrue((self.out / path).is_file(), f"{name}: missing {path}")

    def test_no_empty_href_or_src(self) -> None:
        for name, parser in self.parsed.items():
            with self.subTest(page=name):
                self.assertEqual(parser.empty_attributes, [])

    def test_no_placeholder_or_debug_output(self) -> None:
        for name, html in self.pages.items():
            for pattern in ("TODO", "FIXME", "lorem ipsum", "localhost:", "127.0.0.1", "file://"):
                with self.subTest(page=name, pattern=pattern):
                    self.assertNotIn(pattern, html.lower() if pattern.islower() else html)


class AccessibilityTest(HtmlStructureTestCase):
    def test_document_metadata(self) -> None:
        index = self.pages["index.html"]
        self.assertIn("<!doctype html>", index)
        self.assertIn('<meta charset="UTF-8" />', index)
        self.assertIn('name="viewport"', index)
        self.assertRegex(index, r"<title>.+</title>")
        self.assertRegex(index, r'<meta name="description" content=".{20,}"')
        self.assertIn('<html lang="en">', index)

    def test_icon_only_controls_are_labelled(self) -> None:
        index = self.pages["index.html"]
        self.assertIn('id="sidebar-toggle"', index)
        toggle = re.search(r'<button[^>]*id="sidebar-toggle"[^>]*>', index)
        self.assertIsNotNone(toggle)
        self.assertIn("aria-label", toggle.group(0))

    def test_decorative_svgs_are_hidden_from_assistive_tech(self) -> None:
        index = self.pages["index.html"]
        svg_tags = re.findall(r"<svg[^>]*>", index)
        self.assertTrue(svg_tags)
        for tag in svg_tags:
            with self.subTest(tag=tag[:60]):
                self.assertTrue(
                    'aria-hidden="true"' in tag or 'class="icon-sprite"' in tag,
                    "decorative <svg> without aria-hidden",
                )

    def test_tabs_expose_their_state(self) -> None:
        index = self.pages["index.html"]
        self.assertEqual(index.count('role="tab"'), 11)  # 5 probability modes + 6 chart types
        self.assertIn('aria-selected="true"', index)
        self.assertEqual(index.count('role="tablist"'), 2)

    def test_stylesheets_exist_and_are_not_empty(self) -> None:
        stylesheet = SITE_DIR / "assets" / "css" / "styles.css"
        self.assertGreater(stylesheet.stat().st_size, 10_000)
        css = stylesheet.read_text(encoding="utf-8")
        for selector in (".app", ".sidebar", ".nav-item", ".table-card", ".chart-frame", ".summary-card"):
            self.assertIn(selector, css, selector)


class ValidatorSelfTest(unittest.TestCase):
    """The structural checks must actually fail on broken markup."""

    def parse(self, html: str) -> StructureParser:
        parser = StructureParser()
        parser.feed(html)
        parser.close()
        for tag, line in parser.stack:
            parser.errors.append(f"line {line}: <{tag}> left open at end of document")
        return parser

    def test_detects_swapped_closing_tag(self) -> None:
        # The exact defect class found during migration: a </div> closing a <button>.
        parser = self.parse('<div class="footer"><button>Next</div></div>')
        self.assertTrue(parser.errors, "a mismatched closing tag must be reported")
        self.assertTrue(any("button" in error for error in parser.errors), parser.errors)

    def test_detects_unclosed_element(self) -> None:
        parser = self.parse("<section><p>text</section>")
        self.assertTrue(any("<p> never closed" in error for error in parser.errors), parser.errors)

    def test_detects_left_open_at_end(self) -> None:
        parser = self.parse("<div><span>text</div>")
        self.assertTrue(parser.errors, parser.errors)

    def test_accepts_balanced_markup(self) -> None:
        parser = self.parse(
            '<div class="a"><p>one</p><input type="text" /><svg><path d="M0 0" /></svg></div>'
        )
        self.assertEqual(parser.errors, [])

    def test_collects_ids_labels_and_references(self) -> None:
        parser = self.parse(
            '<label for="x">L</label><input id="x" /><a href="assets/a.css">a</a>'
            '<svg><use href="#icon-hash"></use></svg>'
        )
        self.assertEqual(parser.ids, ["x"])
        self.assertEqual(parser.label_for, ["x"])
        self.assertEqual(parser.references, ["assets/a.css"])
        self.assertEqual(parser.use_hrefs, ["#icon-hash"])


if __name__ == "__main__":
    unittest.main()
