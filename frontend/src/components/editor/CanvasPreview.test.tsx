// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasPreview } from "./CanvasPreview";

// React's `act` (used directly here, without a testing-library wrapper) needs this flag set,
// or it warns "The current testing environment is not configured to support act(...)".
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom, unlike real browsers, doesn't treat a bare contentEditable element as focusable
// without an explicit tabindex (real browsers make any editing host part of the default tab
// order per spec; jsdom's focus algorithm doesn't implement that rule). Adding tabindex="0"
// here is purely a test-fixture accommodation for that jsdom gap, exercising the same
// component code either way.
function buildHtml(aText: string, bText: string): string {
  return [
    '<div class="dp-panels-wrapper">',
    '<div class="dp-panel-group">',
    '<h3 class="dp-panel-heading">Tab</h3>',
    '<div class="dp-panel-content">',
    `<p data-edit="tabs.0.blocks.0.text" tabindex="0">${aText}</p>`,
    `<p data-edit="tabs.0.blocks.1.text" tabindex="0">${bText}</p>`,
    "</div></div></div>",
  ].join("");
}

describe("CanvasPreview: deferred save keeps focus through the resulting re-render", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    // The unmount test below unmounts `root` itself; guard against unmounting twice.
    try {
      act(() => root.unmount());
    } catch {
      // already unmounted
    }
    container.remove();
    vi.useRealTimers();
  });

  function render(html: string, onEdit: (path: string, value: string) => void) {
    act(() => {
      root.render(<CanvasPreview html={html} activeIndex={0} editable onSelect={() => {}} onEdit={onEdit} />);
    });
  }

  it("does not call onEdit synchronously on blur, calls it once timers run, and keeps the newly-focused element focused after the resulting re-render", () => {
    const onEdit = vi.fn();
    render(buildHtml("Para A", "Para B"), onEdit);

    const paraA = container.querySelector('[data-edit="tabs.0.blocks.0.text"]') as HTMLElement;
    const paraB = container.querySelector('[data-edit="tabs.0.blocks.1.text"]') as HTMLElement;

    act(() => {
      paraA.focus();
    });
    // Simulate typing " EDITED" in A.
    paraA.textContent = "Para A EDITED";

    // Simulate the user clicking into B: the browser moves focus (blur A, focus B)
    // synchronously as one unit, before any click handler even runs.
    act(() => {
      paraA.blur();
      paraB.focus();
    });
    // Simulate typing in B before A's deferred save has had a chance to land.
    paraB.textContent = "Para B EDITED";

    // The edit to A must not have been applied synchronously on blur...
    expect(onEdit).not.toHaveBeenCalled();
    // ...and focus must already have settled on B.
    expect(document.activeElement).toBe(paraB);

    // Now let the deferred save fire.
    act(() => {
      vi.runAllTimers();
    });

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith("tabs.0.blocks.0.text", "Para A EDITED");

    // Simulate the parent (EditorPage) applying the edit and re-rendering with new html, the
    // way persist()/setSaved() would once onEdit has been called.
    render(buildHtml("Para A EDITED", "Para B"), onEdit);

    // B must still be focused: the same data-edit path, on the freshly rebuilt DOM, is what
    // the layout effect's focus-restore logic must have found and refocused.
    const newParaB = container.querySelector('[data-edit="tabs.0.blocks.1.text"]');
    expect(newParaB).not.toBeNull();
    expect(document.activeElement).toBe(newParaB);
  });

  it("does not call, or throw calling, a deferred onEdit if the component unmounts before the timer fires", () => {
    const onEdit = vi.fn();
    render(buildHtml("Para A", "Para B"), onEdit);
    const paraA = container.querySelector('[data-edit="tabs.0.blocks.0.text"]') as HTMLElement;

    act(() => paraA.focus());
    paraA.textContent = "Para A EDITED";
    act(() => paraA.blur());
    expect(onEdit).not.toHaveBeenCalled();

    act(() => root.unmount());
    expect(() => act(() => vi.runAllTimers())).not.toThrow();
    expect(onEdit).not.toHaveBeenCalled();
  });
});
