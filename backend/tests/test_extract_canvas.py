from app.extractors.canvas_html import extract_canvas_html
from app.extractors.common import PLACEHOLDER_RE

HTML = """<div id="dp-wrapper" class="dp-wrapper"><div class="dp-content-block">
<p class="font-claude-response-body break-words" dir="ltr">Chronic pain is different.</p>
<div class="dp-panels-wrapper dp-tabs-pills-group-vertical"><div class="dp-panel-group">
<h3 class="dp-panel-heading">Overview</h3><div class="dp-panel-content">
<h4 style="color: #1e3a5f;">Why it matters</h4>
<ul><li>Common</li><li>Disabling<ul><li>Costly</li></ul></li></ul>
<table><thead><tr><th>Category</th><th>Risk factors</th></tr></thead>
<tbody><tr><td><strong>Psychological</strong></td><td>Depression</td></tr></tbody></table>
<div style="border-left: 4px solid #0d9488;"><strong>Why this matters clinically</strong><br />Prevention works.</div>
<p style="text-align: center;"><img src="https://learn.adelaide.edu.au/courses/1/files/2/preview" alt="image.png" width="616" height="394" data-api-endpoint="https://learn.adelaide.edu.au/api/v1/courses/1/files/2" data-api-returntype="File" /></p>
<p>Read the <a href="https://www.penington.org.au/report.pdf" target="_blank">2025 Report</a>.</p>
</div></div></div></div></div>
<div><iframe src="https://learn.adelaide.edu.au/courses/1/external_tools/retrieve?x=1&amp;y=2" title=""></iframe></div>"""


def test_canvas_structure_is_preserved():
    ex = extract_canvas_html(HTML, "Pasted Canvas page 1")
    lines = ex.text.split("\n")
    assert "Chronic pain is different." in lines
    assert "## Overview" in lines
    assert "#### Why it matters" in lines
    assert "- Common" in lines
    assert "- Disabling" in lines
    assert "  - Costly" in lines
    assert "| Category | Risk factors |" in lines
    assert "| Psychological | Depression |" in lines
    assert "Why this matters clinically Prevention works." in lines
    assert "Read the [2025 Report](https://www.penington.org.au/report.pdf)." in lines
    assert "font-claude" not in ex.text


def test_canvas_images_and_iframes_become_refs():
    ex = extract_canvas_html(HTML, "Pasted Canvas page 1")
    kinds = [m.group(1) for m in PLACEHOLDER_RE.finditer(ex.text)]
    assert kinds == ["IMG", "EMBED"]
    tag = ex.images[0].canvas_tag
    assert ex.images[0].data is None
    assert 'src="https://learn.adelaide.edu.au/courses/1/files/2/preview"' in tag
    assert 'data-api-endpoint="https://learn.adelaide.edu.au/api/v1/courses/1/files/2"' in tag
    assert ex.embeds[0].startswith("<iframe")
    assert "external_tools/retrieve" in ex.embeds[0]
