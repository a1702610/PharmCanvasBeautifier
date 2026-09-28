// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Page } from "../types/page";
import { collapseNewlines, htmlToMarkdown, setAtPath } from "./editing";

function el(html: string): Element {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("htmlToMarkdown", () => {
  it("keeps plain text as-is", () => {
    expect(htmlToMarkdown(el("Take with food."))).toBe("Take with food.");
  });

  it("converts <strong>/<b> to **bold**", () => {
    expect(htmlToMarkdown(el("<strong>Start low</strong>, go slow"))).toBe("**Start low**, go slow");
    expect(htmlToMarkdown(el("<b>Start low</b>, go slow"))).toBe("**Start low**, go slow");
  });

  it("converts <em>/<i> to *italic*", () => {
    expect(htmlToMarkdown(el("<em>Basic Clin Pharmacol</em> Toxicol"))).toBe("*Basic Clin Pharmacol* Toxicol");
    expect(htmlToMarkdown(el("<i>Basic Clin Pharmacol</i> Toxicol"))).toBe("*Basic Clin Pharmacol* Toxicol");
  });

  it("converts an https link to markdown [text](url)", () => {
    expect(htmlToMarkdown(el('See the <a href="https://tga.gov.au/guidance">TGA guidance</a>.'))).toBe(
      "See the [TGA guidance](https://tga.gov.au/guidance).",
    );
  });

  it("drops a non-http(s) link but keeps its text", () => {
    expect(htmlToMarkdown(el('<a href="javascript:alert(1)">click</a>'))).toBe("click");
  });

  it("joins multiple <p> blocks (a multi-paragraph table cell) with a blank line", () => {
    expect(htmlToMarkdown(el("<p>Depression</p><p>Anxiety</p>"))).toBe("Depression\n\nAnxiety");
  });

  it("joins multiple <div> blocks the same way", () => {
    expect(htmlToMarkdown(el("<div>Depression</div><div>Anxiety</div>"))).toBe("Depression\n\nAnxiety");
  });

  it("converts <br> to a single space", () => {
    expect(htmlToMarkdown(el("Line one<br>Line two"))).toBe("Line one Line two");
  });

  it("drops stray/unsupported tags but keeps their text", () => {
    expect(htmlToMarkdown(el('<span style="color:red">urgent</span> review'))).toBe("urgent review");
    expect(htmlToMarkdown(el("<u>underlined</u>"))).toBe("underlined");
  });

  it("collapses whitespace and trims", () => {
    expect(htmlToMarkdown(el("  Take   with \n\n food.  "))).toBe("Take with food.");
  });

  it("drops empty paragraphs produced by editing", () => {
    expect(htmlToMarkdown(el("<p>Depression</p><p></p><p>Anxiety</p>"))).toBe("Depression\n\nAnxiety");
  });

  it("keeps a run of inline/text content that sits before or after a block child, instead of dropping it", () => {
    // Browsers turn a second line typed after Enter into a <div>, leaving the first line as a
    // bare text node sibling. Both must survive as their own paragraphs.
    expect(htmlToMarkdown(el("Hello line1<div>line2</div>"))).toBe("Hello line1\n\nline2");
    expect(htmlToMarkdown(el("<div>line1</div>line2"))).toBe("line1\n\nline2");
    expect(htmlToMarkdown(el("start<div>middle</div>end"))).toBe("start\n\nmiddle\n\nend");
    expect(htmlToMarkdown(el("<strong>Bold</strong> lead-in<div>second line</div>"))).toBe(
      "**Bold** lead-in\n\nsecond line",
    );
  });

  it("converts a stray non-breaking space to a normal space", () => {
    expect(htmlToMarkdown(el("Take home dose"))).toBe("Take home dose");
  });

  it("keeps a non-breaking space between a digit and a unit", () => {
    expect(htmlToMarkdown(el("Maximum 4 g per day"))).toBe("Maximum 4 g per day");
  });
});

describe("collapseNewlines", () => {
  it("collapses hard line breaks in pasted/dropped text to a single space", () => {
    expect(collapseNewlines("Line one\nLine two")).toBe("Line one Line two");
    expect(collapseNewlines("Line one\r\nLine two\r\nLine three")).toBe("Line one Line two Line three");
    expect(collapseNewlines("Line one\n\n\nLine two")).toBe("Line one Line two");
  });

  it("leaves single-line text untouched", () => {
    expect(collapseNewlines("Take with food.")).toBe("Take with food.");
  });
});

describe("setAtPath", () => {
  const page: Page = {
    title: "Chronic pain",
    intro: ["Chronic pain is common."],
    tabs: [
      {
        id: "t1",
        title: "Overview",
        blocks: [
          { type: "paragraph", text: "Body one." },
          { type: "table", headers: ["A", "B"], rows: [["1", "2"]] },
          { type: "self_check", questions: [{ question: "Q1", answer: "A1" }] },
        ],
      },
    ],
    revision: { include: false },
    notes: [],
  };

  it("sets an intro paragraph", () => {
    const next = setAtPath(page, "intro.0", "Chronic pain is very common.");
    expect(next.intro[0]).toBe("Chronic pain is very common.");
  });

  it("sets a nested block field (paragraph text)", () => {
    const next = setAtPath(page, "tabs.0.blocks.0.text", "Body one, revised.");
    const block = next.tabs[0].blocks[0];
    expect(block.type === "paragraph" && block.text).toBe("Body one, revised.");
  });

  it("sets a table cell", () => {
    const next = setAtPath(page, "tabs.0.blocks.1.rows.0.1", "22");
    const block = next.tabs[0].blocks[1];
    expect(block.type === "table" && block.rows[0][1]).toBe("22");
  });

  it("sets a self_check question's answer", () => {
    const next = setAtPath(page, "tabs.0.blocks.2.questions.0.answer", "Revised answer.");
    const block = next.tabs[0].blocks[2];
    expect(block.type === "self_check" && block.questions[0].answer).toBe("Revised answer.");
  });

  it("throws on an invalid path (unknown field)", () => {
    expect(() => setAtPath(page, "tabs.0.blocks.0.nope", "x")).toThrow();
  });

  it("throws on an invalid path (out-of-range index)", () => {
    expect(() => setAtPath(page, "tabs.5.title", "x")).toThrow();
  });

  it("throws on an invalid path (field absent on this block type)", () => {
    // paragraph blocks have no "body" field
    expect(() => setAtPath(page, "tabs.0.blocks.0.body", "x")).toThrow();
  });

  it("leaves the original page unchanged", () => {
    const before = JSON.parse(JSON.stringify(page));
    setAtPath(page, "tabs.0.blocks.0.text", "Something else entirely.");
    expect(page).toEqual(before);
  });
});
