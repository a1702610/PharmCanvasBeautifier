from bs4 import BeautifulSoup, Comment, NavigableString, Tag

from app.extractors.common import RawImage, SourceExtract, table_to_text

HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
BLOCK_TAGS = {"p", "div", "section", "article", "header", "footer", "ul", "ol",
              "table", "blockquote", "figure"} | HEADINGS
SKIP_TAGS = {"script", "style", "noscript"}


def _collapse(text: str) -> str:
    return " ".join(text.split())


class _CanvasParser:
    def __init__(self, name: str):
        self.name = name
        self.out = SourceExtract()
        self.lines: list[str] = []

    def parse(self, html: str) -> SourceExtract:
        self._blocks(BeautifulSoup(html, "html.parser"))
        self.out.text = "\n".join(self.lines)
        return self.out

    def _emit(self, text: str) -> None:
        text = _collapse(text)
        if text:
            self.lines.append(text)

    def _blocks(self, node) -> None:
        buffer: list[str] = []
        for child in node.children:
            if isinstance(child, Tag) and child.name in BLOCK_TAGS:
                self._emit("".join(buffer))
                buffer.clear()
                self._block(child)
            else:
                buffer.append(self._inline(child))
        self._emit("".join(buffer))

    def _block(self, tag: Tag) -> None:
        if tag.name in HEADINGS:
            text = _collapse(self._inline(tag))
            if text:
                level = 2 if "dp-panel-heading" in (tag.get("class") or []) else int(tag.name[1])
                self.lines.append("#" * level + " " + text)
        elif tag.name == "p":
            self._emit(self._inline(tag))
        elif tag.name in ("ul", "ol"):
            self._list(tag, 0)
        elif tag.name == "table":
            rows = [
                [_collapse(self._inline(cell)) for cell in tr.find_all(["th", "td"], recursive=False)]
                for tr in tag.find_all("tr")
            ]
            text = table_to_text(rows)
            if text:
                self.lines.append(text)
        else:
            self._blocks(tag)

    def _list(self, tag: Tag, depth: int) -> None:
        for li in tag.find_all("li", recursive=False):
            text = _collapse(self._inline(li, skip_lists=True))
            if text:
                self.lines.append("  " * depth + "- " + text)
            for sub in li.find_all(["ul", "ol"], recursive=False):
                self._list(sub, depth + 1)

    def _inline(self, node, skip_lists: bool = False) -> str:
        if isinstance(node, Comment):
            return ""
        if isinstance(node, NavigableString):
            return str(node)
        if not isinstance(node, Tag) or node.name in SKIP_TAGS:
            return ""
        if node.name == "img":
            return " " + self.out.add_image(RawImage(source=self.name, canvas_tag=str(node))) + " "
        if node.name == "iframe":
            return " " + self.out.add_embed(str(node)) + " "
        if node.name == "br":
            return " "
        if node.name in ("ul", "ol"):
            if skip_lists:
                return ""
            items = [_collapse(self._inline(li, skip_lists=True)) for li in node.find_all("li")]
            return " " + "; ".join(i for i in items if i) + " "
        inner = "".join(self._inline(c, skip_lists) for c in node.children)
        if node.name == "a":
            href = (node.get("href") or "").strip()
            label = _collapse(inner)
            if label and href.startswith(("http://", "https://")):
                return f"[{label}]({href})"
            return inner
        if node.name in BLOCK_TAGS or node.name in ("td", "th", "li"):
            return " " + inner + " "
        return inner


def extract_canvas_html(html: str, name: str) -> SourceExtract:
    return _CanvasParser(name).parse(html)
