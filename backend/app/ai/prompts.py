from functools import lru_cache
from pathlib import Path

PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts"


@lru_cache
def load_prompt(name: str) -> str:
    return (PROMPT_DIR / f"{name}.md").read_text(encoding="utf-8")


def build_generate_prompt(title: str, include_revision: bool, instructions: str, text: str) -> str:
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
    lines.append("SOURCE MATERIAL:\n<<<\n" + text + "\n>>>")
    return "\n\n".join(lines)


def build_regenerate_prompt(tab_json: str, other_titles: list[str], intro: list[str], instruction: str, text: str) -> str:
    lines = [
        "Page introduction:\n" + ("\n".join(intro) if intro else "(none)"),
        "Other tabs on this page (do not repeat their content): "
        + (", ".join(other_titles) if other_titles else "(none)"),
        "Current tab JSON:\n" + tab_json,
        "Lecturer's instruction for this tab:\n" + instruction.strip(),
        "SOURCE MATERIAL:\n<<<\n" + text + "\n>>>",
    ]
    return "\n\n".join(lines)
