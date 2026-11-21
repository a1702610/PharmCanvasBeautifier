import { describe, expect, it } from "vitest";
import type { InnerBlock, Page } from "../types/page";
import { buildContext, renderPage } from "../render/renderPage";
import { addColumn, addTab, blankPage, blockChoices, insertBlock, newBlock, newListItem, newPanel, removeColumn, moveTab, paragraphLinesToBlocks, removeEmpty, removeItem, removeTab, splitText } from "./structureOps";

const p = (text: string): InnerBlock => ({ type: "paragraph", text });
const page: Page = {
  title: "P",
  intro: [],
  tabs: [
    {
      id: "t1",
      title: "One",
      blocks: [p("a"), { type: "accordion", panels: [{ title: "X", blocks: [p("x1")] }, { title: "Y", blocks: [p("y1")] }] }, p("b")],
    },
    { id: "t2", title: "Two", blocks: [p("c")] },
  ],
  revision: { include: false },
  notes: [],
};

describe("blockChoices / newBlock", () => {
  it("offers every addable section at tab level, and no nested accordion inside a panel", () => {
    const top = blockChoices(false).map((c) => c.type);
    expect(top).toContain("accordion");
    expect(top).toContain("table");
    expect(top).toContain("clinical");
    expect(top).toContain("self_check");
    expect(top).not.toContain("takeaways");
    expect(blockChoices(true).map((c) => c.type)).not.toContain("accordion");
  });

  it("creates a renderable placeholder for every choice", () => {
    for (const { type } of blockChoices(false)) {
      const block = newBlock(type);
      expect(block.type).toBe(type);
      const html = renderPage({ ...page, tabs: [{ id: "t1", title: "T", blocks: [block] }] }, buildContext([], [], true));
      expect(html.length).toBeGreaterThan(0);
    }
  });

  it("returns fresh objects each time", () => {
    const a = newBlock("table");
    const b = newBlock("table");
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe("insertBlock", () => {
  it("inserts at a tab-level index without mutating the original", () => {
    const next = insertBlock(page, "tabs.0.blocks", 1, p("new"));
    expect(next.tabs[0].blocks.map((b) => (b.type === "paragraph" ? b.text : b.type))).toEqual(["a", "new", "accordion", "b"]);
    expect(page.tabs[0].blocks).toHaveLength(3);
  });

  it("inserts inside an accordion panel and at the end of a list", () => {
    const inPanel = insertBlock(page, "tabs.0.blocks.1.panels.1.blocks", 1, p("y2"));
    const acc = inPanel.tabs[0].blocks[1];
    expect(acc.type === "accordion" && acc.panels[1].blocks.map((b) => (b.type === "paragraph" ? b.text : ""))).toEqual(["y1", "y2"]);
    expect(insertBlock(page, "tabs.1.blocks", 1, p("d")).tabs[1].blocks).toHaveLength(2);
  });

  it("adds a panel to an accordion", () => {
    const next = insertBlock(page, "tabs.0.blocks.1.panels", 2, newPanel());
    const acc = next.tabs[0].blocks[1];
    expect(acc.type === "accordion" && acc.panels.map((x) => x.title)).toEqual(["X", "Y", "More detail"]);
  });

  it("rejects paths that aren't lists", () => {
    expect(() => insertBlock(page, "tabs.0.title", 0, p("x"))).toThrow();
    expect(() => insertBlock(page, "tabs.9.blocks", 0, p("x"))).toThrow();
  });
});

describe("removeItem", () => {
  it("removes a block, a block inside a panel, and a panel", () => {
    expect(removeItem(page, "tabs.0.blocks.0").tabs[0].blocks).toHaveLength(2);
    const inPanel = removeItem(page, "tabs.0.blocks.1.panels.0.blocks.0").tabs[0].blocks[1];
    expect(inPanel.type === "accordion" && inPanel.panels[0].blocks).toEqual([]);
    const panelGone = removeItem(page, "tabs.0.blocks.1.panels.0").tabs[0].blocks[1];
    expect(panelGone.type === "accordion" && panelGone.panels.map((x) => x.title)).toEqual(["Y"]);
  });

  it("removes the whole collapsible section when its last panel is deleted", () => {
    const once = removeItem(page, "tabs.0.blocks.1.panels.0");
    const twice = removeItem(once, "tabs.0.blocks.1.panels.0");
    expect(twice.tabs[0].blocks.map((b) => b.type)).toEqual(["paragraph", "paragraph"]);
  });

  it("rejects out-of-range paths", () => {
    expect(() => removeItem(page, "tabs.0.blocks.7")).toThrow();
  });
});

describe("addTab / removeTab", () => {
  it("appends a tab with a unique id and placeholder content", () => {
    const next = addTab(page);
    expect(next.tabs).toHaveLength(3);
    const added = next.tabs[2];
    expect(added.id).not.toBe("t1");
    expect(added.id).not.toBe("t2");
    expect(added.title).toBe("New tab");
    expect(added.blocks).toEqual([]);
    expect(addTab(next).tabs[3].id).not.toBe(added.id);
  });

  it("removes a tab by index", () => {
    expect(removeTab(page, 0).tabs.map((t) => t.id)).toEqual(["t2"]);
    expect(page.tabs).toHaveLength(2);
  });
});

describe("points, rows, columns, questions and steps", () => {
  const rich: Page = {
    ...page,
    tabs: [
      {
        id: "t1",
        title: "One",
        blocks: [
          { type: "list", ordered: false, items: ["a"] },
          { type: "table", headers: ["A", "B"], col_widths: [30, 70], rows: [["1", "2"]] },
          { type: "contrast_table", left_header: "L", right_header: "R", rows: [["x", "y"]] },
          { type: "self_check", questions: [{ question: "Q?", answer: "A." }] },
          { type: "flow", steps: [{ label: "s1", style: "solid" }, { label: "s2", style: "amber" }] },
          { type: "table", headers: ["Time", "Conc"], row_headers: false, rows: [] },
        ],
      },
    ],
    revision: { include: false, points: ["p1"] },
  };
  const at = (p: Page, i: number) => p.tabs[0].blocks[i] as never as Record<string, unknown>;

  it("builds the right new item for each kind of list", () => {
    expect(newListItem(rich, "tabs.0.blocks.0.items")).toBe("New point");
    expect(newListItem(rich, "revision.points")).toBe("New point");
    expect(newListItem(rich, "tabs.0.blocks.1.rows")).toEqual(["Row label", "Cell"]);
    expect(newListItem(rich, "tabs.0.blocks.5.rows")).toEqual(["Cell", "Cell"]);
    expect(newListItem(rich, "tabs.0.blocks.2.rows")).toEqual(["Point about A", "Point about B"]);
    expect(newListItem(rich, "tabs.0.blocks.3.questions")).toEqual({ question: "Question?", answer: "Answer." });
    expect(newListItem(rich, "tabs.0.blocks.4.steps")).toEqual({ label: "New step", style: "outline" });
    expect(() => newListItem(rich, "tabs.0.blocks")).toThrow();
  });

  it("adds and removes rows, points, questions and steps with insertBlock/removeItem", () => {
    const withRow = insertBlock(rich, "tabs.0.blocks.1.rows", 1, newListItem(rich, "tabs.0.blocks.1.rows"));
    expect(at(withRow, 1).rows).toEqual([["1", "2"], ["Row label", "Cell"]]);
    expect(at(removeItem(withRow, "tabs.0.blocks.1.rows.0"), 1).rows).toEqual([["Row label", "Cell"]]);
    expect(removeItem(rich, "revision.points.0").revision.points).toEqual([]);
    expect(insertBlock(rich, "revision.points", 1, "New point").revision.points).toEqual(["p1", "New point"]);
  });

  it("can add points to a page whose revision check has none yet", () => {
    const bare: Page = { ...rich, revision: { include: false } };
    expect(insertBlock(bare, "revision.points", 0, "New point").revision.points).toEqual(["New point"]);
  });

  it("adds a column to the header and every row, dropping fixed widths", () => {
    const next = addColumn(rich, "tabs.0.blocks.1");
    expect(at(next, 1).headers).toEqual(["A", "B", "Heading"]);
    expect(at(next, 1).rows).toEqual([["1", "2", "Cell"]]);
    expect(at(next, 1).col_widths).toBeUndefined();
  });

  it("removes a column from the header and every row, but never the last one", () => {
    const next = removeColumn(rich, "tabs.0.blocks.1", 0);
    expect(at(next, 1).headers).toEqual(["B"]);
    expect(at(next, 1).rows).toEqual([["2"]]);
    expect(at(next, 1).col_widths).toBeUndefined();
    expect(() => removeColumn(next, "tabs.0.blocks.1", 0)).toThrow();
    expect(() => addColumn(rich, "tabs.0.blocks.0")).toThrow();
  });
});

describe("blankPage", () => {
  it("is a minimal page in the template: title, one intro paragraph, one tab, no revision", () => {
    const blank = blankPage();
    expect(blank.title).toBe("Untitled page");
    expect(blank.intro).toHaveLength(1);
    expect(blank.tabs).toHaveLength(1);
    expect(blank.tabs[0].title).toBe("New tab");
    expect(blank.tabs[0].blocks).toEqual([]);
    expect(blank.revision).toEqual({ include: false });
    expect(blank.notes).toEqual([]);
    expect(blankPage()).not.toBe(blank);
  });
});

describe("typing: Enter splits, '- ' makes bullets, Backspace removes empties", () => {
  const typing: Page = {
    title: "T",
    intro: ["Intro one"],
    tabs: [
      {
        id: "t1",
        title: "One",
        blocks: [
          { type: "paragraph", text: "Hello world" },
          { type: "list", ordered: false, items: ["a", "b"] },
          { type: "heading", text: "Heading" },
          { type: "caution", title: "C", items: ["x"] },
        ],
      },
    ],
    revision: { include: false, points: ["p1"] },
    notes: [],
  };
  const blocks = (p: Page) => p.tabs[0].blocks;

  it("Enter in a paragraph splits it into two paragraphs and focuses the second", () => {
    const { page: next, focus } = splitText(typing, "tabs.0.blocks.0.text", "Hello", "world");
    expect(blocks(next).slice(0, 2)).toEqual([{ type: "paragraph", text: "Hello" }, { type: "paragraph", text: "world" }]);
    expect(focus).toEqual({ path: "tabs.0.blocks.1.text", caret: "start" });
  });

  it("Enter in a heading starts a paragraph after it", () => {
    const { page: next } = splitText(typing, "tabs.0.blocks.2.text", "Heading", "");
    expect(blocks(next)[2]).toEqual({ type: "heading", text: "Heading" });
    expect(blocks(next)[3]).toEqual({ type: "paragraph", text: "" });
  });

  it("Enter in the intro adds an intro paragraph", () => {
    const { page: next, focus } = splitText(typing, "intro.0", "Intro", "one");
    expect(next.intro).toEqual(["Intro", "one"]);
    expect(focus).toEqual({ path: "intro.1", caret: "start" });
  });

  it("Enter in a bullet adds a bullet after it", () => {
    const { page: next, focus } = splitText(typing, "tabs.0.blocks.1.items.0", "a", "");
    expect(blocks(next)[1]).toEqual({ type: "list", ordered: false, items: ["a", "", "b"] });
    expect(focus).toEqual({ path: "tabs.0.blocks.1.items.1", caret: "start" });
    expect(splitText(typing, "revision.points.0", "p", "1").page.revision.points).toEqual(["p", "1"]);
  });

  it("Enter on an empty last bullet ends the list with a new paragraph", () => {
    const withEmpty = splitText(typing, "tabs.0.blocks.1.items.1", "b", "").page;
    const { page: next, focus } = splitText(withEmpty, "tabs.0.blocks.1.items.2", "", "");
    expect(blocks(next)[1]).toEqual({ type: "list", ordered: false, items: ["a", "b"] });
    expect(blocks(next)[2]).toEqual({ type: "paragraph", text: "" });
    expect(focus).toEqual({ path: "tabs.0.blocks.2.text", caret: "start" });
  });

  it("Enter on an empty last point in a callout just removes it", () => {
    const withEmpty = splitText(typing, "tabs.0.blocks.3.items.0", "x", "").page;
    const { page: next, focus } = splitText(withEmpty, "tabs.0.blocks.3.items.1", "", "");
    expect((blocks(next)[3] as { items: string[] }).items).toEqual(["x"]);
    expect(focus).toBeUndefined();
  });

  it("'- ' at the start of a paragraph turns it into a bullet list", () => {
    const { page: next, focus } = paragraphLinesToBlocks(typing, "tabs.0.blocks.0.text", "- Hello world", 0);
    expect(blocks(next)[0]).toEqual({ type: "list", ordered: false, items: ["Hello world"] });
    expect(focus).toEqual({ path: "tabs.0.blocks.0.items.0", caret: "start" });
  });

  it("'- ' in a paragraph right after a bullet list adds to that list", () => {
    const afterList: Page = { ...typing, tabs: [{ ...typing.tabs[0], blocks: [blocks(typing)[1], { type: "paragraph", text: "c" }] }] };
    const { page: next, focus } = paragraphLinesToBlocks(afterList, "tabs.0.blocks.1.text", "- c", 0);
    expect(blocks(next)).toEqual([{ type: "list", ordered: false, items: ["a", "b", "c"] }]);
    expect(focus).toEqual({ path: "tabs.0.blocks.0.items.2", caret: "start" });
  });

  it("Backspace on an empty bullet removes it and focuses the one before", () => {
    const { page: next, focus } = removeEmpty(typing, "tabs.0.blocks.1.items.1");
    expect(blocks(next)[1]).toEqual({ type: "list", ordered: false, items: ["a"] });
    expect(focus).toEqual({ path: "tabs.0.blocks.1.items.0", caret: "end" });
    const single = removeEmpty(next, "tabs.0.blocks.1.items.0");
    expect(blocks(single.page).map((b) => b.type)).toEqual(["paragraph", "heading", "caution"]);
  });

  it("Backspace on an empty paragraph removes it and focuses the end of the text before", () => {
    const withEmpty = splitText(typing, "tabs.0.blocks.0.text", "Hello world", "").page;
    const { page: next, focus } = removeEmpty(withEmpty, "tabs.0.blocks.1.text");
    expect(blocks(next)).toEqual(blocks(typing));
    expect(focus).toEqual({ path: "tabs.0.blocks.0.text", caret: "end" });
    const afterList = removeEmpty(splitText(typing, "tabs.0.blocks.2.text", "Heading", "").page, "tabs.0.blocks.3.text");
    expect(afterList.focus).toEqual({ path: "tabs.0.blocks.2.text", caret: "end" });
  });

  it("Backspace on an empty intro paragraph removes it unless it's the only one", () => {
    const two = splitText(typing, "intro.0", "Intro one", "").page;
    expect(removeEmpty(two, "intro.1").page.intro).toEqual(["Intro one"]);
    expect(removeEmpty(typing, "intro.0").page.intro).toEqual(["Intro one"]);
  });
});

describe("paragraphLinesToBlocks", () => {
  const one = (text: string): Page => ({ title: "T", intro: [], tabs: [{ id: "t1", title: "A", blocks: [{ type: "paragraph", text }] }], revision: { include: false }, notes: [] });
  const blocksOf = (p: Page) => p.tabs[0].blocks;

  it("splits a paragraph's '- ' / '* ' lines into a bullet list after the text", () => {
    const { page, focus } = paragraphLinesToBlocks(one(""), "tabs.0.blocks.0.text", "Hello\n* a\n- b");
    expect(blocksOf(page)).toEqual([{ type: "paragraph", text: "Hello" }, { type: "list", ordered: false, items: ["a", "b"] }]);
    expect(focus).toBeUndefined();
  });

  it("keeps text after the bullets as a paragraph", () => {
    const { page } = paragraphLinesToBlocks(one(""), "tabs.0.blocks.0.text", "- a\nAfter\nmore");
    expect(blocksOf(page)).toEqual([{ type: "list", ordered: false, items: ["a"] }, { type: "paragraph", text: "After\nmore" }]);
  });

  it("focuses the bullet on the caret's line", () => {
    const { page, focus } = paragraphLinesToBlocks(one(""), "tabs.0.blocks.0.text", "Hello\n- ", 1);
    expect(blocksOf(page)).toEqual([{ type: "paragraph", text: "Hello" }, { type: "list", ordered: false, items: [""] }]);
    expect(focus).toEqual({ path: "tabs.0.blocks.1.items.0", caret: "start" });
  });
});

describe("moveTab", () => {
  it("moves a tab up or down and ignores moves past the ends", () => {
    const ids = (p: Page) => p.tabs.map((t) => t.id);
    expect(ids(moveTab(page, 1, -1))).toEqual(["t2", "t1"]);
    expect(ids(moveTab(page, 0, 1))).toEqual(["t2", "t1"]);
    expect(moveTab(page, 0, -1)).toBe(page);
    expect(moveTab(page, 1, 1)).toBe(page);
  });
});
