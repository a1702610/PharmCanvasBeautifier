// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { GenerateProgress } from "./GenerateProgress";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("GenerateProgress", () => {
  it("includes the automatic check as its own step, after structuring", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<GenerateProgress stage="checking" />));
    const steps = Array.from(container.querySelectorAll("li")).map((li) => li.textContent ?? "");
    expect(steps.map((s) => s.replace(/^✓/, "").split("(")[0].trim())).toEqual([
      "Reading files",
      "Structuring content",
      "Checking against your slides",
      "Building page",
    ]);
    expect(steps[1].startsWith("✓")).toBe(true);
    act(() => root.unmount());
  });
});
