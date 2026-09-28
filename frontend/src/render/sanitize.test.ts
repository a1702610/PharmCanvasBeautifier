// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizePreviewHtml } from "./sanitize";

describe("sanitizePreviewHtml", () => {
  it("strips an onerror handler from an img tag", () => {
    const out = sanitizePreviewHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("alert(1)");
  });

  it("strips script tags entirely", () => {
    const out = sanitizePreviewHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<p>hi</p>");
  });

  it("removes javascript: hrefs and srcs", () => {
    const out = sanitizePreviewHtml('<a href="javascript:alert(1)">link</a><img src="javascript:alert(1)">');
    expect(out).not.toContain("javascript:");
  });

  it("keeps an iframe embed with an allowed src", () => {
    const out = sanitizePreviewHtml('<iframe src="https://learn.adelaide.edu.au/embed"></iframe>');
    expect(out).toContain("<iframe");
    expect(out).toContain('src="https://learn.adelaide.edu.au/embed"');
  });

  it("keeps inline style and class attributes on a div", () => {
    const out = sanitizePreviewHtml('<div class="dp-panel-group" style="color: red;">content</div>');
    expect(out).toContain('class="dp-panel-group"');
    expect(out).toContain('style="color: red;"');
  });

  it("keeps data-edit attributes used by inline text editing", () => {
    const out = sanitizePreviewHtml('<p data-edit="intro.0">Chronic pain is common.</p>');
    expect(out).toContain('data-edit="intro.0"');
  });
});
