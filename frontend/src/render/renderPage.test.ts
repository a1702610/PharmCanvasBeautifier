import { describe, expect, it } from "vitest";
import type { Page } from "../types/page";
import { buildContext, renderPage } from "./renderPage";

const page: Page = {
  title: "Chronic pain",
  intro: ["Chronic pain is **different**."],
  tabs: [
    { id: "t1", title: "Overview", blocks: [{ type: "paragraph", text: "Body one." }] },
    { id: "t2", title: "Management", blocks: [{ type: "heading", text: "Opioids" }] },
  ],
  revision: { include: true, embed_ref: "EMBED-01" },
  notes: [],
};
const ctx = buildContext([], [{ ref: "EMBED-01", html: '<iframe src="https://h5p.example/1"></iframe>' }]);

describe("renderPage", () => {
  it("wraps intro and tabs in the DesignPLUS structure", () => {
    const lines = renderPage(page, ctx).split("\n");
    expect(lines.slice(0, 5)).toEqual([
      '<div id="dp-wrapper" class="dp-wrapper">',
      '    <div class="dp-content-block">',
      "        <p>Chronic pain is <strong>different</strong>.</p>",
      '        <div class="dp-panels-wrapper dp-tabs-pills-group-vertical dp-panel-color-dp-gray dp-panel-active-color-dp-accent dp-panel-hover-color-dp-secondary">',
      '            <div class="dp-panel-group">',
    ]);
    expect(lines).toContain('                <h3 class="dp-panel-heading">Overview</h3>');
    expect(lines).toContain('                <div class="dp-panel-content">');
    expect(lines).toContain("                    <p>Body one.</p>");
    expect(lines).toContain('                    <h4 style="color: #1e3a5f;">Opioids</h4>');
  });

  it("appends the revision block with the original embed", () => {
    const html = renderPage(page, ctx);
    expect(html).toContain('<span style="padding: 0 16px; color: #6d28d9; font-size: 26px;">Revision</span>');
    expect(html).toContain('<p style="margin: 0; color: #94a3b8;"><iframe src="https://h5p.example/1"></iframe></p>');
    expect(html.endsWith("</div>\n")).toBe(true);
  });

  it("uses a placeholder when there is no embed, and omits revision when not included", () => {
    const noEmbed = renderPage({ ...page, revision: { include: true } }, ctx);
    expect(noEmbed).toContain("[PASTE H5P EMBED HERE]");
    const none = renderPage({ ...page, revision: { include: false } }, ctx);
    expect(none).not.toContain("Revision");
  });
});

describe("renderPage: inline editing", () => {
  const editablePage: Page = {
    title: "Chronic pain",
    intro: ["Chronic pain is common."],
    tabs: [
      {
        id: "t1",
        title: "Overview",
        blocks: [
          { type: "paragraph", text: "Body one." },
          { type: "list", ordered: false, items: ["First point", "Second point"] },
          { type: "table", headers: ["Category", "Risk"], rows: [["Pain-related", "Severe pain"]] },
          { type: "clinical", body: "Untreated pain delays recovery." },
          { type: "self_check", questions: [{ question: "What is the max daily dose?", answer: "4 grams." }] },
        ],
      },
    ],
    revision: { include: false },
    notes: [],
  };

  it("emits data-edit paths for intro, a paragraph, a list item, a table cell, a clinical body span and a self_check answer", () => {
    const html = renderPage(editablePage, buildContext([], [], true));
    expect(html).toContain('<p data-edit="intro.0">Chronic pain is common.</p>');
    expect(html).toContain('<p data-edit="tabs.0.blocks.0.text">Body one.</p>');
    expect(html).toContain('<li data-edit="tabs.0.blocks.1.items.0">First point</li>');
    expect(html).toContain('data-edit="tabs.0.blocks.2.rows.0.1"');
    expect(html).toContain('<span data-edit="tabs.0.blocks.3.body">Untreated pain delays recovery.</span>');
    expect(html).toContain('<p data-edit="tabs.0.blocks.4.questions.0.answer" style="margin: 6px 0 0 0;">4 grams.</p>');
  });

  it("does not add data-edit for the tab heading", () => {
    const html = renderPage(editablePage, buildContext([], [], true));
    expect(html).not.toContain('<h3 class="dp-panel-heading" data-edit');
    expect(html).toContain('<h3 class="dp-panel-heading">Overview</h3>');
  });

  it("renders byte-identical output when editable is false or absent", () => {
    const explicitFalse = renderPage(editablePage, buildContext([], [], false));
    const absent = renderPage(editablePage, buildContext([], []));
    expect(explicitFalse).toBe(absent);
    expect(explicitFalse).not.toContain("data-edit");
  });
});
