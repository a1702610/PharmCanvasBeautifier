import { describe, expect, it } from "vitest";
import type { InnerBlock, Page } from "../types/page";
import { buildContext, renderPage } from "../render/renderPage";
import { addColumn, addTab, blankPage, blockChoices, insertBlock, newBlock, newListItem, newPanel, removeColumn, removeItem, removeTab } from "./structureOps";

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
    expect(added.blocks.length).toBeGreaterThan(0);
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
    expect(blank.tabs[0].blocks.length).toBeGreaterThan(0);
    expect(blank.revision).toEqual({ include: false });
    expect(blank.notes).toEqual([]);
    expect(blankPage()).not.toBe(blank);
  });
});
