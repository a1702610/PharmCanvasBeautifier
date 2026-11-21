// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Page } from "../types/page";
import { setAtPath } from "./editing";
import { buildContext, renderPage } from "./renderPage";

// One tab exercising every block type, plus every EvidenceChild type, so the contract test
// below can walk every data-edit path the renderer is capable of emitting.
const contractPage: Page = {
  title: "Everything",
  intro: ["Intro paragraph."],
  tabs: [
    {
      id: "t1",
      title: "Overview",
      blocks: [
        { type: "key_point", lead: "L", text: "T" },
        { type: "flow", steps: [{ label: "Step A", style: "solid" }, { label: "Step B", sub: "Sub B", style: "outline" }] },
        { type: "formula", expression: "x = y", note: "Formula note" },
        { type: "table", headers: ["SH1", "SH2"], rows: [["S1C1", "S1C2"]], variant: "secondary" },
        {
          type: "accordion",
          panels: [
            {
              title: "Panel title",
              blocks: [
                { type: "paragraph", text: "Panel paragraph" },
                { type: "table", headers: ["PH1", "PH2"], rows: [["P1C1", "P1C2"]] },
                { type: "self_check", questions: [{ question: "PQ", answer: "PA" }] },
              ],
            },
          ],
        },
        { type: "heading", text: "Heading text" },
        { type: "paragraph", text: "Paragraph text" },
        { type: "list", ordered: false, items: ["Item A", "Item B"] },
        { type: "table", headers: ["H1", "H2"], rows: [["R1C1", "R1C2"]] },
        { type: "contrast_table", left_header: "Left", right_header: "Right", rows: [["L1", "R1"]] },
        { type: "clinical", body: "Clinical body" },
        { type: "caution", title: "Caution title", body: "Caution body", items: ["Caution item"] },
        {
          type: "evidence",
          title: "Evidence: Study title",
          children: [
            { type: "paragraph", text: "Child paragraph" },
            { type: "list", items: ["Child item"] },
            { type: "figure", ref: "IMG-01", alt: "alt text", caption: "Figure caption" },
            { type: "citation", text: "Child citation" },
            { type: "references", items: ["Ref one"] },
          ],
        },
        { type: "citation", text: "Top citation" },
        { type: "link", lead_in: "See", url: "https://example.org", link_text: "Example" },
        { type: "figure", ref: "IMG-01", alt: "alt text", caption: "Top figure caption" },
        { type: "takeaways", items: ["Takeaway one"] },
        { type: "self_check", questions: [{ question: "Q1", answer: "A1" }] },
        { type: "counselling", title: "Counselling title", items: ["Counselling item"] },
        { type: "tip", body: "Tip body" },
        { type: "critical", title: "Critical title", body: "Critical body", items: ["Critical item"] },
      ],
    },
  ],
  intro_figure: { type: "figure", ref: "IMG-01", alt: "intro alt", caption: "Intro caption" },
  study_activities: [{ task: "Do", purpose: "Why" }],
  revision: {
    include: false,
    points: ["P1"],
  },
  notes: [],
};

describe("data-edit path contract", () => {
  const ctx = buildContext([], [], true);

  it("every data-edit path emitted across every block type resolves via setAtPath, and re-rendering with a changed value shows the change", () => {
    const html = renderPage(contractPage, ctx);
    const paths = Array.from(html.matchAll(/data-edit="([^"]+)"/g)).map((m) => m[1]);

    // Sanity check: this should have found a data-edit for every editable field across every
    // block type above (intro + one per field, well over a dozen).
    expect(paths.length).toBeGreaterThanOrEqual(20);
    expect(new Set(paths).size).toBe(paths.length); // no duplicate paths

    for (const path of paths) {
      const updated = setAtPath(contractPage, path, "ZZ");
      const rerendered = renderPage(updated, ctx);
      expect(rerendered, `expected re-render to reflect the edit at "${path}"`).toContain("ZZ");
    }
  });

  it("covers the new paths", () => {
    const html = renderPage(contractPage, ctx);
    const paths = Array.from(html.matchAll(/data-edit="([^"]+)"/g)).map((m) => m[1]);
    for (const p of [
      "tabs.0.blocks.0.lead",
      "tabs.0.blocks.0.text",
      "tabs.0.blocks.1.steps.1.sub",
      "tabs.0.blocks.2.expression",
      "tabs.0.blocks.2.note",
      "tabs.0.blocks.3.rows.0.1",
      "tabs.0.blocks.4.panels.0.blocks.0.text",
      "tabs.0.blocks.4.panels.0.blocks.1.rows.0.1",
      "study_activities.0.task",
      "study_activities.0.purpose",
      "revision.points.0",
      "intro_figure.caption",
    ]) expect(paths).toContain(p);
  });

  it("figure alt text, fixed callout titles and spacers never get a data-edit path", () => {
    const html = renderPage(contractPage, ctx);
    expect(html).not.toMatch(/data-edit="[^"]*\.alt"/);
    // Fixed titles render as text but have no field of their own (only body/items do).
    for (const title of ["Why this matters clinically:", "Pharmacist tip:"]) {
      expect(html).toContain(title);
      expect(html).not.toMatch(new RegExp(`data-edit="[^"]*"[^>]*>[^<]*${title}`));
    }
    expect(html).not.toMatch(/<p[^>]*data-edit[^>]*>&nbsp;<\/p>/);
  });
});
