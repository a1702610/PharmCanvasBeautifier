// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { NotesPanel } from "./NotesPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("NotesPanel", () => {
  it("shows a multi-line note's '- ' lines as a list under its first line", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() =>
      root.render(
        <NotesPanel
          notes={[
            { kind: "unplaced", text: "Slides/pages the AI left out:\n- Page 1 (Hypertension): title slide\n- Page 18 (Hypertension): title slide" },
            { kind: "flag", text: "A single-line note." },
          ]}
        />,
      ),
    );
    const items = Array.from(container.querySelectorAll("li li")).map((li) => li.textContent);
    expect(items).toEqual(["Page 1 (Hypertension): title slide", "Page 18 (Hypertension): title slide"]);
    expect(container.textContent).toContain("Slides/pages the AI left out:");
    expect(container.textContent).toContain("A single-line note.");
    act(() => root.unmount());
  });
});
