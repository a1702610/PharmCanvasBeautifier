import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Note: mock Date.now rather than vi.useFakeTimers — fake timers would also freeze
// setImmediate, which fake-indexeddb relies on, and hang the test.
import type { Page } from "../types/page";
import { deletePage, duplicatePage, getPage, listPages, newSavedPage, renamePage, savePage } from "./db";
import { exportPageJson, parseImportedPage } from "./exchange";

const page: Page = { title: "Chronic pain", intro: [], tabs: [{ id: "t1", title: "A", blocks: [] }], revision: { include: false }, notes: [] };

beforeEach(async () => {
  for (const p of await listPages()) await deletePage(p.id);
});
afterEach(() => vi.restoreAllMocks());

describe("page storage", () => {
  it("saves, lists newest first, gets and deletes", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    const a = await savePage(newSavedPage({ page, sourceText: "src", images: [], embeds: [] }));
    now.mockReturnValue(2000);
    const b = await savePage(newSavedPage({ page: { ...page, title: "Opioids" }, sourceText: "src", images: [], embeds: [] }));
    const list = await listPages();
    expect(list.map((p) => p.title)).toEqual(["Opioids", "Chronic pain"]);
    expect(list[0]).toEqual({ id: b.id, title: "Opioids", updatedAt: 2000, tabCount: 1 });
    expect((await getPage(a.id))?.sourceText).toBe("src");
    await deletePage(a.id);
    expect(await getPage(a.id)).toBeUndefined();
  });

  it("renames and duplicates", async () => {
    const a = await savePage(newSavedPage({ page, sourceText: "", images: [], embeds: [] }));
    await renamePage(a.id, "Renamed");
    expect((await getPage(a.id))?.page.title).toBe("Renamed");
    const copy = await duplicatePage(a.id);
    expect(copy?.id).not.toBe(a.id);
    expect(copy?.title).toBe("Renamed (copy)");
  });

  it("exports and imports with a fresh id", async () => {
    const a = await savePage(newSavedPage({ page, sourceText: "s", images: [], embeds: [] }));
    const imported = parseImportedPage(exportPageJson(a));
    expect(imported.id).not.toBe(a.id);
    expect(imported.page).toEqual(a.page);
    expect(() => parseImportedPage('{"format":"other"}')).toThrow("This file isn't a saved page.");
    expect(() => parseImportedPage("not json")).toThrow("This file isn't a saved page.");
  });
});
