import { describe, expect, it } from "vitest";
import type { Block } from "../types/page";
import { blockLines, type RenderContext, withAlt } from "./templates";

const TD = 'style="padding: 10px 12px; vertical-align: top; border: 1px solid #cbd5e1;"';
const ctx: RenderContext = {
  images: {
    "IMG-01": { ref: "IMG-01", source: "deck.pptx", location: "slide 7", mime: "image/png", data_b64: "AAAA" },
    "IMG-02": {
      ref: "IMG-02",
      source: "Pasted Canvas page 1",
      location: "",
      canvas_tag: '<img src="https://learn.adelaide.edu.au/courses/1/files/2/preview" alt="image.png" width="616" height="394" data-api-endpoint="https://learn.adelaide.edu.au/api/v1/courses/1/files/2" data-api-returntype="File"/>',
    },
  },
  embeds: {},
};
const render = (b: Block) => blockLines(b, ctx).join("\n");

describe("block templates", () => {
  it("heading", () => {
    expect(render({ type: "heading", text: "Why it matters" })).toBe('<h4 style="color: #1e3a5f;">Why it matters</h4>');
  });

  it("paragraph and list", () => {
    expect(render({ type: "paragraph", text: "Body" })).toBe("<p>Body</p>");
    expect(render({ type: "list", ordered: false, items: ["A", "B"] })).toBe("<ul>\n    <li>A</li>\n    <li>B</li>\n</ul>");
    expect(render({ type: "list", ordered: true, items: ["A"] })).toBe("<ol>\n    <li>A</li>\n</ol>");
  });

  it("standard table: default widths, bold label column, zebra rows, multi-paragraph cells", () => {
    const html = render({
      type: "table",
      headers: ["Category", "Risk factors"],
      rows: [
        ["**Pain-related**", "Severe acute pain"],
        ["Psychological", "Depression\n\nAnxiety"],
      ],
    });
    expect(html).toBe(
      [
        '<table style="border-collapse: collapse; width: 100%; margin: 16px 0;">',
        "    <thead>",
        "        <tr>",
        '            <th style="background-color: #1e3a5f; color: #ffffff; padding: 10px 12px; text-align: left; width: 26%; border: 1px solid #1e3a5f;">Category</th>',
        '            <th style="background-color: #1e3a5f; color: #ffffff; padding: 10px 12px; text-align: left; border: 1px solid #1e3a5f;">Risk factors</th>',
        "        </tr>",
        "    </thead>",
        "    <tbody>",
        "        <tr>",
        `            <td ${TD}><strong>Pain-related</strong></td>`,
        `            <td ${TD}>Severe acute pain</td>`,
        "        </tr>",
        '        <tr style="background-color: #f1f5f9;">',
        `            <td ${TD}><strong>Psychological</strong></td>`,
        `            <td ${TD}>`,
        "                <p>Depression</p>",
        "                <p>Anxiety</p>",
        "            </td>",
        "        </tr>",
        "    </tbody>",
        "</table>",
      ].join("\n"),
    );
  });

  it("table with three columns spreads widths evenly unless given", () => {
    const even = render({ type: "table", headers: ["A", "B", "C"], rows: [["1", "2", "3"]] });
    expect(even.match(/width: 33\.33%;/g)).toHaveLength(3);
    const given = render({ type: "table", headers: ["A", "B", "C"], col_widths: [6.70732, 16.17, 77.12], rows: [["1", "2", "3"]] });
    expect(given).toContain("width: 6.71%;");
    expect(given).toContain("width: 77.12%;");
  });

  it("contrast table", () => {
    expect(render({ type: "contrast_table", left_header: "Acute pain", right_header: "Chronic pain", rows: [["Symptom", "Disease"]] })).toBe(
      [
        '<table style="border-collapse: collapse; width: 100%; margin: 16px 0;">',
        "    <thead>",
        "        <tr>",
        '            <th style="background-color: #166534; color: #ffffff; padding: 10px 12px; text-align: left; width: 50%; border: 1px solid #166534;">Acute pain</th>',
        '            <th style="background-color: #b91c1c; color: #ffffff; padding: 10px 12px; text-align: left; width: 50%; border: 1px solid #b91c1c;">Chronic pain</th>',
        "        </tr>",
        "    </thead>",
        "    <tbody>",
        "        <tr>",
        `            <td ${TD}>Symptom</td>`,
        `            <td ${TD}>Disease</td>`,
        "        </tr>",
        "    </tbody>",
        "</table>",
      ].join("\n"),
    );
  });

  it("clinical callout", () => {
    expect(render({ type: "clinical", body: "Prevention works." })).toBe(
      '<div style="border-left: 4px solid #0d9488; background-color: #f0fdfa; padding: 14px 18px; margin: 16px 0; border-radius: 0 6px 6px 0;"><strong style="color: #0f766e;">Why this matters clinically</strong><br />Prevention works.</div>',
    );
  });

  it("caution callout with items and with body", () => {
    expect(render({ type: "caution", title: "If using an opioid, consider:", items: ["**Start low** - go slow"] })).toBe(
      [
        '<div style="border-left: 4px solid #f59e0b; background-color: #fffbeb; padding: 14px 18px; margin: 16px 0; border-radius: 0 6px 6px 0;"><strong style="color: #b45309;">If using an opioid, consider:</strong>',
        '    <ul style="margin: 8px 0 0 0;">',
        "        <li><strong>Start low</strong> - go slow</li>",
        "    </ul>",
        "</div>",
      ].join("\n"),
    );
    expect(render({ type: "caution", title: "Red flag", body: "Refer urgently." })).toBe(
      '<div style="border-left: 4px solid #f59e0b; background-color: #fffbeb; padding: 14px 18px; margin: 16px 0; border-radius: 0 6px 6px 0;"><strong style="color: #b45309;">Red flag</strong><br />Refer urgently.</div>',
    );
  });

  it("evidence box with summary, figure, citation and references", () => {
    expect(
      render({
        type: "evidence",
        title: "Evidence: Paracetamol in chronic pain",
        children: [
          { type: "paragraph", text: "Little efficacy." },
          { type: "figure", ref: "IMG-01", alt: "Forest plot" },
          { type: "citation", text: "Ennis ZN. *Basic Clin Pharmacol Toxicol*. 2016." },
          { type: "list", items: ["Finding"] },
          { type: "references", items: ["Ref A"] },
        ],
      }),
    ).toBe(
      [
        '<div style="background-color: #eef2ff; padding: 16px 18px; margin: 16px 0px; border-radius: 6px; border: 1px solid #c7d2fe;">',
        '    <p style="margin-top: 0;"><strong style="color: #3730a3;">Evidence: Paracetamol in chronic pain</strong></p>',
        "    <p>Little efficacy.</p>",
        '    <p style="text-align: center; border: 2px dashed #94a3b8; padding: 24px; color: #64748b;">[INSERT IMAGE IMG-01: Forest plot, slide 7]</p>',
        '    <p style="text-align: center;"><span style="font-size: 8pt; color: #64748b;">Ennis ZN. <em>Basic Clin Pharmacol Toxicol</em>. 2016.</span></p>',
        '    <ul style="margin: 0;">',
        "        <li>Finding</li>",
        "    </ul>",
        '    <p style="margin-bottom: 4px;"><span style="text-decoration: underline;">References:</span></p>',
        '    <p style="margin: 4px 0;"><span style="font-size: 8pt; color: #64748b;">Ref A</span></p>',
        "</div>",
      ].join("\n"),
    );
  });

  it("link callout", () => {
    expect(render({ type: "link", lead_in: "To read more on the report:", url: "https://x.org/a.pdf", link_text: "2025 Report" })).toBe(
      '<div style="border-left: 4px solid #2563eb; background-color: #eff6ff; padding: 14px 18px; margin: 16px 0; border-radius: 0 6px 6px 0;">To read more on the report: <a href="https://x.org/a.pdf" target="_blank" rel="noopener">2025 Report</a></div>',
    );
    expect(render({ type: "link", lead_in: "Guidance", url: "https://x.org", link_text: "TGA" })).toContain(">Guidance: <a ");
  });

  it("figure placeholder and caption", () => {
    expect(render({ type: "figure", ref: "IMG-01", alt: "Opioid ladder", caption: "AMH Online" })).toBe(
      [
        '<p style="text-align: center; border: 2px dashed #94a3b8; padding: 24px; color: #64748b;">[INSERT IMAGE IMG-01: Opioid ladder, slide 7]</p>',
        '<p style="text-align: center;"><span style="font-size: 8pt; color: #64748b;">AMH Online</span></p>',
      ].join("\n"),
    );
  });

  it("canvas figure keeps the original tag, replacing a filename alt", () => {
    expect(render({ type: "figure", ref: "IMG-02", alt: "Opioid ladder" })).toBe(
      '<p style="text-align: center;"><img src="https://learn.adelaide.edu.au/courses/1/files/2/preview" alt="Opioid ladder" width="616" height="394" data-api-endpoint="https://learn.adelaide.edu.au/api/v1/courses/1/files/2" data-api-returntype="File"/></p>',
    );
  });
});

describe("withAlt", () => {
  it("keeps a meaningful alt", () => {
    const tag = '<img alt="WHO ladder" src="x"/>';
    expect(withAlt(tag, "Other")).toBe(tag);
  });
  it("adds alt when missing", () => {
    expect(withAlt('<img src="x"/>', "Chart")).toBe('<img alt="Chart" src="x"/>');
  });
});
