import { describe, expect, it } from "vitest";
import type { Page, Tab } from "../types/page";
import type { SavedPage } from "./db";
import { HISTORY_LIMIT, imagesForAI, replaceTab, undoTab, usedImageRefs } from "./pageOps";

const tab = (id: string, text: string): Tab => ({ id, title: id, blocks: [{ type: "paragraph", text }] });
const page: Page = {
  title: "P",
  intro: [],
  tabs: [tab("t1", "one"), tab("t2", "two")],
  revision: { include: false },
  notes: [],
};
const saved: SavedPage = { id: "x", title: "P", createdAt: 0, updatedAt: 0, page, sourceText: "", images: [], embeds: [], history: {} };

describe("replaceTab / undoTab", () => {
  it("replaces a tab, keeps its id, records history and appends notes", () => {
    const next = replaceTab(saved, "t2", { ...tab("zz", "new"), title: "New" }, [{ kind: "flag", text: "n" }]);
    expect(next.page.tabs[1]).toEqual({ id: "t2", title: "New", blocks: [{ type: "paragraph", text: "new" }] });
    expect(next.history.t2).toEqual([tab("t2", "two")]);
    expect(next.page.notes).toEqual([{ kind: "flag", text: "n" }]);
    expect(saved.page.tabs[1].blocks[0]).toEqual({ type: "paragraph", text: "two" });
  });

  it("caps history", () => {
    let s = saved;
    for (let i = 0; i < HISTORY_LIMIT + 2; i++) s = replaceTab(s, "t1", tab("t1", `v${i}`));
    expect(s.history.t1).toHaveLength(HISTORY_LIMIT);
  });

  it("undo restores the previous version", () => {
    const changed = replaceTab(saved, "t1", tab("t1", "changed"));
    const undone = undoTab(changed, "t1");
    expect(undone.page.tabs[0]).toEqual(tab("t1", "one"));
    expect(undone.history.t1).toEqual([]);
    expect(undoTab(undone, "t1")).toBe(undone);
  });
});

describe("usedImageRefs", () => {
  it("collects figure refs from blocks and evidence children, in order, unique", () => {
    const p: Page = {
      ...page,
      tabs: [
        { id: "t1", title: "A", blocks: [{ type: "figure", ref: "IMG-02", alt: "a" }] },
        {
          id: "t2",
          title: "B",
          blocks: [
            { type: "evidence", title: "E", children: [{ type: "figure", ref: "IMG-01", alt: "b" }] },
            { type: "figure", ref: "IMG-02", alt: "a" },
          ],
        },
      ],
    };
    expect(usedImageRefs(p)).toEqual(["IMG-02", "IMG-01"]);
  });
});

describe("imagesForAI", () => {
  it("keeps only images with thumbnails", () => {
    expect(
      imagesForAI([
        { ref: "IMG-01", source: "a", location: "slide 1", thumb_b64: "T" },
        { ref: "IMG-02", source: "b", location: "", canvas_tag: "<img>" },
      ]),
    ).toEqual([{ ref: "IMG-01", location: "slide 1", thumb_b64: "T" }]);
  });
});
