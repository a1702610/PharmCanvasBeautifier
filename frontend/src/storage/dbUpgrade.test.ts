import "fake-indexeddb/auto";
import { openDB } from "idb";
import { describe, expect, it, vi } from "vitest";

describe("db v1 -> v2 upgrade", () => {
  it("keeps existing pages and adds the courses store", async () => {
    const v1 = await openDB("pharm-canvas", 1, {
      upgrade(d) { d.createObjectStore("pages", { keyPath: "id" }); },
    });
    await v1.put("pages", {
      id: "old", title: "Old page", createdAt: 1, updatedAt: 1, sourceText: "", images: [], embeds: [], history: {},
      page: { title: "Old page", intro: [], tabs: [], revision: { include: false }, notes: [] },
    });
    v1.close();

    vi.resetModules();
    const dbm = await import("./db");
    const courses = await import("./courses");
    expect((await dbm.getPage("old"))?.title).toBe("Old page");
    expect((await dbm.listPages()).map((p) => p.id)).toContain("old");
    const saved = await courses.saveCourse(courses.newCourse({ code: "NEW" }));
    expect((await courses.getCourse(saved.id))?.code).toBe("NEW");
    expect((await dbm.db()).version).toBe(2);
  });
});
