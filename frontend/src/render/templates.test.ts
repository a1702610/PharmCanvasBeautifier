import { describe, expect, it } from "vitest";
import type { Block, InnerBlock } from "../types/page";
import { blockLines, contentLines, SPACER, withAlt, type RenderContext } from "./templates";

const ctx: RenderContext = {
  images: {
    "IMG-01": { ref: "IMG-01", source: "deck.pptx", location: "slide 7", mime: "image/png", data_b64: "AAAA" },
    "IMG-02": { ref: "IMG-02", source: "Pasted Canvas page 1", location: "", canvas_tag: '<img src="https://x/preview" alt="image.png"/>' },
  },
  embeds: {},
};
const r = (b: Block) => blockLines(b, ctx).join("\n");
const HTH = 'style="padding: 11px; text-align: left; border: 1px solid #cbd5e1;" scope="col"';
const TD = 'style="padding: 11px; border: 1px solid #cbd5e1;"';

describe("PHAR3004 templates", () => {
  it("heading", () => {
    expect(r({ type: "heading", text: "Why it matters" })).toBe('<h4 style="color: #140f50;">Why it matters</h4>');
  });

  it("primary table with row labels", () => {
    expect(r({ type: "table", headers: ["Concept", "What it studies"], rows: [["**PK**", "Time course"]] })).toBe(
      [
        '<table style="width: 100%; border-collapse: collapse; margin: 18px 0;">',
        "    <thead>",
        '        <tr style="background: #140f50; color: #ffffff;">',
        `            <th ${HTH}>Concept</th>`,
        `            <th ${HTH}>What it studies</th>`,
        "        </tr>",
        "    </thead>",
        "    <tbody>",
        "        <tr>",
        '            <th style="padding: 11px; background: #f4f2fb; text-align: left; border: 1px solid #cbd5e1;" scope="row">PK</th>',
        `            <td ${TD}>Time course</td>`,
        "        </tr>",
        "    </tbody>",
        "</table>",
      ].join("\n"),
    );
  });

  it("secondary table uses dark amber header and pale amber labels", () => {
    const html = r({ type: "table", headers: ["Route", "Input"], rows: [["IV", "Direct"]], variant: "secondary" });
    expect(html).toContain('<tr style="background: #b45309; color: #ffffff;">');
    expect(html).toContain('background: #fff7ed; text-align: left;');
  });

  it("row_headers false renders the first column as plain td", () => {
    const html = r({ type: "table", headers: ["Time (h)", "Conc"], rows: [["2", "5.13"]], row_headers: false });
    expect(html).not.toContain('scope="row"');
    expect(html).toContain(`<td ${TD}>2</td>`);
  });

  it("flow", () => {
    expect(
      r({ type: "flow", steps: [{ label: "Dose", style: "solid" }, { label: "Concentration", sub: "PK", style: "outline" }, { label: "Effect", style: "amber" }] }),
    ).toBe(
      [
        '<div style="margin: 24px 0;">',
        '    <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; text-align: center;">',
        '        <div style="padding: 13px 18px; background: #140f50; color: #ffffff; border-radius: 8px;"><strong>Dose</strong></div>',
        '        <div style="font-size: 1.5em; color: #d97706;" aria-hidden="true">&rarr;</div>',
        '        <div style="padding: 13px 18px; background: #f4f2fb; border-radius: 8px; border: 2px solid #140f50;"><strong>Concentration</strong><br /><span style="font-size: 0.9em;">PK</span></div>',
        '        <div style="font-size: 1.5em; color: #d97706;" aria-hidden="true">&rarr;</div>',
        '        <div style="padding: 13px 18px; background: #fff7ed; border-radius: 8px; border: 2px solid #d97706;"><strong>Effect</strong></div>',
        "    </div>",
        "</div>",
      ].join("\n"),
    );
  });

  it("formula with note", () => {
    expect(r({ type: "formula", expression: "CL = Q × E", note: "Q = blood flow" })).toBe(
      [
        '<div style="margin: 18px auto; padding: 16px; max-width: 440px; text-align: center; background: #f4f2fb; border-radius: 8px; border: 1px solid #ddd8ef;">',
        '    <p style="margin: 0; font-size: 1.25em;"><strong>CL = Q &times; E</strong></p>',
        '    <p style="margin: 6px 0 0 0; font-size: 0.9em; color: #64748b;">Q = blood flow</p>',
        "</div>",
      ].join("\n"),
    );
  });

  it("key point and clinical", () => {
    expect(r({ type: "key_point", lead: "Distribution is reversible.", text: "Drug moves back." })).toBe(
      '<div style="margin: 20px 0; padding: 16px 18px; border-left: 5px solid #140f50; background: #f4f2fb;"><p style="margin: 0;"><strong>Distribution is reversible.</strong> Drug moves back.</p></div>',
    );
    expect(r({ type: "clinical", body: "Prevention works." })).toBe(
      '<div style="margin: 20px 0; padding: 16px 18px; border-left: 5px solid #d97706; background: #fff7ed;"><p style="margin: 0;"><strong>Why this matters clinically:</strong> Prevention works.</p></div>',
    );
  });

  it("caution with items", () => {
    expect(r({ type: "caution", title: "Before starting", items: ["**Check** renal function"] })).toBe(
      [
        '<div style="margin: 20px 0px; padding: 17px 19px; background: #fff7ed; border-radius: 8px; border: 2px solid #d97706;">',
        '    <p style="margin: 0 0 8px 0;"><strong>Before starting</strong></p>',
        '    <ul style="margin: 0; padding-left: 24px;">',
        "        <li><strong>Check</strong> renal function</li>",
        "    </ul>",
        "</div>",
      ].join("\n"),
    );
  });

  it("critical keeps the red exception", () => {
    expect(r({ type: "critical", body: "Do not combine." })).toBe(
      '<div style="margin: 20px 0; padding: 16px 18px; border-left: 5px solid #b91c1c; background: #fef2f2;"><p style="margin: 0;"><strong style="color: #991b1b;">Critical safety warning</strong> Do not combine.</p></div>',
    );
  });

  it("self check", () => {
    expect(r({ type: "self_check", questions: [{ question: "Q1?", answer: "A1." }] })).toBe(
      [
        '<div style="margin: 20px 0; padding: 16px 18px; border-left: 5px solid #836bff; background: #f4f2fb;">',
        '    <p style="margin: 0 0 8px 0;"><strong style="color: #140f50;">Check your understanding</strong></p>',
        '    <p style="margin: 10px 0 4px 0;"><strong>1.</strong> Q1?</p>',
        "    <details>",
        '        <summary style="cursor: pointer; color: #140f50;">Show answer</summary>',
        '        <p style="margin: 6px 0 0 0;">A1.</p>',
        "    </details>",
        "</div>",
      ].join("\n"),
    );
  });

  it("figure placeholder", () => {
    expect(r({ type: "figure", ref: "IMG-01", alt: "Pathway" })).toBe(
      '<p style="text-align: center; border: 2px dashed #cbd5e1; padding: 20px; color: #64748b;">[ IMAGE IMG-01: Pathway, slide 7 &mdash; delete this line and insert from Canvas Files ]</p>',
    );
  });

  it("accordion with spaced panel content", () => {
    expect(
      r({ type: "accordion", panels: [{ title: "Worked example", blocks: [{ type: "paragraph", text: "Step 1" }, { type: "formula", expression: "k = CL / V" }] }] }),
    ).toBe(
      [
        '<div class="dp-panels-wrapper dp-accordion-default">',
        '    <div class="dp-panel-group">',
        '        <h4 class="dp-panel-heading">Worked example</h4>',
        '        <div class="dp-panel-content">',
        "            <p>Step 1</p>",
        `            ${SPACER}`,
        '            <div style="margin: 18px auto; padding: 16px; max-width: 440px; text-align: center; background: #f4f2fb; border-radius: 8px; border: 1px solid #ddd8ef;">',
        '                <p style="margin: 0; font-size: 1.25em;"><strong>k = CL / V</strong></p>',
        "            </div>",
        `            ${SPACER}`,
        "        </div>",
        "    </div>",
        "</div>",
      ].join("\n"),
    );
  });
});

describe("contentLines spacing", () => {
  const p = (t: string): Block => ({ type: "paragraph", text: t });
  it("no spacer between prose, spacer around major blocks, one trailing spacer", () => {
    const lines = contentLines([p("a"), p("b"), { type: "clinical", body: "c" }, p("d")], ctx);
    expect(lines.filter((l) => l === SPACER)).toHaveLength(3);
    expect(lines[0]).toBe("<p>a</p>");
    expect(lines[1]).toBe("<p>b</p>");
    expect(lines[2]).toBe(SPACER);
    expect(lines[lines.length - 1]).toBe(SPACER);
    expect(lines.join("\n")).not.toContain(`${SPACER}\n${SPACER}`);
  });
  it("empty content is just one spacer", () => {
    expect(contentLines([], ctx)).toEqual([SPACER]);
  });
});

const BOX_AMBER = "margin: 20px 0px; padding: 17px 19px; background: #fff7ed; border-radius: 8px; border: 2px solid #d97706;";
const BOX_BLUE = "margin: 20px 0px; padding: 17px 19px; background: #eff4ff; border-radius: 8px; border: 2px solid #b8caff;";
const ed: RenderContext = { ...ctx, editable: true };
const re = (b: Block, path: string) => blockLines(b, ed, path).join("\n");

describe("remaining components", () => {
  it("caution body-only", () => {
    expect(r({ type: "caution", title: "Careful", body: "Check dose." })).toBe(
      `<div style="${BOX_AMBER}"><p style="margin: 0;"><strong>Careful</strong> Check dose.</p></div>`,
    );
  });
  it("critical with custom title", () => {
    expect(r({ type: "critical", title: "Stop", body: "Now." })).toContain("<strong style=\"color: #991b1b;\">Stop</strong> Now.");
  });
  it("tip", () => {
    expect(r({ type: "tip", body: "Use a spacer." })).toBe(
      '<div style="margin: 20px 0; padding: 16px 18px; border-left: 5px solid #1448ff; background: #eff4ff;"><p style="margin: 0;"><strong style="color: #1039cc;">Pharmacist tip:</strong> Use a spacer.</p></div>',
    );
  });
  it("counselling default and custom title", () => {
    const style = "margin: 20px 0px; padding: 17px 19px; background: #f4f2fb; border-radius: 8px; border: 1px solid #ddd8ef;";
    expect(r({ type: "counselling", items: ["Take with food"] })).toBe(
      [
        `<div style="${style}">`,
        '    <p style="margin: 0 0 8px 0;"><strong style="color: #140f50;">Counselling points</strong></p>',
        '    <ul style="margin: 0; padding-left: 24px;">',
        "        <li>Take with food</li>",
        "    </ul>",
        "</div>",
      ].join("\n"),
    );
    expect(r({ type: "counselling", title: "Tell the patient", items: ["x"] })).toContain("Tell the patient</strong>");
  });
  it("evidence with children", () => {
    expect(
      r({ type: "evidence", title: "Evidence: Trial X", children: [{ type: "paragraph", text: "Result." }, { type: "citation", text: "Smith 2020" }] }),
    ).toBe(
      [
        `<div style="${BOX_BLUE}">`,
        '    <p style="margin: 0 0 8px 0;"><strong style="color: #1039cc;">Evidence: Trial X</strong></p>',
        "    <p>Result.</p>",
        '    <p style="text-align: center;"><span style="font-size: 8pt; color: #64748b;">Smith 2020</span></p>',
        "</div>",
      ].join("\n"),
    );
  });
  it("link", () => {
    expect(r({ type: "link", lead_in: "Guideline", link_text: "Read", url: "https://x.org" })).toBe(
      `<div style="${BOX_BLUE}"><p style="margin: 0;">Guideline: <a href="https://x.org" target="_blank" rel="noopener">Read</a></p></div>`,
    );
  });
  it("legacy takeaways", () => {
    expect(r({ type: "takeaways", items: ["One"] })).toBe(
      [
        '<div style="border: 1px solid #ddd8ef; border-radius: 8px; margin: 16px 0; overflow: hidden;">',
        '    <div style="background: #140f50; color: #ffffff; padding: 8px 16px; font-weight: bold;">Key takeaways</div>',
        '    <ul style="margin: 12px 16px 12px 0; padding-left: 40px;">',
        "        <li>One</li>",
        "    </ul>",
        "</div>",
      ].join("\n"),
    );
  });
  it("contrast table", () => {
    const html = r({ type: "contrast_table", left_header: "Acute", right_header: "Chronic", rows: [["a", "b"]] });
    expect(html).toContain('width: 50%; background: #140f50; color: #ffffff; border: 1px solid #cbd5e1;" scope="col">Acute</th>');
    expect(html).toContain('width: 50%; background: #b45309; color: #ffffff;');
    expect(html).toContain(`<td ${TD}>b</td>`);
  });
  it("table col_widths and multi-paragraph cell", () => {
    const html = r({ type: "table", headers: ["A", "B"], rows: [["x", "p1\n\np2"]], col_widths: [30, 70] });
    expect(html).toContain("text-align: left; width: 30%; border");
    expect(html).toContain(`<td ${TD}>\n                <p>p1</p>\n                <p>p2</p>\n            </td>`);
  });
  it("canvas figure with alt replacement and caption", () => {
    expect(r({ type: "figure", ref: "IMG-02", alt: "Pathway", caption: "Fig 1" })).toBe(
      [
        '<p style="text-align: center;"><img src="https://x/preview" alt="Pathway"/></p>',
        '<p style="text-align: center;"><span style="font-size: 8pt; color: #64748b;">Fig 1</span></p>',
      ].join("\n"),
    );
  });
  it("editable paths", () => {
    const flow = re({ type: "flow", steps: [{ label: "A", style: "solid" }, { label: "B", style: "outline" }] }, "tabs.0.blocks.0");
    expect(flow).toContain('<strong data-edit="tabs.0.blocks.0.steps.1.label">B</strong>');
    expect(re({ type: "formula", expression: "k" }, "p")).toContain('<strong data-edit="p.expression">k</strong>');
    const kp = re({ type: "key_point", lead: "L.", text: "T" }, "p");
    expect(kp).toContain('<span data-edit="p.lead">L.</span>');
    expect(kp).toContain('<span data-edit="p.text" data-bullets="1">T</span>');
    const acc = re({ type: "accordion", panels: [{ title: "P", blocks: [{ type: "paragraph", text: "a" }, { type: "paragraph", text: "b" }] }] }, "p");
    expect(acc).toContain('<p data-edit="p.panels.0.blocks.1.text" data-enter="split" data-autolist="1">b</p>');
  });
});

describe("fix round 1 additions", () => {
  it("paragraph and lists", () => {
    expect(r({ type: "paragraph", text: "Hello **world**" })).toBe("<p>Hello <strong>world</strong></p>");
    expect(r({ type: "list", ordered: false, items: ["a", "b"] })).toBe("<ul>\n    <li>a</li>\n    <li>b</li>\n</ul>");
    expect(r({ type: "list", ordered: true, items: ["a", "b"] })).toBe("<ol>\n    <li>a</li>\n    <li>b</li>\n</ol>");
  });
  it("self check with two questions", () => {
    const html = r({ type: "self_check", questions: [{ question: "Q1?", answer: "A1." }, { question: "Q2?", answer: "A2." }] });
    expect(html).toContain('<strong>1.</strong> Q1?');
    expect(html).toContain('<strong>2.</strong> Q2?');
    expect(html).toContain('<p style="margin: 6px 0 0 0;">A2.</p>');
    expect(html.match(/<details>/g)).toHaveLength(2);
  });
  it("accordion with two panels has no spacer between panel groups", () => {
    const panel = (t: string) => ({ title: t, blocks: [{ type: "paragraph" as const, text: "x" }] });
    expect(r({ type: "accordion", panels: [panel("One"), panel("Two")] })).toBe(
      [
        '<div class="dp-panels-wrapper dp-accordion-default">',
        '    <div class="dp-panel-group">',
        '        <h4 class="dp-panel-heading">One</h4>',
        '        <div class="dp-panel-content">',
        "            <p>x</p>",
        `            ${SPACER}`,
        "        </div>",
        "    </div>",
        '    <div class="dp-panel-group">',
        '        <h4 class="dp-panel-heading">Two</h4>',
        '        <div class="dp-panel-content">',
        "            <p>x</p>",
        `            ${SPACER}`,
        "        </div>",
        "    </div>",
        "</div>",
      ].join("\n"),
    );
  });
  it("link with non-http url renders no anchor", () => {
    const html = r({ type: "link", lead_in: "Open", link_text: "Click", url: "javascript:alert(1)" });
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href");
    expect(html).toContain("Click");
  });
  it("withAlt", () => {
    expect(withAlt('<img src="x" alt="Good description"/>', "New")).toBe('<img src="x" alt="Good description"/>');
    expect(withAlt('<img src="x"/>', "New")).toBe('<img alt="New" src="x"/>');
    expect(withAlt('<img src="x" alt="image.png"/>', "New")).toBe('<img src="x" alt="New"/>');
  });
  it("editable: no path means no data-edit", () => {
    expect(blockLines({ type: "paragraph", text: "a" }, ed).join("")).toBe("<p>a</p>");
  });
  it("editable: caution, counselling, figure caption paths", () => {
    const c = re({ type: "caution", title: "T", body: "B", items: ["i"] }, "p");
    expect(c).toContain('<strong data-edit="p.title">T</strong>');
    expect(c).toContain('<span data-edit="p.body" data-bullets="1">B</span>');
    expect(c).toContain('<li><span data-edit="p.items.0" data-enter="split">i</span>');
    expect(re({ type: "counselling", items: ["i"] }, "p")).not.toMatch(/data-edit="p\.title"/);
    expect(re({ type: "counselling", title: "Custom", items: ["i"] }, "p")).toContain('<strong data-edit="p.title" style="color: #140f50;">Custom</strong>');
    expect(re({ type: "figure", ref: "IMG-02", alt: "A", caption: "Cap" }, "p")).toContain('data-edit="p.caption"');
  });
});

describe("editor add/delete controls", () => {
  const ed: RenderContext = { ...ctx, editable: true };
  const para = (text: string): InnerBlock => ({ type: "paragraph", text });

  it("non-editable content has no controls", () => {
    const html = contentLines([para("a"), para("b")], ctx, "tabs.0.blocks").join("\n");
    expect(html).not.toContain("data-pc-");
    expect(html).not.toContain("pc-block");
  });

  it("editable content wraps each block with a delete button and puts an add slot before each block and at the end", () => {
    const html = contentLines([para("a"), { type: "clinical", body: "c" }], ed, "tabs.0.blocks").join("\n");
    for (const i of [0, 1, 2]) expect(html).toContain(`data-pc-action="add" data-pc-list="tabs.0.blocks" data-pc-index="${i}"`);
    expect(html).not.toContain('data-pc-index="3"');
    expect(html).toContain('<div class="pc-block">');
    expect(html).toContain('data-pc-action="delete" data-pc-path="tabs.0.blocks.0"');
    expect(html).toContain('data-pc-action="delete" data-pc-path="tabs.0.blocks.1"');
    expect(html).toContain('<p data-edit="tabs.0.blocks.0.text" data-enter="split" data-autolist="1">a</p>');
  });

  it("an empty list still gets one add slot", () => {
    const html = contentLines([], ed, "tabs.0.blocks").join("\n");
    expect(html).toContain('data-pc-list="tabs.0.blocks" data-pc-index="0"');
  });

  it("editable content without a path (e.g. study materials) has no controls", () => {
    expect(contentLines([para("a")], ed).join("\n")).not.toContain("data-pc-");
  });

  it("accordion: editable panel titles, delete-panel buttons, add-panel slot and inner add slots", () => {
    const acc: Block = { type: "accordion", panels: [{ title: "Worked example", blocks: [para("x")] }, { title: "Case", blocks: [] }] };
    const html = blockLines(acc, ed, "tabs.0.blocks.2").join("\n");
    expect(html).toContain('<span data-edit="tabs.0.blocks.2.panels.0.title" data-enter="none">Worked example</span>');
    expect(html).toContain('data-pc-action="delete" data-pc-path="tabs.0.blocks.2.panels.1"');
    expect(html).toContain('data-pc-action="add-panel" data-pc-list="tabs.0.blocks.2.panels" data-pc-index="2"');
    expect(html).toContain('data-pc-list="tabs.0.blocks.2.panels.1.blocks" data-pc-index="0"');
    // Canvas output is unchanged
    expect(blockLines(acc, ctx, "tabs.0.blocks.2").join("\n")).toContain('<h4 class="dp-panel-heading">Worked example</h4>');
  });

  it("a figure added in the editor (no image ref) renders a clean placeholder", () => {
    expect(r({ type: "figure", ref: "", alt: "describe the image" })).toContain("[ IMAGE: describe the image &mdash;");
  });
});

describe("editor controls inside sections", () => {
  const ed: RenderContext = { ...ctx, editable: true };
  const re = (b: Block, path = "tabs.0.blocks.0") => blockLines(b, ed, path).join("\n");

  it("bullet points: delete per point and add point; Canvas output unchanged", () => {
    const html = re({ type: "list", ordered: false, items: ["a", "b"] });
    expect(html).toContain('<li><span data-edit="tabs.0.blocks.0.items.0" data-enter="split">a</span> <button type="button" class="pc-del pc-inline-del" data-pc-action="delete" data-pc-path="tabs.0.blocks.0.items.0"');
    expect(html).toContain('data-pc-action="add-item" data-pc-list="tabs.0.blocks.0.items" data-pc-index="2">+ Add point</button>');
    expect(blockLines({ type: "list", ordered: false, items: ["a"] }, ctx, "tabs.0.blocks.0").join("\n")).toBe("<ul>\n    <li>a</li>\n</ul>");
  });

  it("callout bullet points get the same controls", () => {
    const html = re({ type: "caution", title: "T", items: ["x"] });
    expect(html).toContain('data-pc-path="tabs.0.blocks.0.items.0"');
    expect(html).toContain('data-pc-list="tabs.0.blocks.0.items"');
  });

  it("table: delete per row and per column, add row and add column", () => {
    const html = re({ type: "table", headers: ["A", "B"], rows: [["1", "2"], ["3", "4"]] });
    expect(html).toContain('<tr class="pc-ctl-row">');
    expect(html).toContain('data-pc-action="delete-column" data-pc-path="tabs.0.blocks.0" data-pc-index="0"');
    expect(html).toContain('data-pc-action="delete-column" data-pc-path="tabs.0.blocks.0" data-pc-index="1"');
    expect(html).toContain('data-pc-action="add-column" data-pc-path="tabs.0.blocks.0"');
    expect(html).toContain('<td class="pc-ctl"><button type="button" class="pc-del pc-inline-del" data-pc-action="delete" data-pc-path="tabs.0.blocks.0.rows.1"');
    expect(html).toContain('data-pc-action="add-item" data-pc-list="tabs.0.blocks.0.rows" data-pc-index="2">+ Add row</button>');
    expect(blockLines({ type: "table", headers: ["A", "B"], rows: [["1", "2"]] }, ctx, "tabs.0.blocks.0").join("\n")).not.toContain("pc-");
  });

  it("a one-column table can't lose its last column", () => {
    expect(re({ type: "table", headers: ["A"], rows: [["1"]] })).not.toContain("delete-column");
  });

  it("comparison table: rows only", () => {
    const html = re({ type: "contrast_table", left_header: "L", right_header: "R", rows: [["a", "b"]] });
    expect(html).toContain('data-pc-path="tabs.0.blocks.0.rows.0"');
    expect(html).toContain('data-pc-list="tabs.0.blocks.0.rows" data-pc-index="1">+ Add row</button>');
    expect(html).not.toContain("column");
  });

  it("check your understanding: delete and add questions", () => {
    const html = re({ type: "self_check", questions: [{ question: "Q1?", answer: "A1." }, { question: "Q2?", answer: "A2." }] });
    expect(html).toContain('data-pc-path="tabs.0.blocks.0.questions.1"');
    expect(html).toContain('data-pc-list="tabs.0.blocks.0.questions" data-pc-index="2">+ Add question</button>');
  });

  it("flow: delete steps (only while more than two) and add a step", () => {
    const three = re({ type: "flow", steps: [{ label: "a", style: "solid" }, { label: "b", style: "outline" }, { label: "c", style: "amber" }] });
    expect(three).toContain('data-pc-path="tabs.0.blocks.0.steps.2"');
    expect(three).toContain('data-pc-list="tabs.0.blocks.0.steps" data-pc-index="3">+ Add step</button>');
    const two = re({ type: "flow", steps: [{ label: "a", style: "solid" }, { label: "b", style: "outline" }] });
    expect(two).not.toContain('data-pc-path="tabs.0.blocks.0.steps.');
  });
});

describe("Enter-key markers (edit mode only)", () => {
  const ed: RenderContext = { ...ctx, editable: true };
  it("paragraphs split and auto-bullet, headings split, other text gets no marker", () => {
    expect(blockLines({ type: "heading", text: "H" }, ed, "tabs.0.blocks.0").join("")).toBe('<h4 data-edit="tabs.0.blocks.0.text" data-enter="split" style="color: #140f50;">H</h4>');
    expect(blockLines({ type: "clinical", body: "B" }, ed, "tabs.0.blocks.0").join("")).not.toContain("data-enter");
    expect(blockLines({ type: "paragraph", text: "P" }, ctx, "tabs.0.blocks.0").join("")).toBe("<p>P</p>");
  });
});

describe("bullet lines inside cells and callouts", () => {
  const ed: RenderContext = { ...ctx, editable: true };
  it("a table cell with '- ' lines renders a list in the cell", () => {
    const html = r({ type: "table", headers: ["A"], row_headers: false, rows: [["Intro\n- a\n* **b**"]] });
    expect(html).toContain(
      [
        `<td ${TD}>`,
        "                <p>Intro</p>",
        '                <ul style="margin: 0; padding-left: 24px;">',
        "                    <li>a</li>",
        "                    <li><strong>b</strong></li>",
        "                </ul>",
        "            </td>",
      ].join("\n"),
    );
  });

  it("editable cells and callout text accept bullets", () => {
    expect(blockLines({ type: "table", headers: ["A"], row_headers: false, rows: [["x"]] }, ed, "p").join("")).toContain('<td data-edit="p.rows.0.0" data-bullets="1" style=');
    expect(blockLines({ type: "clinical", body: "x" }, ed, "p").join("")).toContain('<span data-edit="p.body" data-bullets="1">x</span>');
  });

  it("a callout body with '- ' lines puts the title on its own line and lists the bullets", () => {
    expect(r({ type: "clinical", body: "Watch for:\n- K^+^\n- creatinine" })).toBe(
      [
        '<div style="margin: 20px 0; padding: 16px 18px; border-left: 5px solid #d97706; background: #fff7ed;">',
        '    <p style="margin: 0 0 8px 0;"><strong>Why this matters clinically:</strong></p>',
        '    <p style="margin: 0 0 6px 0;">Watch for:</p>',
        '    <ul style="margin: 0; padding-left: 24px;">',
        "        <li>K<sup>+</sup></li>",
        "        <li>creatinine</li>",
        "    </ul>",
        "</div>",
      ].join("\n"),
    );
    const editable = blockLines({ type: "clinical", body: "- a" }, ed, "p").join("\n");
    expect(editable).toContain('<div data-edit="p.body" data-bullets="1">');
  });

  it("a key point with bullets keeps its lead on the first line", () => {
    const html = r({ type: "key_point", lead: "Remember.", text: "- one\n- two" });
    expect(html).toContain('<p style="margin: 0 0 8px 0;"><strong>Remember.</strong></p>');
    expect(html).toContain("<li>one</li>");
  });
});
