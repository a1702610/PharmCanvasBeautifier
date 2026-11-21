// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddBlockMenu } from "./AddBlockMenu";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const anchor = { top: 100, bottom: 120, left: 200, right: 260, width: 60, height: 20, x: 200, y: 100, toJSON: () => ({}) } as DOMRect;
let cleanup: (() => void) | null = null;
afterEach(() => cleanup?.());

function mount(insidePanel: boolean, onPick = vi.fn(), onClose = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<AddBlockMenu anchor={anchor} insidePanel={insidePanel} onPick={onPick} onClose={onClose} />));
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  return { container, onPick, onClose };
}

describe("AddBlockMenu", () => {
  it("lists every section type and reports the one picked", () => {
    const { container, onPick } = mount(false);
    const items = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const labels = items.map((b) => b.textContent);
    expect(labels).toContain("Why this matters clinically");
    expect(labels).toContain("Check your understanding");
    expect(labels).toContain("Table");
    expect(labels).toContain("Collapsible section");
    act(() => items.find((b) => b.textContent === "Table")!.click());
    expect(onPick).toHaveBeenCalledWith("table");
  });

  it("offers no collapsible section inside a collapsible panel", () => {
    const { container } = mount(true);
    expect(container.textContent).not.toContain("Collapsible section");
  });

  it("closes on Escape and on a click outside", () => {
    const { onClose } = mount(false);
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
