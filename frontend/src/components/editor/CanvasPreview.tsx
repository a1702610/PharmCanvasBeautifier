import {
  useLayoutEffect,
  useMemo,
  useRef,
  type ClipboardEvent,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { collapseNewlines, htmlToMarkdown } from "../../render/editing";
import "../../render/preview.css";
import { sanitizePreviewHtml } from "../../render/sanitize";

interface Props {
  html: string;
  activeIndex: number;
  /** Inline text editing (see callouts-spec.md, "Inline text editing"). Off by default. */
  editable: boolean;
  onSelect: (index: number) => void;
  /** Called on blur of a [data-edit] element, only when its markdown value actually changed. */
  onEdit: (path: string, value: string) => void;
}

/** Character offset of the caret within `container`'s text content, or 0 if there's no
 *  selection inside it (used to restore the caret after an innerHTML replacement). */
function getCaretOffset(container: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

/** Places the caret at `offset` characters into `container`'s text content. */
function setCaretOffset(container: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let target: Text | null = null;
  let targetOffset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      target = node as Text;
      targetOffset = remaining;
      break;
    }
    remaining -= len;
  }
  const range = document.createRange();
  if (target) {
    range.setStart(target, targetOffset);
  } else {
    range.selectNodeContents(container);
    range.collapse(false);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function escapeAttrSelector(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

export function CanvasPreview({ html, activeIndex, editable, onSelect, onEdit }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const safe = useMemo(() => sanitizePreviewHtml(html), [html]);
  // The markdown value (and raw HTML) of the [data-edit] element that currently holds focus,
  // captured on focus-in so focus-out can tell whether anything actually changed, and can
  // restore the original content if the edit was cleared to empty.
  const focusValue = useRef<string | null>(null);
  const focusHtml = useRef<string | null>(null);
  // The `safe` HTML actually currently in the DOM, so we only tear down and rebuild it when
  // the content really changed (not e.g. on every `editable` toggle).
  const renderedSafe = useRef<string | null>(null);

  // Replaces the container's HTML manually (instead of dangerouslySetInnerHTML) so a
  // re-render triggered by saving one [data-edit] element's edit doesn't blow away another
  // element's in-progress edit and caret position while it still has focus: we snapshot which
  // data-edit path (if any) is currently focused and its caret offset before replacing the
  // DOM, then restore focus/caret to the element with the same path afterward.
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;

    if (renderedSafe.current !== safe) {
      const active = document.activeElement;
      const focused = active instanceof HTMLElement && container.contains(active) ? active.closest<HTMLElement>("[data-edit]") : null;
      const focusedPath = focused?.getAttribute("data-edit") ?? null;
      const caretOffset = focused ? getCaretOffset(focused) : 0;

      container.innerHTML = safe;
      renderedSafe.current = safe;

      if (focusedPath) {
        const restored = container.querySelector<HTMLElement>(`[data-edit="${escapeAttrSelector(focusedPath)}"]`);
        if (restored) {
          restored.focus();
          setCaretOffset(restored, caretOffset);
        }
      }
    }

    container.querySelectorAll<HTMLElement>("[data-edit]").forEach((el) => {
      el.contentEditable = editable ? "true" : "false";
    });
  }, [safe, editable]);

  // useLayoutEffect (not useEffect) so the active tab's panel is shown/hidden before the
  // browser paints, avoiding a flash of the wrong (or no) panel right after a save re-render.
  useLayoutEffect(() => {
    const groups = ref.current?.querySelectorAll<HTMLElement>(".dp-panel-group") ?? [];
    groups.forEach((group, i) => group.classList.toggle("is-active", i === activeIndex));
  }, [safe, activeIndex]);

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const heading = (e.target as HTMLElement).closest(".dp-panel-heading");
    if (!heading || !ref.current) return;
    const groups = Array.from(ref.current.querySelectorAll(".dp-panel-group"));
    const index = groups.indexOf(heading.parentElement as Element);
    if (index >= 0) onSelect(index);
  }

  function handleFocus(e: FocusEvent<HTMLDivElement>) {
    if (!editable) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-edit]");
    focusValue.current = target ? htmlToMarkdown(target) : null;
    focusHtml.current = target ? target.innerHTML : null;
  }

  function handleBlur(e: FocusEvent<HTMLDivElement>) {
    if (!editable) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-edit]");
    const path = target?.getAttribute("data-edit");
    if (target && path && focusValue.current !== null) {
      const value = htmlToMarkdown(target);
      if (value === "") {
        // Don't save an empty edit; put back what was there before.
        if (focusHtml.current !== null) target.innerHTML = focusHtml.current;
      } else if (value !== focusValue.current) {
        onEdit(path, value);
      }
    }
    focusValue.current = null;
    focusHtml.current = null;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!editable) return;
    if (e.key === "Enter" && (e.target as HTMLElement).closest("[data-edit]")) e.preventDefault();
  }

  function insertPlainText(raw: string) {
    document.execCommand("insertText", false, collapseNewlines(raw));
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    if (!editable) return;
    if (!(e.target as HTMLElement).closest("[data-edit]")) return;
    e.preventDefault();
    insertPlainText(e.clipboardData.getData("text/plain"));
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    if (editable) e.preventDefault();
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    if (!editable) return;
    if (!(e.target as HTMLElement).closest("[data-edit]")) return;
    e.preventDefault();
    insertPlainText(e.dataTransfer.getData("text/plain"));
  }

  return (
    <div
      ref={ref}
      className={`canvas-preview${editable ? " is-editing" : ""}`}
      onClick={handleClick}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    />
  );
}
