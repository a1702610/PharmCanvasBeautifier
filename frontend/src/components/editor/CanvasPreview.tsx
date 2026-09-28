import { useEffect, useMemo, useRef, type ClipboardEvent, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { htmlToMarkdown } from "../../render/editing";
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

export function CanvasPreview({ html, activeIndex, editable, onSelect, onEdit }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const safe = useMemo(() => sanitizePreviewHtml(html), [html]);
  // The markdown value of the [data-edit] element that currently holds focus, captured on
  // focus-in so focus-out can tell whether anything actually changed before calling onEdit.
  const focusValue = useRef<string | null>(null);

  useEffect(() => {
    const groups = ref.current?.querySelectorAll<HTMLElement>(".dp-panel-group") ?? [];
    groups.forEach((group, i) => group.classList.toggle("is-active", i === activeIndex));
  }, [safe, activeIndex]);

  useEffect(() => {
    const editables = ref.current?.querySelectorAll<HTMLElement>("[data-edit]") ?? [];
    editables.forEach((el) => {
      el.contentEditable = editable ? "true" : "false";
    });
  }, [safe, editable]);

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
  }

  function handleBlur(e: FocusEvent<HTMLDivElement>) {
    if (!editable) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-edit]");
    const path = target?.getAttribute("data-edit");
    if (target && path && focusValue.current !== null) {
      const value = htmlToMarkdown(target);
      if (value !== focusValue.current) onEdit(path, value);
    }
    focusValue.current = null;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!editable) return;
    if (e.key === "Enter" && (e.target as HTMLElement).closest("[data-edit]")) e.preventDefault();
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    if (!editable) return;
    if (!(e.target as HTMLElement).closest("[data-edit]")) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
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
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
