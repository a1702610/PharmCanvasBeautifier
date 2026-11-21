from functools import lru_cache
from pathlib import Path

PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts"


@lru_cache
def load_prompt(name: str) -> str:
    return (PROMPT_DIR / f"{name}.md").read_text(encoding="utf-8")


COURSE_CONTEXT_HEADER = "COURSE CONTEXT (use to pitch the level and connect content; do not reproduce it on the page):"


def _course_section(course_context: str) -> list[str]:
    ctx = course_context.strip()
    return [COURSE_CONTEXT_HEADER + "\n<<<\n" + ctx + "\n>>>"] if ctx else []


def build_generate_prompt(
    title: str, include_revision: bool, instructions: str, text: str, course_context: str = ""
) -> str:
    lines = []
    if title.strip():
        lines.append(f"Page title chosen by the lecturer: {title.strip()}")
    lines.append(
        "Include revision block: "
        + ("yes" if include_revision else "only if the source contains revision questions or a quiz/H5P embed")
    )
    if instructions.strip():
        lines.append(
            "Lecturer's instructions (follow them unless they conflict with the content rules):\n"
            + instructions.strip()
        )
    lines.extend(_course_section(course_context))
    lines.append("SOURCE MATERIAL:\n<<<\n" + text + "\n>>>")
    return "\n\n".join(lines)
