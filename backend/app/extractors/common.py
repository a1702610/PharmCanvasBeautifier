"""Shared types for extractors.

Extractors emit text containing placeholder tokens for images and embeds.
stream.assemble() later swaps them for global refs like [IMG-03: slide 7].
"""
import re
from dataclasses import dataclass, field

PLACEHOLDER_RE = re.compile(r"\x00(IMG|EMBED):(\d+)\x00")


def placeholder(kind: str, index: int) -> str:
    return f"\x00{kind}:{index}\x00"


@dataclass
class RawImage:
    source: str
    location: str = ""
    data: bytes | None = None
    canvas_tag: str | None = None


@dataclass
class SourceExtract:
    text: str = ""
    images: list[RawImage] = field(default_factory=list)
    embeds: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def add_image(self, image: RawImage) -> str:
        self.images.append(image)
        return placeholder("IMG", len(self.images) - 1)

    def add_embed(self, html: str) -> str:
        self.embeds.append(html)
        return placeholder("EMBED", len(self.embeds) - 1)


def _cell(value: str | None) -> str:
    lines = [line.strip() for line in (value or "").splitlines() if line.strip()]
    return " / ".join(lines).replace("|", "\\|")


def table_to_text(rows: list[list[str]]) -> str:
    cleaned = [[_cell(c) for c in row] for row in rows]
    cleaned = [r for r in cleaned if any(r)]
    if not cleaned:
        return ""
    lines = ["| " + " | ".join(cleaned[0]) + " |", "|" + "---|" * len(cleaned[0])]
    lines += ["| " + " | ".join(r) + " |" for r in cleaned[1:]]
    return "\n".join(lines)
