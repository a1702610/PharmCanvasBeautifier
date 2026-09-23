import base64
import io

import pytest
from PIL import Image

from app.extractors.common import PLACEHOLDER_RE, RawImage, SourceExtract, table_to_text
from app.extractors.images import ImageRejected, make_thumbnail, prepare_image
from tests.helpers import noise_bmp, noise_png


def test_source_extract_returns_placeholders():
    ex = SourceExtract()
    token = ex.add_image(RawImage(source="a.docx"))
    embed = ex.add_embed("<iframe></iframe>")
    assert PLACEHOLDER_RE.fullmatch(token).groups() == ("IMG", "0")
    assert PLACEHOLDER_RE.fullmatch(embed).groups() == ("EMBED", "0")


def test_table_to_text_escapes_pipes_and_skips_empty_rows():
    rows = [["Class", "Agents"], ["TCA", "amitriptyline | nortriptyline"], ["", ""]]
    assert table_to_text(rows) == (
        "| Class | Agents |\n|---|---|\n| TCA | amitriptyline \\| nortriptyline |"
    )


def test_table_to_text_empty():
    assert table_to_text([["", ""]]) == ""


def test_prepare_rejects_small_dimensions():
    with pytest.raises(ImageRejected) as err:
        prepare_image(noise_png(60, 300))
    assert err.value.reason == "small"


def test_prepare_rejects_tiny_files():
    with pytest.raises(ImageRejected) as err:
        prepare_image(b"x" * 100)
    assert err.value.reason == "small"


def test_prepare_rejects_unreadable():
    with pytest.raises(ImageRejected) as err:
        prepare_image(b"not an image" * 500)
    assert err.value.reason == "unreadable"


def test_prepare_keeps_png_bytes():
    png = noise_png()
    prepared = prepare_image(png)
    assert prepared.mime == "image/png"
    assert prepared.data == png


def test_prepare_converts_other_formats_to_png():
    prepared = prepare_image(noise_bmp())
    assert prepared.mime == "image/png"
    assert Image.open(io.BytesIO(prepared.data)).format == "PNG"


def test_thumbnail_is_jpeg_max_512():
    thumb = Image.open(io.BytesIO(base64.b64decode(make_thumbnail(noise_png(1200, 600)))))
    assert thumb.format == "JPEG"
    assert max(thumb.size) == 512
