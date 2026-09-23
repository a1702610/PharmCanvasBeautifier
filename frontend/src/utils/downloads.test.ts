import { describe, expect, it } from "vitest";
import { safeFilename, zipEntries } from "./downloads";

describe("zipEntries", () => {
  it("includes only used extracted images, named by ref", () => {
    const images = [
      { ref: "IMG-01", source: "a", location: "", mime: "image/jpeg", data_b64: "AAA" },
      { ref: "IMG-02", source: "b", location: "", canvas_tag: "<img>" },
      { ref: "IMG-03", source: "a", location: "", mime: "image/png", data_b64: "BBB" },
    ];
    expect(zipEntries(images, ["IMG-03", "IMG-02", "IMG-01"])).toEqual([
      { name: "IMG-03.png", base64: "BBB" },
      { name: "IMG-01.jpg", base64: "AAA" },
    ]);
  });
});

describe("safeFilename", () => {
  it("strips unsafe characters", () => {
    expect(safeFilename("Chronic pain: week 3/4")).toBe("Chronic-pain-week-34");
    expect(safeFilename("???")).toBe("page");
  });
});
