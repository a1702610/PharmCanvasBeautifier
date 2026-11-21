// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Header } from "./Header";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Header", () => {
  it("shows just the PharmCanvas name, without the tagline", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<MemoryRouter><Header /></MemoryRouter>));
    expect(container.textContent).toContain("PharmCanvas");
    expect(container.textContent).not.toContain("in one house style");
    act(() => root.unmount());
  });
});
