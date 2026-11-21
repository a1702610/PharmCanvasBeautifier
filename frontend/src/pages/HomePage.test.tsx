// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { listPages } from "../storage/db";
import HomePage from "./HomePage";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let cleanup: (() => void) | null = null;
afterEach(() => cleanup?.());

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route index element={<HomePage />} />
          <Route path="create" element={<p>AI create page</p>} />
          <Route path="pages/:id" element={<p>Editor</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  return container;
}

describe("HomePage", () => {
  it("offers the two ways to start, with the AI disclaimer", () => {
    const c = mount();
    expect(c.textContent).toContain("Use AI");
    expect(c.textContent).toContain("Build it manually");
    expect(c.textContent).toMatch(/hit or miss/i);
  });

  it("Use AI goes to the upload page", () => {
    const c = mount();
    const link = Array.from(c.querySelectorAll("a")).find((a) => a.textContent?.includes("Use AI"))!;
    act(() => link.click());
    expect(c.textContent).toContain("AI create page");
  });

  it("Build it manually saves a blank page and opens it in the editor", async () => {
    const before = (await listPages()).length;
    const c = mount();
    const button = Array.from(c.querySelectorAll("button")).find((b) => b.textContent?.includes("Build it manually"))!;
    await act(async () => {
      button.click();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(c.textContent).toContain("Editor");
    const pages = await listPages();
    expect(pages.length).toBe(before + 1);
    expect(pages.some((p) => p.title === "Untitled page")).toBe(true);
  });
});
