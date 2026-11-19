import { describe, expect, it } from "vitest";
import type { Page } from "../types/page";
import type { SavedPage } from "./db";
import { exportPageJson, parseImportedPage } from "./exchange";

const page: Page = {
  title: "Chronic pain",
  intro: ["Intro."],
  tabs: [{ id: "t1", title: "A", blocks: [] }],
  revision: { include: false },
  notes: [{ kind: "flag", text: "n" }],
};
const saved: SavedPage = {
  id: "x",
  title: "Chronic pain",
  createdAt: 1,
  updatedAt: 2,
  page,
  sourceText: "src",
  images: [{ ref: "IMG-01", source: "a", location: "" }],
  embeds: [{ ref: "EMBED-01", html: "<iframe></iframe>" }],
  history: { t1: [] },
};

function wrap(body: unknown): string {
  return JSON.stringify({ format: "pharm-canvas-page", version: 1, page: body });
}

describe("parseImportedPage", () => {
  it("round-trips a valid saved page with a fresh id", () => {
    const imported = parseImportedPage(exportPageJson(saved));
    expect(imported.id).not.toBe(saved.id);
    expect(imported.page).toEqual(saved.page);
    expect(imported.images).toEqual(saved.images);
    expect(imported.embeds).toEqual(saved.embeds);
    expect(imported.history).toEqual(saved.history);
  });

  it("rejects malformed JSON and the wrong format/version", () => {
    expect(() => parseImportedPage("not json")).toThrow("This file isn't a saved page.");
    expect(() => parseImportedPage(JSON.stringify({ format: "other" }))).toThrow("This file isn't a saved page.");
    expect(() => parseImportedPage(JSON.stringify({ format: "pharm-canvas-page", version: 2, page: saved }))).toThrow(
      "This file isn't a saved page.",
    );
  });

  it("rejects a non-string title", () => {
    expect(() => parseImportedPage(wrap({ ...saved, page: { ...page, title: 5 } }))).toThrow("This file isn't a saved page.");
  });

  it("rejects an intro that isn't a string array", () => {
    expect(() => parseImportedPage(wrap({ ...saved, page: { ...page, intro: [1, 2] } }))).toThrow(
      "This file isn't a saved page.",
    );
  });

  it("rejects tabs that aren't {id, title, blocks[]}", () => {
    expect(() => parseImportedPage(wrap({ ...saved, page: { ...page, tabs: [{ title: "A" }] } }))).toThrow(
      "This file isn't a saved page.",
    );
    expect(() => parseImportedPage(wrap({ ...saved, page: { ...page, tabs: "nope" } }))).toThrow(
      "This file isn't a saved page.",
    );
  });

  it("drops notes with an unknown kind and keeps valid ones", () => {
    const imported = parseImportedPage(
      wrap({
        ...saved,
        page: { ...page, notes: [{ kind: "flag", text: "keep" }, { kind: "bogus", text: "drop" }] },
      }),
    );
    expect(imported.page.notes).toEqual([{ kind: "flag", text: "keep" }]);
  });

  it("defaults images, embeds and history when missing", () => {
    const rest: Partial<SavedPage> = { ...saved };
    delete rest.images;
    delete rest.embeds;
    delete rest.history;
    const imported = parseImportedPage(wrap(rest));
    expect(imported.images).toEqual([]);
    expect(imported.embeds).toEqual([]);
    expect(imported.history).toEqual({});
  });

  it("drops images and embeds with refs that don't match IMG-nn / EMBED-nn", () => {
    const imported = parseImportedPage(
      wrap({
        ...saved,
        images: [
          { ref: "IMG-01", source: "a", location: "" },
          { ref: "bogus", source: "a", location: "" },
        ],
        embeds: [
          { ref: "EMBED-01", html: "<iframe></iframe>" },
          { ref: "EMBED-x", html: "<iframe></iframe>" },
        ],
      }),
    );
    expect(imported.images).toEqual([{ ref: "IMG-01", source: "a", location: "" }]);
    expect(imported.embeds).toEqual([{ ref: "EMBED-01", html: "<iframe></iframe>" }]);
  });

  it("keeps new page fields on import and drops malformed ones", () => {
    const rich: SavedPage = {
      ...saved,
      page: {
        title: "T",
        intro: [],
        tabs: [],
        revision: {
          include: false,
          points: ["p"],
          flow_title: "f",
          flow: { type: "flow", steps: [{ label: "a", style: "solid" }, { label: "b", style: "outline" }] },
        },
        notes: [],
        intro_figure: { type: "figure", ref: "IMG-01", alt: "x" },
        study_activities: [{ task: "t", purpose: "p" }],
        study: { handout: { label: "H", url: "https://x" }, recordings: [{ title: "R" }], resources: [{ title: "Res" }] },
      },
    };
    const back = parseImportedPage(exportPageJson(rich));
    expect(back.page.revision.points).toEqual(["p"]);
    expect(back.page.intro_figure?.ref).toBe("IMG-01");
    expect(back.page.study?.recordings[0].title).toBe("R");
    const broken = JSON.parse(exportPageJson(rich));
    broken.page.page.study = "nope";
    broken.page.page.study_activities = [{ task: 1 }];
    broken.page.page.intro_figure = { ref: 5 };
    const cleaned = parseImportedPage(JSON.stringify(broken));
    expect(cleaned.page.study).toBeUndefined();
    expect(cleaned.page.study_activities).toBeUndefined();
    expect(cleaned.page.intro_figure).toBeUndefined();
  });
});

describe("parseImportedPage study/revision normalisation", () => {
  it("drops malformed study rows and revision points without throwing at render", async () => {
    const { renderPage, buildContext } = await import("../render/renderPage");
    const bad = {
      ...page,
      study: { handout: { label: 5, url: "https://x.test" }, recordings: [null, { part: 3, title: "T" }], resources: [{ url: "https://y" }, "s", { title: "R" }] },
      revision: { include: false, points: "x" },
    };
    const out = parseImportedPage(wrap({ ...saved, page: bad }));
    expect(out.page.study).toEqual({ handout: { url: "https://x.test" }, recordings: [{ title: "T" }], resources: [{ title: "R" }] });
    expect(out.page.revision.points).toBeUndefined();
    expect(() => renderPage(out.page, buildContext([], []))).not.toThrow();
  });
});
