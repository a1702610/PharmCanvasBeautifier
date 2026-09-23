import io
import os

from PIL import Image


def noise_png(w: int = 200, h: int = 200) -> bytes:
    """Random-noise PNG: incompressible, so it passes the 3 KB size filter."""
    img = Image.frombytes("RGB", (w, h), os.urandom(w * h * 3))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def noise_bmp(w: int = 200, h: int = 200) -> bytes:
    img = Image.frombytes("RGB", (w, h), os.urandom(w * h * 3))
    buf = io.BytesIO()
    img.save(buf, "BMP")
    return buf.getvalue()
