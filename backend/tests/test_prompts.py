from app.ai.prompts import load_prompt


def test_prompts_load():
    assert "You do not write HTML" in load_prompt("system")
    assert "Regenerating one tab" in load_prompt("regenerate_tab")


def test_system_prompt_documents_new_block_types():
    system = load_prompt("system")
    for block_type in ("key_point", "self_check", "counselling", "tip", "critical"):
        assert f"**{block_type}**" in system
    assert "At least one per tab" in system


from app.ai.prompts import build_generate_prompt, build_regenerate_prompt


def test_course_context_included_in_prompts():
    p = build_generate_prompt("", False, "", "SRC", course_context="Course: PHAR3004")
    assert "COURSE CONTEXT" in p and "Course: PHAR3004" in p
    assert p.index("COURSE CONTEXT") < p.index("SOURCE MATERIAL")
    assert "COURSE CONTEXT" not in build_generate_prompt("", False, "", "SRC")
    r = build_regenerate_prompt("{}", [], [], "shorter", "SRC", course_context="CTX")
    assert "COURSE CONTEXT" in r and "CTX" in r


def test_system_prompt_describes_new_blocks_and_rules():
    s = load_prompt("system")
    for word in ["key_point", "flow", "formula", "accordion", "revision", "points", "study_activities", "intro_figure", "~", "^"]:
        assert word in s
    assert "takeaways" not in s
    assert "At least one per tab" in s
    assert "copyright" in s.lower()
    assert "accordion" in load_prompt("regenerate_tab")
