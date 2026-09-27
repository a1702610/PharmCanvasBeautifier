from app.ai.prompts import load_prompt


def test_prompts_load():
    assert "You do not write HTML" in load_prompt("system")
    assert "Regenerating one tab" in load_prompt("regenerate_tab")


def test_system_prompt_documents_new_block_types():
    system = load_prompt("system")
    for block_type in ("takeaways", "self_check", "counselling", "tip", "critical"):
        assert f"**{block_type}**" in system
    assert "At least one per tab" in system
