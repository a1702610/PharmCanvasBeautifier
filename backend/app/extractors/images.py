import base64
import hashlib
import io
from dataclasses import dataclass

from PIL import Image

MIN_SIDE = 80
MIN_BYTES = 3000
THUMB_SIDE = 512
WEB_FORMATS = {"PNG": "image/png", "JPEG": "image/jpeg", "GIF": "image/gif", "WEBP": "image/webp"}


class ImageRejected(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason  # "small" | "unreadable"


@dataclass
class PreparedImage:
    data: bytes
    mime: str


def image_hash(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def prepare_image(data: bytes) -> PreparedImage:
    """Reject tiny/unreadable images; convert non-web formats to PNG."""
    if len(data) < MIN_BYTES:
        raise ImageRejected("small")
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.load()
            if min(im.size) < MIN_SIDE:
                raise ImageRejected("small")
            fmt = (im.format or "").upper()
            if fmt in WEB_FORMATS:
                return PreparedImage(data=data, mime=WEB_FORMATS[fmt])
            buf = io.BytesIO()
            im.convert("RGBA").save(buf, "PNG")
            return PreparedImage(data=buf.getvalue(), mime="image/png")
    except ImageRejected:
        raise
    except Exception as exc:
        raise ImageRejected("unreadable") from exc


def make_thumbnail(data: bytes) -> str:
    with Image.open(io.BytesIO(data)) as im:
        rgb = im.convert("RGB")
    rgb.thumbnail((THUMB_SIDE, THUMB_SIDE))
    buf = io.BytesIO()
    rgb.save(buf, "JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode("ascii")
