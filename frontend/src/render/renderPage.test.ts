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
