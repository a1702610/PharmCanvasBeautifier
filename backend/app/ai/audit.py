"""The automatic check: a second Gemini call compares the finished page with the source and
lists what's missing, changed or added, as notes for the lecturer."""
from typing import Any

from app.ai.schema import Note, Page, WireAuditIssue
from app.ai.validate import SourceContext, unit_label

MAX_ISSUES = 40

HEADINGS = {
    "missing": ("unplaced", "Missing from the page (found by the automatic check against your slides):"),
    "changed": ("flag", "Changed from your slides (found by the automatic check):"),
    "added": ("flag", "Not in your slides (found by the automatic check):"),
}
CLEAN_MESSAGE = (
    "The automatic check against your slides didn't find missing or changed content. "
    "It can still miss things, so skim the page against your material."
)

CALLOUT_LABELS = {
    "clinical": "Why this matters clinically",
    "caution": "Caution",
    "critical": "Critical safety warning",
    "tip": "Pharmacist tip",
    "counselling": "Counselling points",
    "key_point": "Key point",
    "takeaways": "Key takeaways",
}


def _block_lines(block: dict[str, Any], depth: int = 0) -> list[str]:
    t = block.get("type")
    pad = "  " * depth
    lines: list[str] = []
    if t == "heading":
        lines.append(f"### {block['text']}")
    elif t in ("paragraph", "citation"):
        lines.append(block["text"])
    elif t in ("list", "references"):
        lines += [f"- {item}" for item in block["items"]]
    elif t == "table":
        lines.append(" | ".join(block["headers"]))
        lines += [" | ".join(row) for row in block["rows"]]
    elif t == "contrast_table":
        lines.append(f"{block['left_header']} | {block['right_header']}")
        lines += [" | ".join(row) for row in block["rows"]]
    elif t == "flow":
        lines.append(" → ".join(s["label"] + (f" ({s['sub']})" if s.get("sub") else "") for s in block["steps"]))
    elif t == "formula":
        lines.append(block["expression"] + (f" ({block['note']})" if block.get("note") else ""))
    elif t in CALLOUT_LABELS:
        title = block.get("title") or block.get("lead") or CALLOUT_LABELS[t]
        lines.append(f"[{CALLOUT_LABELS[t]}] {title}")
        for key in ("body", "text"):
            if block.get(key) and block.get(key) != title:
                lines.append(block[key])
        lines += [f"- {item}" for item in block.get("items") or []]
    elif t == "evidence":
        lines.append(f"[Evidence] {block['title']}")
        for child in block["children"]:
            lines += _block_lines(child, depth + 1)
    elif t == "link":
        lines.append(f"{block['lead_in']}: {block['link_text']} ({block['url']})")
    elif t == "figure":
        lines.append(f"[Figure {block['ref']}: {block['alt']}]")
    elif t == "self_check":
        for q in block["questions"]:
            lines += [f"Q: {q['question']}", f"A: {q['answer']}"]
    elif t == "accordion":
        for panel in block["panels"]:
            lines.append(f"#### {panel['title']} (collapsible)")
            for inner in panel["blocks"]:
                lines += _block_lines(inner, depth + 1)
    return [pad + line for line in lines]


def page_to_text(page: Page) -> str:
    """The page's teaching content as plain text, for the check (not the Canvas HTML)."""
    data = page.model_dump(exclude_none=True)
    lines = [f"# {data['title']}", *data["intro"]]
    for i, tab in enumerate(data["tabs"], start=1):
        lines += ["", f"## Tab {i}: {tab['title']}"]
        for block in tab["blocks"]:
            lines += _block_lines(block)
    points = data.get("revision", {}).get("points") or []
    if points:
        lines += ["", "## Revision check", *[f"- {p}" for p in points]]
    return "\n".join(lines)


def audit_notes(issues: list[WireAuditIssue], ctx: SourceContext) -> list[Note]:
    """Groups the check's findings into one note per kind, each finding on its own line."""
    grouped: dict[str, list[str]] = {kind: [] for kind in HEADINGS}
    count = 0
    for issue in issues:
        detail = (issue.detail or "").strip()
        if not detail or issue.kind not in HEADINGS or count >= MAX_ISSUES:
            continue
        key = (issue.source, issue.unit)
        where = f"{unit_label(ctx, key)}: " if key in ctx.units else ""
        grouped[issue.kind].append(f"- {where}{detail}")
        count += 1
    notes = [
        Note(kind=HEADINGS[kind][0], text="\n".join([HEADINGS[kind][1], *lines]))
        for kind, lines in grouped.items()
        if lines
    ]
    return notes or [Note(kind="flag", text=CLEAN_MESSAGE)]
