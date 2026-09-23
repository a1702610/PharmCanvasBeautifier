import logging
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.config import settings
from app.extractors.canvas_html import extract_canvas_html
from app.extractors.common import SourceExtract
from app.extractors.docx import extract_docx
from app.extractors.models import ExtractResult, SourceStatus
from app.extractors.pdf import extract_pdf
from app.extractors.pptx import extract_pptx
from app.extractors.stream import assemble

logger = logging.getLogger(__name__)
router = APIRouter()

EXTRACTORS = {".docx": ("docx", extract_docx), ".pptx": ("pptx", extract_pptx), ".pdf": ("pdf", extract_pdf)}
READ_ERROR = "This file couldn't be read. It may be corrupt or password-protected."


async def _run(name: str, kind: str, fn, payload) -> tuple[SourceStatus, SourceExtract | None]:
    try:
        extract = await run_in_threadpool(fn, payload, name)
    except Exception as exc:
        logger.warning("Extraction failed (%s): %s", kind, type(exc).__name__)
        return SourceStatus(name=name, kind=kind, ok=False, error=READ_ERROR), None
    return SourceStatus(name=name, kind=kind, ok=True, warnings=list(extract.warnings)), extract


def _resolve_order(order: list[str], n_files: int, n_canvas: int) -> list[tuple[str, int]]:
    expected = [("file", i) for i in range(n_files)] + [("canvas", i) for i in range(n_canvas)]
    if not order:
        return expected
    keys = []
    for item in order:
        kind, _, index = item.partition(":")
        if kind not in ("file", "canvas") or not index.isdigit():
            raise HTTPException(400, f"Invalid source order entry: {item}")
        keys.append((kind, int(index)))
    if sorted(keys) != sorted(expected):
        raise HTTPException(400, "Source order doesn't match the uploaded sources.")
    return keys


@router.post("/extract", response_model=ExtractResult, response_model_exclude_none=True)
async def extract(
    files: list[UploadFile] = File(default=[]),
    canvas_html: list[str] = Form(default=[]),
    order: list[str] = Form(default=[]),
):
    keys = _resolve_order(order, len(files), len(canvas_html))
    if not keys:
        raise HTTPException(400, "Add at least one file or pasted Canvas page.")
    if len(keys) > settings.MAX_SOURCES:
        raise HTTPException(400, f"Up to {settings.MAX_SOURCES} sources per page.")

    statuses: list[SourceStatus] = []
    good: list[tuple[int, str, SourceExtract]] = []
    for kind, index in keys:
        if kind == "canvas":
            name = f"Pasted Canvas page {index + 1}"
            status, ex = await _run(name, "canvas", extract_canvas_html, canvas_html[index])
        else:
            upload = files[index]
            name = upload.filename or f"File {index + 1}"
            ext = Path(name).suffix.lower()
            if ext not in EXTRACTORS:
                status, ex = SourceStatus(
                    name=name, ok=False,
                    error="Unsupported file type. Use Word (.docx), PowerPoint (.pptx) or PDF.",
                ), None
            else:
                data = await upload.read()
                file_kind, fn = EXTRACTORS[ext]
                if len(data) > settings.max_file_bytes:
                    status, ex = SourceStatus(
                        name=name, kind=file_kind, ok=False,
                        error=f"File is larger than {settings.MAX_FILE_MB} MB.",
                    ), None
                else:
                    status, ex = await _run(name, file_kind, fn, data)
        statuses.append(status)
        if ex is not None:
            good.append((len(statuses) - 1, name, ex))

    assembled = await run_in_threadpool(assemble, [(n, e) for _, n, e in good], settings.MAX_IMAGES_TO_AI)
    for (status_index, _, _), extra in zip(good, assembled.warnings):
        statuses[status_index].warnings.extend(extra)

    return ExtractResult(
        sources=statuses,
        text=assembled.text,
        images=assembled.images,
        embeds=assembled.embeds,
        approx_tokens=len(assembled.text) // 4,
        token_limit=settings.TOKEN_WARN_LIMIT,
    )
