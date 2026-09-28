// @vitest-environment jsdom
import { act, useState } from "react";
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
// component code either way (the component itself never sets tabindex).
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

describe("CanvasPreview: self-originated edits don't rebuild the DOM, external changes still do", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(html: string, onEdit: (path: string, value: string) => boolean) {
    act(() => {
      root.render(<CanvasPreview html={html} activeIndex={0} editable onSelect={() => {}} onEdit={onEdit} />);
    });
  }

  it("calls onEdit synchronously on blur (no deferral), and the resulting self-originated re-render leaves the DOM untouched, so a field being typed into elsewhere keeps its unsaved content", () => {
    const onEdit = vi.fn(() => true);
    render(buildHtml("Para A", "Para B"), onEdit);

    const paraA = container.querySelector('[data-edit="tabs.0.blocks.0.text"]') as HTMLElement;
    const paraB = container.querySelector('[data-edit="tabs.0.blocks.1.text"]') as HTMLElement;

    act(() => paraA.focus());
    // Simulate typing " EDITED" in A.
    paraA.textContent = "Para A EDITED";

    // Simulate the user clicking into B: the browser moves focus (blur A, focus B)
    // synchronously as one unit, before any click handler even runs.
    act(() => {
      paraA.blur();
      paraB.focus();
    });

    // onEdit fired synchronously, with no timer involved - a click on Copy HTML/Undo/Export
    // immediately after this blur would already see the edit applied.
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith("tabs.0.blocks.0.text", "Para A EDITED");
    expect(document.activeElement).toBe(paraB);

    // The user starts typing into B before the parent's re-render (triggered by that onEdit
    // call) lands.
    paraB.textContent = "Para B EDITED";

    // Simulate the parent (EditorPage) applying A's edit and re-rendering. Note the new html
    // still carries B's ORIGINAL (pre-edit) text - exactly what a render computed from the
    // freshly-saved page would contain, since B hasn't blurred/saved yet.
    render(buildHtml("Para A EDITED", "Para B"), onEdit);

    // This was a self-originated change (skipRebuild was set before onEdit was called), so the
    // container must NOT have been rebuilt: both elements keep their identity...
    expect(container.querySelector('[data-edit="tabs.0.blocks.0.text"]')).toBe(paraA);
    expect(container.querySelector('[data-edit="tabs.0.blocks.1.text"]')).toBe(paraB);
    // ...and B's live, not-yet-saved typed content survives untouched, rather than being
    // stomped back to the pre-edit text the new html actually contains for it.
    expect(paraB.textContent).toBe("Para B EDITED");
    expect(document.activeElement).toBe(paraB);
  });

  it("rebuilds the DOM for an external change (no self-originated edit in flight) and restores focus to the same data-edit path", () => {
    const onEdit = vi.fn(() => true);
    render(buildHtml("Para A", "Para B"), onEdit);

    const paraB = container.querySelector('[data-edit="tabs.0.blocks.1.text"]') as HTMLElement;
    act(() => paraB.focus());
    expect(document.activeElement).toBe(paraB);

    // An external change (e.g. an undo elsewhere): onEdit was never called, so nothing set
    // skipRebuild - this must do a full rebuild.
    render(buildHtml("Para A", "Para B (undone)"), onEdit);

    const newParaB = container.querySelector('[data-edit="tabs.0.blocks.1.text"]');
    expect(newParaB).not.toBeNull();
    expect(newParaB).not.toBe(paraB); // a genuinely new node - it WAS rebuilt
    expect(document.activeElement).toBe(newParaB);
  });

  it("consumes the self-originated flag after one render: a self edit followed by an external change rebuilds normally for that second change", () => {
    const onEdit = vi.fn(() => true);
    render(buildHtml("Para A", "Para B"), onEdit);

    const paraA = container.querySelector('[data-edit="tabs.0.blocks.0.text"]') as HTMLElement;
    act(() => paraA.focus());
    paraA.textContent = "Para A EDITED";
    act(() => paraA.blur());
    expect(onEdit).toHaveBeenCalledTimes(1);

    // The self-originated re-render: no rebuild, same node.
    render(buildHtml("Para A EDITED", "Para B"), onEdit);
    expect(container.querySelector('[data-edit="tabs.0.blocks.0.text"]')).toBe(paraA);

    // A subsequent external change must rebuild - the flag must not still be "on" from the
    // self-edit above.
    render(buildHtml("Para A EDITED (changed elsewhere)", "Para B"), onEdit);
    const rebuiltA = container.querySelector('[data-edit="tabs.0.blocks.0.text"]');
    expect(rebuiltA).not.toBeNull();
    expect(rebuiltA).not.toBe(paraA);
    expect(rebuiltA?.textContent).toBe("Para A EDITED (changed elsewhere)");
  });

  it("reverts the element and clears the flag immediately when onEdit reports failure, so the next external change still rebuilds", () => {
    const onEdit = vi.fn(() => false);
    render(buildHtml("Para <strong>A</strong>", "Para B"), onEdit);

    const paraA = container.querySelector('[data-edit="tabs.0.blocks.0.text"]') as HTMLElement;
    act(() => paraA.focus());
    paraA.textContent = "Para A EDITED";
    act(() => paraA.blur());

    expect(onEdit).toHaveBeenCalledTimes(1);
    // The failed edit is rolled back to exactly what the element held when it got focus.
    expect(paraA.innerHTML).toBe("Para <strong>A</strong>");

    // No timers are run here: the flag must already be clear, not merely expiring later.
    render(buildHtml("Para A (undone elsewhere)", "Para B"), onEdit);
    const rebuiltA = container.querySelector('[data-edit="tabs.0.blocks.0.text"]');
    expect(rebuiltA).not.toBe(paraA);
    expect(rebuiltA?.textContent).toBe("Para A (undone elsewhere)");
  });

  it("expires the flag on the next macrotask when a successful edit produces no html change, so a later external change still rebuilds", () => {
    vi.useFakeTimers();
    try {
      const onEdit = vi.fn(() => true);
      const html = buildHtml("Para A", "Para B");
      render(html, onEdit);

      const paraA = container.querySelector('[data-edit="tabs.0.blocks.0.text"]') as HTMLElement;
      act(() => paraA.focus());
      paraA.textContent = "Para A EDITED";
      act(() => paraA.blur());
      expect(onEdit).toHaveBeenCalledTimes(1);

      // Parent re-renders but the html string is identical (e.g. the edit normalised back to
      // the same render), so the layout effect never runs to consume the flag.
      render(html, onEdit);
      act(() => {
        vi.runAllTimers();
      });

      render(buildHtml("Para A (regenerated)", "Para B"), onEdit);
      const rebuiltA = container.querySelector('[data-edit="tabs.0.blocks.0.text"]');
      expect(rebuiltA).not.toBe(paraA);
      expect(rebuiltA?.textContent).toBe("Para A (regenerated)");
    } finally {
      vi.useRealTimers();
    }
  });

  it("React flushes the parent's state update from a real blur before the next macrotask, so the flag is consumed by the self-edit render before it expires", async () => {
    // Verifies the ordering the self-expiring flag relies on, using React's real scheduler:
    // no act() around the blur (act would force a synchronous flush and prove nothing).
    const actEnv = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    let lastHtml = "";
    function Harness() {
      const [html, setHtml] = useState(buildHtml("Para A", "Para B"));
      lastHtml = html;
      return (
        <CanvasPreview
          html={html}
          activeIndex={0}
          editable
          onSelect={() => {}}
          onEdit={(_path, value) => {
            setHtml(buildHtml(value, "Para B"));
            return true;
          }}
        />
      );
    }
    act(() => root.render(<Harness />));

    const paraA = container.querySelector('[data-edit="tabs.0.blocks.0.text"]') as HTMLElement;
    const paraB = container.querySelector('[data-edit="tabs.0.blocks.1.text"]') as HTMLElement;
    act(() => paraA.focus());
    paraA.textContent = "Para A EDITED";

    actEnv.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      paraA.blur();
      paraB.focus();
      paraB.textContent = "Para B EDITED";
      // Scheduled after the component's expiry timer, so this resolves only once it has fired.
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      actEnv.IS_REACT_ACT_ENVIRONMENT = true;
    }

    // The self-edit render did happen...
    expect(lastHtml).toBe(buildHtml("Para A EDITED", "Para B"));
    // ...and it saw the flag (it ran before the expiry timer), so nothing was rebuilt.
    expect(container.querySelector('[data-edit="tabs.0.blocks.0.text"]')).toBe(paraA);
    expect(container.querySelector('[data-edit="tabs.0.blocks.1.text"]')).toBe(paraB);
    expect(paraB.textContent).toBe("Para B EDITED");
  });
});
