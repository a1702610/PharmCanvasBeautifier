// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadModelChoice, ModelChoice, saveModelChoice } from "./ModelChoice";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  localStorage.clear();
});

function mount(value: "flash" | "pro", onChange = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<ModelChoice value={value} onChange={onChange} />));
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  return { container, onChange };
}

describe("ModelChoice", () => {
  it("offers Flash and Pro with an explanation of each", () => {
    const { container } = mount("flash");
    const radios = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios.map((r) => r.value)).toEqual(["flash", "pro"]);
    expect(radios[0].checked).toBe(true);
    expect(container.textContent).toMatch(/free/i);
    expect(container.textContent).toMatch(/billing/i);
  });

  it("reports the choice", () => {
    const { container, onChange } = mount("flash");
    act(() => container.querySelector<HTMLInputElement>('input[value="pro"]')!.click());
    expect(onChange).toHaveBeenCalledWith("pro");
  });

  it("remembers the choice in this browser, defaulting to Flash", () => {
    expect(loadModelChoice()).toBe("flash");
    saveModelChoice("pro");
    expect(loadModelChoice()).toBe("pro");
    localStorage.setItem("pharm_canvas_model", "something-else");
    expect(loadModelChoice()).toBe("flash");
  });
});
