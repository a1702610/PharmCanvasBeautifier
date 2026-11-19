import { describe, expect, it } from "vitest";
import type { Page } from "../types/page";
import { buildContext } from "./renderPage";
import { safeUrl, studyMaterialsContentLines } from "./studyMaterials";

const base: Page = { title: "T", intro: [], tabs: [], revision: { include: false }, notes: [] };
const ctx = buildContext([], []);
const html = (p: Partial<Page>) => studyMaterialsContentLines({ ...base, ...p }, ctx).join("\n");

describe("safeUrl", () => {
  it("accepts http(s) only", () => {
    expect(safeUrl(" https://x.org/a ")).toBe("https://x.org/a");
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("www.example.com")).toBeUndefined();
    expect(safeUrl(undefined)).toBeUndefined();
  });
});

describe("study materials tab", () => {
  it("all placeholders when nothing supplied", () => {
    const h = html({});
    expect(h).toContain(">Handout</h4>");
    expect(h).toContain("[Add handout link]");
    expect(h).toContain(">Recordings</h4>");
    expect(h).toContain('<tr style="background: #b45309; color: #ffffff;">');
    expect(h).toContain(">Part 1</th>");
    expect(h).toContain('<table style="width: 100%; border-collapse: collapse; margin: 18px 0;">');
    expect(h).toContain('<th style="padding: 11px; background: #fff7ed; text-align: left; border: 1px solid #cbd5e1;" scope="row">Part 1</th>');
    expect(h).toContain("[Add recording link]");
    expect(h).toContain("[Add transcript link]");
    expect(h).toContain('<h4 class="dp-panel-heading">Additional resources</h4>');
    expect(h).toContain("[Add additional resources]");
    expect(h).not.toContain("What to do");
    expect(h.trimEnd().endsWith("<p>&nbsp;</p>")).toBe(true);
  });

  it("handout button, label-only placeholder and recordings with links", () => {
    const withUrl = html({ study: { handout: { label: "PK handout", url: "https://learn/x?wrap=1" }, recordings: [], resources: [] } });
    expect(withUrl).toContain('<a href="https://learn/x?wrap=1" target="_blank" rel="noopener" style="display: inline-block; padding: 10px 16px; background: #140f50; color: #ffffff; text-decoration: none; border-radius: 999px;">PK handout</a>');
    const labelOnly = html({ study: { handout: { label: 'Bad" onclick="x', url: "javascript:1" }, recordings: [], resources: [] } });
    expect(labelOnly).toContain("[Handout: Bad&quot; onclick=&quot;x &mdash; insert the Canvas file link]");
    expect(labelOnly).not.toContain("javascript:");
    const rec = html({ study: { recordings: [{ title: "General concepts", recording_url: "https://panopto/1" }, { title: "First-order", transcript_url: "https://learn/t2" }], resources: [] } });
    expect(rec).toContain('<a href="https://panopto/1" target="_blank" rel="noopener">General concepts</a>');
    expect(rec).toContain("First-order [Add recording link]");
    expect(rec).toContain('<a href="https://learn/t2" target="_blank" rel="noopener">Part 2 transcript</a>');
  });

  it("activities table only when supplied, resources as links", () => {
    const h = html({ study_activities: [{ task: "Watch the recordings", purpose: "Framework" }], study: { recordings: [], resources: [{ title: "ICP", url: "http://www.icp.org.nz/" }, { title: "No link" }, { url: "https://untitled.test/" } as never, { title: " " }] } });
    expect(h).toContain(">What to do</th>");
    expect(h).toContain("<strong>Watch the recordings</strong>");
    expect(h).toContain('<p><a href="http://www.icp.org.nz/" target="_blank" rel="noopener">ICP</a></p>');
    expect(h).toContain("<p>No link</p>");
    expect(h).toContain('<a href="https://untitled.test/" target="_blank" rel="noopener">https://untitled.test/</a>');
  });

  it("tolerates a partially formed study object", () => {
    const h = html({ study: {} as never });
    expect(h).toContain("[Add recording link]");
    expect(h).toContain("[Add additional resources]");
    const t = html({ study: { recordings: [], resources: [{ url: "https://x.org" } as never] } });
    expect(t).toContain(">https://x.org</a>");
    const n = html({ study: { recordings: [], resources: [{ title: " " }, { url: "javascript:x" } as never] } });
    expect(n).toContain("[Add additional resources]");
  });
});
