// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { emptyStudy, StudyMaterialsForm } from "./StudyMaterialsForm";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(onChange = vi.fn()) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  act(() => createRoot(div).render(<StudyMaterialsForm value={emptyStudy()} onChange={onChange} />));
  return { div, onChange };
}

describe("StudyMaterialsForm", () => {
  it("adds a recording row", () => {
    const { div, onChange } = mount();
    const add = Array.from(div.querySelectorAll("button")).find((b) => b.textContent?.includes("Add recording"))!;
    act(() => add.click());
    expect(onChange).toHaveBeenLastCalledWith({ recordings: [{}], resources: [] });
  });

  it("edits the handout link", () => {
    const { div, onChange } = mount();
    const input = div.querySelector('input[aria-label="Handout link"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "https://learn/x");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith({ handout: { url: "https://learn/x" }, recordings: [], resources: [] });
  });

  it("flags non-http links", () => {
    const div = document.createElement("div");
    act(() => createRoot(div).render(<StudyMaterialsForm value={{ handout: { url: "www.x.com" }, recordings: [], resources: [] }} onChange={() => {}} />));
    expect(div.textContent).toContain("Links must start with https://");
  });
});
