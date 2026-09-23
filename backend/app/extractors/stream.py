"""Combine per-source extracts into one text stream with global refs."""
import base64
import re
from collections import Counter
from dataclasses import dataclass

from app.extractors.common import PLACEHOLDER_RE, SourceExtract
from app.extractors.images import ImageRejected, image_hash, make_thumbnail, prepare_image
from app.extractors.models import EmbedInfo, ImageInfo

MAX_REPEATS = 2


@dataclass
class Assembled:
    text: str
    images: list[ImageInfo]
    embeds: list[EmbedInfo]
    warnings: list[list[str]]


def _marker(info: ImageInfo) -> str:
    return f"[{info.ref}: {info.location}]" if info.location else f"[{info.ref}]"


def assemble(sources: list[tuple[str, SourceExtract]], max_ai_images: int) -> Assembled:
    counts = Counter(
        image_hash(img.data) for _, ex in sources for img in ex.images if img.data is not None
    )
    images: list[ImageInfo] = []
    embeds: list[EmbedInfo] = []
    raw_bytes: dict[str, bytes] = {}
    by_hash: dict[str, ImageInfo | None] = {}
    parts: list[str] = []
    warnings: list[list[str]] = []

    for k, (name, ex) in enumerate(sources, start=1):
        unreadable = 0

        def replace(match: re.Match) -> str:
            nonlocal unreadable
            kind, index = match.group(1), int(match.group(2))
            if kind == "EMBED":
                ref = f"EMBED-{len(embeds) + 1:02d}"
                embeds.append(EmbedInfo(ref=ref, html=ex.embeds[index]))
                return f"[{ref}]"
            raw = ex.images[index]
            if raw.canvas_tag is not None:
                info = ImageInfo(ref=f"IMG-{len(images) + 1:02d}", source=name,
                                 location=raw.location, canvas_tag=raw.canvas_tag)
                images.append(info)
                return _marker(info)
            digest = image_hash(raw.data)
            if counts[digest] > MAX_REPEATS:
                return ""
            if digest in by_hash:
                known = by_hash[digest]
                return _marker(known) if known else ""
            try:
                prepared = prepare_image(raw.data)
            except ImageRejected as exc:
                by_hash[digest] = None
                if exc.reason == "unreadable":
                    unreadable += 1
                return ""
            info = ImageInfo(ref=f"IMG-{len(images) + 1:02d}", source=name, location=raw.location,
                             mime=prepared.mime, data_b64=base64.b64encode(prepared.data).decode("ascii"))
            images.append(info)
            raw_bytes[info.ref] = prepared.data
            by_hash[digest] = info
            return _marker(info)

        body = PLACEHOLDER_RE.sub(replace, ex.text)
        body = re.sub(r"[ \t]+\n", "\n", body)
        body = re.sub(r"\n{3,}", "\n\n", body).strip()
        parts.append(f"=== SOURCE {k}: {name} ===\n\n{body}")
        warnings.append(
            [f"{unreadable} image(s) couldn't be read (unsupported format) and were skipped."]
            if unreadable else []
        )

    for info in [i for i in images if i.ref in raw_bytes][:max_ai_images]:
        info.thumb_b64 = make_thumbnail(raw_bytes[info.ref])

    return Assembled(text="\n\n".join(parts), images=images, embeds=embeds, warnings=warnings)
