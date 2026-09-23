from app.ai.prompts import load_prompt


def test_prompts_load():
    assert "You do not write HTML" in load_prompt("system")
    assert "Regenerating one tab" in load_prompt("regenerate_tab")
