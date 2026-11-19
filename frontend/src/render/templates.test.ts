import { describe, expect, it } from "vitest";
import type { Block } from "../types/page";
import { blockLines, contentLines, SPACER, type RenderContext } from "./templates";

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
    expect(kp).toContain('<span data-edit="p.text">T</span>');
    const acc = re({ type: "accordion", panels: [{ title: "P", blocks: [{ type: "paragraph", text: "a" }, { type: "paragraph", text: "b" }] }] }, "p");
    expect(acc).toContain('<p data-edit="p.panels.0.blocks.1.text">b</p>');
  });
});
