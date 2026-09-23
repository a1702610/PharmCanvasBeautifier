import { describe, expect, it } from "vitest";
import { checkFile, checkPaste, MAX_PASTE_BYTES, MAX_SOURCES } from "./config";

const file = (name: string, size = 10) => new File([new Uint8Array(size)], name);

describe("checkFile", () => {
  it("accepts supported types", () => {
    expect(checkFile(file("Week 3.PPTX"), 0)).toBeNull();
    expect(checkFile(file("notes.docx"), 0)).toBeNull();
    expect(checkFile(file("handout.pdf"), 0)).toBeNull();
  });
  it("rejects unsupported types", () => {
    expect(checkFile(file("notes.txt"), 0)).toMatch(/only Word/);
  });
  it("rejects large files", () => {
    expect(checkFile(file("big.pdf", 26 * 1024 * 1024), 0)).toMatch(/larger than 25 MB/);
  });
  it("rejects when the source limit is reached", () => {
    expect(checkFile(file("a.pdf"), MAX_SOURCES)).toMatch(/up to 5 sources/);
  });
});

describe("checkPaste", () => {
  it("accepts pasted HTML under the limit", () => {
    expect(checkPaste("<div>hello</div>")).toBeNull();
  });
  it("rejects pasted HTML over 1 MB", () => {
    const huge = "a".repeat(MAX_PASTE_BYTES + 1);
    expect(checkPaste(huge)).toMatch(/over 1 MB/);
  });
});
