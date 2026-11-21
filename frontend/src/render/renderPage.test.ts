import { describe, expect, it } from "vitest";
import type { Page } from "../types/page";
import { buildContext, renderPage } from "./renderPage";

const page: Page = {
  title: "Chronic pain",
  intro: ["Para one.", "Para two."],
  tabs: [
    { id: "t1", title: "Overview", blocks: [{ type: "paragraph", text: "Body." }] },
    { id: "t2", title: "Management", blocks: [{ type: "takeaways", items: ["Legacy"] }] },
  ],
  revision: { include: false, points: ["Explain A.", "Explain B."] },
  notes: [],
};
const ctx = buildContext([], [{ ref: "EMBED-01", html: '<iframe src="https://h5p/1"></iframe>' }]);

describe("renderPage", () => {
  it("skeleton: wrapper, intro panel, spacer, button tabs numbered, study tab last, spacer", () => {
    const lines = renderPage(page, ctx).split("\n");
    expect(lines[0]).toBe('<div id="dp-wrapper" class="dp-wrapper" style="color: #1f2937;">');
    expect(lines[1]).toBe('    <table style="width: 100%; border-collapse: separate; margin: 0px 0px 28px; background: #f4f2fb; border-radius: 12px; border: 1px solid #ddd8ef;" role="presentation">');
    const html = lines.join("\n");
    expect(html).toContain('<h2 style="margin: 0 0 14px 0; color: #140f50;">Chronic pain</h2>');
    expect(html).toContain('<p style="margin: 0 0 12px 0;">Para one.</p>');
    expect(html).toContain('<p style="margin: 0;">Para two.</p>');
    expect(html).toContain("[ IMAGE: placeholder &mdash; delete this line and insert from Canvas Files ]");
    expect(html).toContain('    <div class="dp-panels-wrapper dp-tabs-buttons-vertical">');
    expect(html).toContain('<h3 class="dp-panel-heading">1. Overview</h3>');
    expect(html).toContain('<h3 class="dp-panel-heading">2. Management</h3>');
    expect(html).toContain('<h3 class="dp-panel-heading">3. Study materials</h3>');
    expect(html).toContain("Key takeaways");
    expect(html.indexOf("</table>")).toBeLessThan(html.indexOf("    <p>&nbsp;</p>\n    <div class=\"dp-panels-wrapper"));
  });

  it("revision check with points, no flow diagram", () => {
    const html = renderPage(page, ctx);
    expect(html).toContain('<h2 style="margin: 0 0 8px 0; color: #140f50;">Revision check</h2>');
    expect(html).toContain('<td style="width: 44px; padding: 12px; text-align: center; color: #d97706; border: 1px solid #cbd5e1;">1</td>');
    expect(html).not.toContain("&rarr;");
    expect(html).not.toContain("[PASTE H5P EMBED HERE]");
    // Pages saved before the diagram was removed may still carry revision.flow: it is ignored.
    const legacy = { ...page, revision: { ...page.revision, flow_title: "Direction", flow: { type: "flow", steps: [{ label: "CL", style: "solid" }, { label: "k", style: "amber" }] } } } as Page;
    const legacyHtml = renderPage(legacy, ctx);
    expect(legacyHtml).not.toContain("Direction");
    expect(legacyHtml).not.toContain("&rarr;");
    expect(html.trimEnd().endsWith("</div>")).toBe(true);
  });

  it("revision slot with embed when requested, no revision when nothing to show", () => {
    const withEmbed = renderPage({ ...page, revision: { include: true, embed_ref: "EMBED-01" } }, ctx);
    expect(withEmbed).toContain('<iframe src="https://h5p/1"></iframe>');
    expect(withEmbed).not.toContain('color: #d97706; border: 1px solid #cbd5e1;">1</td>');
    const none = renderPage({ ...page, revision: { include: false } }, ctx);
    expect(none).not.toContain("Revision check");
    expect(none).not.toContain("<hr");
  });

  it("dangling embed_ref with nothing else renders no revision", () => {
    const html = renderPage({ ...page, revision: { include: false, embed_ref: "NOPE" } }, ctx);
    expect(html).not.toContain("Revision check");
  });

  it("legacy page without new fields renders", () => {
    const legacy = { title: "Old", intro: ["x"], tabs: [{ id: "t1", title: "A", blocks: [{ type: "takeaways", items: ["y"] }] }], revision: { include: true }, notes: [] } as Page;
    const html = renderPage(legacy, buildContext([], []));
    expect(html).toContain("2. Study materials");
    expect(html).toContain("[PASTE H5P EMBED HERE]");
  });

  it("editable mode marks intro paragraphs and revision points, never spacers", () => {
    const html = renderPage(page, buildContext([], [], true));
    expect(html).toContain('data-edit="intro.0"');
    expect(html).toContain('data-edit="revision.points.1"');
    expect(html).not.toMatch(/<p data-edit="[^"]*">&nbsp;<\/p>/);
  });

  it("editable mode makes teaching tab titles editable, but not the Study materials tab", () => {
    const html = renderPage(page, buildContext([], [], true));
    expect(html).toContain('<h3 class="dp-panel-heading">1. <span data-edit="tabs.0.title">Overview</span></h3>');
    expect(html).toContain('<h3 class="dp-panel-heading">3. Study materials</h3>');
    expect(renderPage(page, ctx)).toContain('<h3 class="dp-panel-heading">1. Overview</h3>');
  });
});

describe("prototype-key refs", () => {
  it("does not resolve refs like constructor/toString", () => {
    const c = buildContext([], []);
    const p: Page = { ...page, tabs: [{ id: "t", title: "T", blocks: [{ type: "figure", ref: "toString", alt: "a" }] }], revision: { include: false, embed_ref: "constructor" } };
    const html = renderPage(p, c);
    expect(html).not.toContain("Revision check");
    expect(html).toContain("[ IMAGE");
  });
});
