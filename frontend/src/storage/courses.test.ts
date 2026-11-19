import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildCourseContext, cleanOutlineText, deleteCourse, exportCourseJson, getCourse, listCourses, newCourse, parseImportedCourse, saveCourse } from "./courses";
import { getPage, listPages, newSavedPage, savePage } from "./db";

beforeEach(async () => {
  for (const c of await listCourses()) await deleteCourse(c.id);
});

describe("course profiles", () => {
  it("CRUD and sorting", async () => {
    await saveCourse(newCourse({ code: "PHAR3004", name: "PK" }));
    await saveCourse(newCourse({ code: "PHAR2001", name: "Intro" }));
    const list = await listCourses();
    expect(list.map((c) => c.code)).toEqual(["PHAR2001", "PHAR3004"]);
    expect((await getCourse(list[0].id))?.name).toBe("Intro");
  });

  it("pages store still works alongside courses (v1 → v2 upgrade keeps pages)", async () => {
    const p = await savePage(newSavedPage({ page: { title: "Keep", intro: [], tabs: [], revision: { include: false }, notes: [] }, sourceText: "", images: [], embeds: [] }));
    await saveCourse(newCourse({ code: "X" }));
    expect((await getPage(p.id))?.title).toBe("Keep");
    expect((await listPages()).some((s) => s.id === p.id)).toBe(true);
  });

  it("builds course context, omitting empty sections, truncating the outline first at 12,000 chars", () => {
    expect(buildCourseContext(undefined)).toBe("");
    const ctx = buildCourseContext(newCourse({ code: "PHAR3004", name: "PK", level: "Year 3", outcomes: "CLO1 x", outline: "o".repeat(20000) }));
    expect(ctx.startsWith("Course: PHAR3004 — PK\nYear level: Year 3\nLearning outcomes:\nCLO1 x\nCourse outline (extract):\n")).toBe(true);
    expect(ctx.length).toBe(12000);
    expect(ctx).not.toContain("Course aims:");
  });

  it("cleans extracted outline text", () => {
    expect(cleanOutlineText("=== SOURCE 1: outline.docx ===\n\nAims [IMG-01: page 2]\n\n\n\nOutcomes [EMBED-01]")).toBe("Aims\n\nOutcomes");
  });

  it("export/import round trip with a fresh id; rejects other files", () => {
    const c = newCourse({ code: "A", outcomes: "o" });
    const back = parseImportedCourse(exportCourseJson(c));
    expect(back.code).toBe("A");
    expect(back.id).not.toBe(c.id);
    expect(() => parseImportedCourse('{"format":"pharm-canvas-page"}')).toThrow("This file isn't a course profile.");
    expect(() => parseImportedCourse('{"format":"pharm-canvas-course","version":1,"course":[]}')).toThrow("This file isn't a course profile.");
    expect(() => parseImportedCourse("nope")).toThrow("This file isn't a course profile.");
  });
});
