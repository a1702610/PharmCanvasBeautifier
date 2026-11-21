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

describe("CanvasPreview: tabs and accordions", () => {
  it("tabs ignore accordion groups; accordion headings toggle open", () => {
    const html = `<div id="dp-wrapper"><div class="dp-panels-wrapper dp-tabs-buttons-vertical">
    <div class="dp-panel-group"><h3 class="dp-panel-heading">1. A</h3><div class="dp-panel-content">
      <div class="dp-panels-wrapper dp-accordion-default"><div class="dp-panel-group"><h4 class="dp-panel-heading">More</h4><div class="dp-panel-content"><p>x</p></div></div></div>
    </div></div>
    <div class="dp-panel-group"><h3 class="dp-panel-heading">2. B</h3><div class="dp-panel-content"><p>y</p></div></div>
  </div></div>`;
    const onSelect = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<CanvasPreview html={html} activeIndex={1} editable={false} onSelect={onSelect} onEdit={() => true} />);
    });
    const tabGroups = container.querySelectorAll(".dp-tabs-buttons-vertical > .dp-panel-group");
    expect(tabGroups[1].classList.contains("is-active")).toBe(true);
    expect(container.querySelector(".dp-accordion-default > .dp-panel-group")!.classList.contains("is-active")).toBe(false);
    act(() => (container.querySelectorAll("h3.dp-panel-heading")[1] as HTMLElement).click());
    expect(onSelect).toHaveBeenLastCalledWith(1);
    const accHeading = container.querySelector("h4.dp-panel-heading") as HTMLElement;
    act(() => accHeading.click());
    expect(accHeading.parentElement!.classList.contains("is-open")).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
    act(() => accHeading.click());
    expect(accHeading.parentElement!.classList.contains("is-open")).toBe(false);
    act(() => root.unmount());
    container.remove();
  });
});

describe("CanvasPreview: open accordions survive an external re-render", () => {
  it("keeps the same accordion group open after html changes", () => {
    const build = (text: string) =>
      `<div class="dp-panels-wrapper dp-tabs-buttons-vertical"><div class="dp-panel-group"><h3 class="dp-panel-heading">1. A</h3><div class="dp-panel-content">` +
      `<div class="dp-panels-wrapper dp-accordion-default">` +
      `<div class="dp-panel-group"><h4 class="dp-panel-heading">One</h4><div class="dp-panel-content"><p>${text}</p></div></div>` +
      `<div class="dp-panel-group"><h4 class="dp-panel-heading">Two</h4><div class="dp-panel-content"><p>${text}</p></div></div>` +
      `</div></div></div></div>`;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const mount = (html: string) =>
      act(() => {
        root.render(<CanvasPreview html={html} activeIndex={0} editable={false} onSelect={() => {}} onEdit={() => true} />);
      });
    mount(build("first"));
    act(() => (container.querySelectorAll("h4.dp-panel-heading")[1] as HTMLElement).click());
    mount(build("second"));
    const groups = container.querySelectorAll(".dp-accordion-default > .dp-panel-group");
    expect(container.textContent).toContain("second");
    expect(groups[0].classList.contains("is-open")).toBe(false);
    expect(groups[1].classList.contains("is-open")).toBe(true);
    act(() => root.unmount());
    container.remove();
  });
});

describe("CanvasPreview: add/delete controls", () => {
  const html =
    `<div class="dp-panels-wrapper dp-tabs-buttons-vertical"><div class="dp-panel-group"><h3 class="dp-panel-heading">1. A</h3><div class="dp-panel-content">` +
    `<div class="pc-add"><button type="button" data-pc-action="add" data-pc-list="tabs.0.blocks" data-pc-index="0">+ Add</button></div>` +
    `<div class="pc-block"><button type="button" class="pc-del" data-pc-action="delete" data-pc-path="tabs.0.blocks.0">x</button>` +
    `<div class="dp-panels-wrapper dp-accordion-default"><div class="dp-panel-group"><h4 class="dp-panel-heading"><span data-edit="tabs.0.blocks.0.panels.0.title">One</span>` +
    `<button type="button" class="pc-del" data-pc-action="delete" data-pc-path="tabs.0.blocks.0.panels.0">x</button></h4><div class="dp-panel-content"><p>x</p></div></div>` +
    `<div class="pc-add"><button type="button" data-pc-action="add-panel" data-pc-list="tabs.0.blocks.0.panels" data-pc-index="1">+ Add collapsible panel</button></div>` +
    `</div></div></div></div></div>`;

  function mount(onAction: (a: unknown) => void, onSelect = vi.fn()) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<CanvasPreview html={html} activeIndex={0} editable onSelect={onSelect} onEdit={() => true} onAction={onAction} />);
    });
    return { container, root, onSelect };
  }

  it("reports add, add-panel and delete clicks without selecting tabs or toggling accordions", () => {
    const onAction = vi.fn();
    const { container, root, onSelect } = mount(onAction);
    const click = (sel: string) => act(() => (container.querySelector(sel) as HTMLElement).click());

    click('[data-pc-action="add"]');
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "add", list: "tabs.0.blocks", index: 0 }));
    expect(onAction.mock.calls[0][0].anchor).toBeDefined();

    click('[data-pc-action="add-panel"]');
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "add-panel", list: "tabs.0.blocks.0.panels", index: 1 }));

    click('[data-pc-path="tabs.0.blocks.0.panels.0"]');
    expect(onAction).toHaveBeenLastCalledWith({ kind: "delete", path: "tabs.0.blocks.0.panels.0" });
    expect(container.querySelector(".dp-accordion-default > .dp-panel-group")!.classList.contains("is-open")).toBe(false);

    click('[data-pc-path="tabs.0.blocks.0"]');
    expect(onAction).toHaveBeenLastCalledWith({ kind: "delete", path: "tabs.0.blocks.0" });
    expect(onSelect).not.toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  it("keeps the control buttons through sanitising", () => {
    const { container, root } = mount(vi.fn());
    expect(container.querySelectorAll("[data-pc-action]")).toHaveLength(4);
    act(() => root.unmount());
    container.remove();
  });
});

describe("CanvasPreview: row, column and point controls", () => {
  it("reports add-item, add-column and delete-column clicks", () => {
    const html =
      `<table><thead><tr class="pc-ctl-row"><th class="pc-ctl"><button type="button" data-pc-action="delete-column" data-pc-path="tabs.0.blocks.1" data-pc-index="1">x</button></th>` +
      `<th class="pc-ctl"><button type="button" data-pc-action="add-column" data-pc-path="tabs.0.blocks.1">+</button></th></tr></thead></table>` +
      `<div class="pc-add"><button type="button" data-pc-action="add-item" data-pc-list="tabs.0.blocks.1.rows" data-pc-index="2">+ Add row</button></div>`;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onAction = vi.fn();
    act(() => {
      root.render(<CanvasPreview html={html} activeIndex={0} editable onSelect={() => {}} onEdit={() => true} onAction={onAction} />);
    });
    const click = (sel: string) => act(() => (container.querySelector(sel) as HTMLElement).click());
    click('[data-pc-action="add-item"]');
    expect(onAction).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "add-item", list: "tabs.0.blocks.1.rows", index: 2 }));
    click('[data-pc-action="add-column"]');
    expect(onAction).toHaveBeenLastCalledWith({ kind: "add-column", path: "tabs.0.blocks.1" });
    click('[data-pc-action="delete-column"]');
    expect(onAction).toHaveBeenLastCalledWith({ kind: "delete-column", path: "tabs.0.blocks.1", index: 1 });
    act(() => root.unmount());
    container.remove();
  });
});

describe("CanvasPreview: Enter, '- ' and Backspace while typing", () => {
  const html =
    `<p data-edit="tabs.0.blocks.0.text" data-enter="split" data-autolist="1" tabindex="0">Hello <strong>big</strong> world</p>` +
    `<h2 data-edit="title" data-enter="none" tabindex="0">Title</h2>` +
    `<div><p data-edit="tabs.0.blocks.1.body" tabindex="0">Callout</p></div>` +
    `<ul><li><span data-edit="tabs.0.blocks.2.items.0" data-enter="split" tabindex="0"></span></li></ul>`;

  function mount(onAction = vi.fn(), onEdit = vi.fn(() => true), focusRequest?: { path: string; caret: "start" | "end"; id: number }) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = (fr?: typeof focusRequest) =>
      act(() => {
        root.render(<CanvasPreview html={html} activeIndex={0} editable onSelect={() => {}} onEdit={onEdit} onAction={onAction} focusRequest={fr} />);
      });
    render(focusRequest);
    return {
      container,
      onAction,
      onEdit,
      render,
      done: () => {
        act(() => root.unmount());
        container.remove();
      },
    };
  }

  function caretAt(node: Node, offset: number) {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  const key = (el: HTMLElement, k: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
    act(() => {
      el.dispatchEvent(event);
    });
    return event;
  };

  it("Enter in a paragraph reports a split at the caret, keeping formatting on each side", () => {
    const { container, onAction, onEdit, done } = mount();
    const p = container.querySelector<HTMLElement>('[data-edit="tabs.0.blocks.0.text"]')!;
    act(() => p.focus());
    caretAt(p.querySelector("strong")!.firstChild!, 1); // "Hello b|ig world"
    const event = key(p, "Enter");
    expect(event.defaultPrevented).toBe(true);
    expect(onAction).toHaveBeenCalledWith({ kind: "split", path: "tabs.0.blocks.0.text", before: "Hello **b**", after: "**ig** world" });
    act(() => p.blur());
    expect(onEdit).not.toHaveBeenCalled();
    done();
  });

  it("Enter in a title does nothing", () => {
    const { container, onAction, done } = mount();
    const h2 = container.querySelector<HTMLElement>('[data-edit="title"]')!;
    act(() => h2.focus());
    caretAt(h2.firstChild!, 2);
    expect(key(h2, "Enter").defaultPrevented).toBe(true);
    expect(onAction).not.toHaveBeenCalled();
    expect(h2.innerHTML).toBe("Title");
    done();
  });

  it("Enter in other text inserts a line break in the same box", () => {
    const { container, onAction, done } = mount();
    const body = container.querySelector<HTMLElement>('[data-edit="tabs.0.blocks.1.body"]')!;
    act(() => body.focus());
    caretAt(body.firstChild!, 3);
    key(body, "Enter");
    expect(onAction).not.toHaveBeenCalled();
    expect(body.innerHTML).toBe("Cal<br>lout");
    done();
  });

  it("Shift+Enter in a paragraph is a line break, not a split", () => {
    const { container, onAction, done } = mount();
    const p = container.querySelector<HTMLElement>('[data-edit="tabs.0.blocks.0.text"]')!;
    act(() => p.focus());
    caretAt(p.firstChild!, 5);
    key(p, "Enter", { shiftKey: true });
    expect(onAction).not.toHaveBeenCalled();
    expect(p.innerHTML).toContain("<br>");
    done();
  });

  it("typing '- ' at the start of a paragraph asks for a bullet list", () => {
    const { container, onAction, done } = mount();
    const p = container.querySelector<HTMLElement>('[data-edit="tabs.0.blocks.0.text"]')!;
    act(() => p.focus());
    p.innerHTML = "- Hello";
    act(() => {
      p.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onAction).toHaveBeenCalledWith({ kind: "to-list", path: "tabs.0.blocks.0.text", text: "- Hello", caretLine: 0 });
    done();
  });

  it("Backspace in an empty bullet asks to remove it", () => {
    const { container, onAction, done } = mount();
    const li = container.querySelector<HTMLElement>('[data-edit="tabs.0.blocks.2.items.0"]')!;
    act(() => li.focus());
    expect(key(li, "Backspace").defaultPrevented).toBe(true);
    expect(onAction).toHaveBeenCalledWith({ kind: "remove-empty", path: "tabs.0.blocks.2.items.0" });
    done();
  });

  it("Backspace in a field with text behaves normally", () => {
    const { container, onAction, done } = mount();
    const p = container.querySelector<HTMLElement>('[data-edit="tabs.0.blocks.0.text"]')!;
    act(() => p.focus());
    expect(key(p, "Backspace").defaultPrevented).toBe(false);
    expect(onAction).not.toHaveBeenCalled();
    done();
  });

  it("focusRequest puts the caret in the requested field", () => {
    const { container, render, done } = mount();
    render({ path: "tabs.0.blocks.1.body", caret: "end", id: 1 });
    const body = container.querySelector<HTMLElement>('[data-edit="tabs.0.blocks.1.body"]')!;
    expect(document.activeElement).toBe(body);
    done();
  });
});

describe("CanvasPreview: '- ' at the start of a later line", () => {
  const html =
    `<p data-edit="tabs.0.blocks.0.text" data-enter="split" data-autolist="1" tabindex="0">Hello</p>` +
    `<table><tbody><tr><td data-edit="tabs.0.blocks.1.rows.0.0" data-bullets="1" tabindex="0">Cell</td></tr></tbody></table>`;

  function mount(onAction = vi.fn(), onEdit = vi.fn(() => true)) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<CanvasPreview html={html} activeIndex={0} editable onSelect={() => {}} onEdit={onEdit} onAction={onAction} />);
    });
    return { container, onAction, onEdit, done: () => { act(() => root.unmount()); container.remove(); } };
  }

  // Simulates typing "- " on a new line: the field holds TEXT<br>"- " with the caret after the space.
  function typeDashOnNewLine(field: HTMLElement, before: string) {
    field.innerHTML = `${before}<br>`;
    const dash = document.createTextNode("- ");
    field.appendChild(dash);
    const range = document.createRange();
    range.setStart(dash, 2);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    act(() => {
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("in a paragraph it asks for the paragraph to become text + bullet list", () => {
    const { container, onAction, done } = mount();
    const p = container.querySelector<HTMLElement>('[data-edit="tabs.0.blocks.0.text"]')!;
    act(() => p.focus());
    typeDashOnNewLine(p, "Hello");
    expect(onAction).toHaveBeenCalledWith({ kind: "to-list", path: "tabs.0.blocks.0.text", text: "Hello\n- ", caretLine: 1 });
    done();
  });

  it("in a table cell it becomes a bullet right away", () => {
    const { container, onAction, done } = mount();
    const td = container.querySelector<HTMLElement>("td")!;
    act(() => td.focus());
    typeDashOnNewLine(td, "Cell");
    expect(onAction).not.toHaveBeenCalled();
    expect(td.querySelector("ul > li")).not.toBeNull();
    expect(td.textContent).toBe("Cell");
    expect(td.innerHTML.startsWith("Cell<ul><li>")).toBe(true);
    done();
  });

  function enterInLi(td: HTMLElement, html: string, liIndex: number, offset: number) {
    td.innerHTML = html;
    act(() => td.focus());
    const li = td.querySelectorAll("li")[liIndex];
    const range = document.createRange();
    if (li.firstChild?.nodeType === Node.TEXT_NODE) range.setStart(li.firstChild, offset);
    else range.setStart(li, 0);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => {
      li.dispatchEvent(event);
    });
    return event;
  }

  it("Enter inside a bullet in a cell splits it into a new bullet", () => {
    const { container, done } = mount();
    const td = container.querySelector<HTMLElement>("td")!;
    const event = enterInLi(td, "Cell<ul><li>onetwo</li></ul>", 0, 3);
    expect(event.defaultPrevented).toBe(true);
    expect(Array.from(td.querySelectorAll("li")).map((li) => li.textContent)).toEqual(["one", "two"]);
    done();
  });

  it("Enter on an empty last bullet in a cell ends the list", () => {
    const { container, done } = mount();
    const td = container.querySelector<HTMLElement>("td")!;
    // The caret sits directly in the empty <li> (not in a text node), as after splitting a bullet.
    enterInLi(td, "Cell<ul><li>one</li><li><br></li></ul>", 1, 0);
    expect(td.querySelectorAll("li")).toHaveLength(1);
    expect(td.lastChild?.nodeName).not.toBe("UL");
    done();
  });

  it("leaving a paragraph that has '- ' lines converts it instead of saving the text as-is", () => {
    const { container, onAction, onEdit, done } = mount();
    const p = container.querySelector<HTMLElement>('[data-edit="tabs.0.blocks.0.text"]')!;
    act(() => p.focus());
    p.innerHTML = "Hello<br>* a<br>- b";
    act(() => p.blur());
    expect(onEdit).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledWith({ kind: "to-list", path: "tabs.0.blocks.0.text", text: "Hello\n* a\n- b" });
    done();
  });
});

describe("CanvasPreview: tab controls", () => {
  it("reports add-tab, delete-tab and move-tab without selecting the tab", () => {
    const html =
      `<div class="dp-panels-wrapper dp-tabs-buttons-vertical">` +
      `<div class="dp-panel-group"><h3 class="dp-panel-heading">1. A` +
      `<button type="button" data-pc-action="move-tab" data-pc-index="0" data-pc-dir="1">v</button>` +
      `<button type="button" data-pc-action="delete-tab" data-pc-index="0">x</button></h3><div class="dp-panel-content"></div></div>` +
      `<div class="pc-add pc-add-tab"><button type="button" data-pc-action="add-tab">+ Add tab</button></div>` +
      `</div>`;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onAction = vi.fn();
    const onSelect = vi.fn();
    act(() => {
      root.render(<CanvasPreview html={html} activeIndex={0} editable onSelect={onSelect} onEdit={() => true} onAction={onAction} />);
    });
    const click = (sel: string) => act(() => (container.querySelector(sel) as HTMLElement).click());
    click('[data-pc-action="move-tab"]');
    expect(onAction).toHaveBeenLastCalledWith({ kind: "move-tab", index: 0, dir: 1 });
    click('[data-pc-action="delete-tab"]');
    expect(onAction).toHaveBeenLastCalledWith({ kind: "delete-tab", index: 0 });
    click('[data-pc-action="add-tab"]');
    expect(onAction).toHaveBeenLastCalledWith({ kind: "add-tab" });
    expect(onSelect).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
