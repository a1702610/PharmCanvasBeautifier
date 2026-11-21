import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { collapseNewlines, htmlToMarkdown } from "../../render/editing";
import { BULLET_LINE, hasBulletLines } from "../../render/inline";
import "../../render/preview.css";
import { sanitizePreviewHtml } from "../../render/sanitize";

/** A click on one of the editor's add/delete controls (rendered only in edit mode; see
 *  contentLines in templates.ts). `list` is the dot path of the list to insert into. */
export type PreviewAction =
  | { kind: "add" | "add-panel" | "add-item"; list: string; index: number; anchor: DOMRect }
  | { kind: "delete" | "add-column"; path: string }
  | { kind: "delete-column"; path: string; index: number }
  // Typing (see the data-enter / data-autolist markers in templates.ts):
  | { kind: "split"; path: string; before: string; after: string }
  | { kind: "to-list"; path: string; text: string; caretLine?: number }
  | { kind: "remove-empty"; path: string };

/** Ask the preview to put the caret in the field at `path` after the next render (e.g. the new
 *  paragraph after Enter). `id` distinguishes repeated requests for the same path. */
export interface FocusRequest {
  path: string;
  caret: "start" | "end";
  id: number;
}

interface Props {
  html: string;
  activeIndex: number;
  /** Inline text editing (see callouts-spec.md, "Inline text editing"). Off by default. */
  editable: boolean;
  onSelect: (index: number) => void;
  /** Called on blur of a [data-edit] element, only when its markdown value actually changed.
   *  Returns whether the edit was accepted; on false the element is reverted to its content at
   *  focus time. */
  onEdit: (path: string, value: string) => boolean;
  onAction?: (action: PreviewAction) => void;
  focusRequest?: FocusRequest | null;
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

/** The text node holding the caret, when the caret sits right after a "- " / "* " / "• " typed
 *  at the start of a line (the field's start, or just after a line break). */
function typedBulletMarker(field: HTMLElement): { node: Text; offset: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (!range.collapsed || node.nodeType !== Node.TEXT_NODE || !field.contains(node)) return null;
  const text = node as Text;
  if (!/^[-*\u2022][ \u00a0]$/.test(text.data.slice(0, range.startOffset))) return null;
  const prev = text.previousSibling;
  const atLineStart = prev ? prev.nodeName === "BR" : text.parentNode === field;
  return atLineStart ? { node: text, offset: range.startOffset } : null;
}

/** Markdown of the field's content between two points (null = the field's start / end). */
function markdownOfRange(field: HTMLElement, from: { node: Node; offset: number } | null, toBefore: Node | null): string {
  const range = document.createRange();
  range.selectNodeContents(field);
  if (from) range.setStart(from.node, from.offset);
  if (toBefore) range.setEndBefore(toBefore);
  const holder = document.createElement("div");
  holder.appendChild(range.cloneContents());
  return htmlToMarkdown(holder);
}

/** Replaces a just-typed "- " line start with a one-bullet list holding the rest of that text,
 *  and puts the caret in the bullet. */
function makeBulletInPlace(node: Text, offset: number) {
  const rest = node.data.slice(offset);
  const ul = document.createElement("ul");
  const li = document.createElement("li");
  if (rest) li.textContent = rest;
  else li.appendChild(document.createElement("br"));
  ul.appendChild(li);
  if (node.previousSibling?.nodeName === "BR") node.previousSibling.remove();
  node.replaceWith(ul);
  const caret = document.createRange();
  caret.setStart(li, 0);
  caret.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(caret);
}

/** The field's text before and after the caret, as inline markdown (formatting kept). */
function splitAtCaret(field: HTMLElement): { before: string; after: string } {
  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  if (!range || !field.contains(range.startContainer)) return { before: htmlToMarkdown(field), after: "" };
  const toMarkdown = (part: Range) => {
    const holder = document.createElement("div");
    holder.appendChild(part.cloneContents());
    return htmlToMarkdown(holder);
  };
  const head = document.createRange();
  head.selectNodeContents(field);
  head.setEnd(range.startContainer, range.startOffset);
  const tail = document.createRange();
  tail.selectNodeContents(field);
  tail.setStart(range.endContainer, range.endOffset);
  return { before: toMarkdown(head), after: toMarkdown(tail) };
}

/** Inserts a <br> at the caret (replacing any selection) and puts the caret after it. A break
 *  at the very end gets a second, trailing <br> so the caret can sit on the new line; trailing
 *  breaks are dropped when the text is saved. */
function insertLineBreak(field: HTMLElement) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !field.contains(sel.getRangeAt(0).startContainer)) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const br = document.createElement("br");
  range.insertNode(br);
  const next = br.nextSibling;
  if (!next || (next.nodeType === Node.TEXT_NODE && !next.textContent && !next.nextSibling)) br.after(document.createElement("br"));
  const caret = document.createRange();
  caret.setStartAfter(br);
  caret.collapse(true);
  sel.removeAllRanges();
  sel.addRange(caret);
}

function markActiveTab(container: HTMLElement, activeIndex: number) {
  const groups = container.querySelectorAll<HTMLElement>(".dp-tabs-buttons-vertical > .dp-panel-group");
  groups.forEach((group, i) => group.classList.toggle("is-active", i === activeIndex));
}

function escapeAttrSelector(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

export function CanvasPreview({ html, activeIndex, editable, onSelect, onEdit, onAction, focusRequest }: Props) {
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
  // Set by handleBlur, immediately before it calls onEdit, for an edit that originated in this
  // preview. The resulting re-render's html change is just this element's own new text landing
  // back in `html` - the DOM already shows it - so the layout effect below skips rebuilding the
  // container for that one change instead of tearing down/recreating every node (which would
  // either strand focus mid-flight to wherever the user clicked next, or, if the user is already
  // typing in a different field by the time this lands, blow away that field's own not-yet-saved
  // keystrokes by replacing it with its last-persisted content).
  //
  // The layout effect only runs when `safe`/`editable` change, so it alone can't guarantee the
  // flag is cleared: if onEdit rejects the edit, or accepts it but the re-rendered html is
  // identical, no effect run happens and a stale flag would suppress the next unrelated
  // external rebuild. So the flag is cleared in three places: by the effect when it consumes it;
  // immediately by handleBlur when onEdit returns false; and otherwise by `skipExpiry`, a timer
  // on the next macrotask. React flushes a discrete event's (blur's) state updates before the
  // next macrotask (see CanvasPreview.test.tsx), so a real self-edit render always sees the
  // flag first; if no render comes, it simply expires.
  const skipRebuild = useRef(false);
  const skipExpiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledFocusRequest = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (skipExpiry.current !== null) clearTimeout(skipExpiry.current);
    },
    [],
  );

  // Replaces the container's HTML manually (instead of dangerouslySetInnerHTML) so an
  // *external* re-render (undo, add/delete, loading another page, toggling Edit text) doesn't
  // blow away another element's in-progress edit and caret position while it still has focus:
  // we snapshot which data-edit path (if any) is currently focused and its caret offset before
  // replacing the DOM, then restore focus/caret to the element with the same path afterward.
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;

    const skip = skipRebuild.current;
    skipRebuild.current = false;

    if (renderedSafe.current !== safe) {
      if (skip) {
        renderedSafe.current = safe;
      } else {
        const active = document.activeElement;
        const focused = active instanceof HTMLElement && container.contains(active) ? active.closest<HTMLElement>("[data-edit]") : null;
        const focusedPath = focused?.getAttribute("data-edit") ?? null;
        const caretOffset = focused ? getCaretOffset(focused) : 0;

        const openIdx = Array.from(container.querySelectorAll(".dp-accordion-default > .dp-panel-group")).flatMap((g, i) =>
          g.classList.contains("is-open") ? [i] : [],
        );

        container.innerHTML = safe;
        renderedSafe.current = safe;

        const accs = container.querySelectorAll(".dp-accordion-default > .dp-panel-group");
        openIdx.forEach((i) => accs[i]?.classList.add("is-open"));
        // Show the active tab before restoring focus: an element in a hidden tab can't take focus.
        markActiveTab(container, activeIndex);

        if (focusedPath) {
          const restored = container.querySelector<HTMLElement>(`[data-edit="${escapeAttrSelector(focusedPath)}"]`);
          if (restored) {
            restored.focus();
            setCaretOffset(restored, caretOffset);
          }
        }
      }
    }

    container.querySelectorAll<HTMLElement>("[data-edit]").forEach((el) => {
      el.contentEditable = editable ? "true" : "false";
    });

    if (editable && focusRequest && focusRequest.id !== handledFocusRequest.current) {
      handledFocusRequest.current = focusRequest.id;
      const target = container.querySelector<HTMLElement>(`[data-edit="${escapeAttrSelector(focusRequest.path)}"]`);
      if (target) {
        target.focus();
        setCaretOffset(target, focusRequest.caret === "start" ? 0 : (target.textContent ?? "").length);
      }
    }
    // activeIndex only matters for a rebuild (markActiveTab above); renderedSafe guards the rest.
  }, [safe, editable, focusRequest, activeIndex]);

  // useLayoutEffect (not useEffect) so the active tab's panel is shown/hidden before the
  // browser paints, avoiding a flash of the wrong (or no) panel right after a save re-render.
  useLayoutEffect(() => {
    if (ref.current) markActiveTab(ref.current, activeIndex);
  }, [safe, activeIndex]);

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const control = (e.target as HTMLElement).closest<HTMLElement>("[data-pc-action]");
    if (control && editable) {
      e.preventDefault();
      const { pcAction: kind, pcPath: path, pcList: list } = control.dataset;
      const index = Number(control.dataset.pcIndex ?? 0);
      if ((kind === "delete" || kind === "add-column") && path) {
        onAction?.({ kind, path });
      } else if (kind === "delete-column" && path) {
        onAction?.({ kind, path, index });
      } else if ((kind === "add" || kind === "add-panel" || kind === "add-item") && list) {
        onAction?.({ kind, list, index, anchor: control.getBoundingClientRect() });
      }
      return;
    }
    const heading = (e.target as HTMLElement).closest(".dp-panel-heading");
    if (!heading || !ref.current) return;
    const group = heading.parentElement;
    if (group?.parentElement?.classList.contains("dp-accordion-default")) {
      // In edit mode a click inside the editable heading text places the caret instead.
      if (editable && (e.target as HTMLElement).closest("[data-edit]")) return;
      group.classList.toggle("is-open");
      return;
    }
    const groups = Array.from(ref.current.querySelectorAll(".dp-tabs-buttons-vertical > .dp-panel-group"));
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
      if (target.dataset.autolist && onAction && hasBulletLines(value)) {
        // A paragraph with "- " lines (e.g. typed after Shift+Enter) becomes text + a bullet list.
        forgetFocusedValue();
        onAction({ kind: "to-list", path, text: value });
        return;
      }
      if (value === "") {
        // Don't save an empty edit; put back what was there before.
        if (focusHtml.current !== null) target.innerHTML = focusHtml.current;
      } else if (value !== focusValue.current) {
        // Call onEdit synchronously (a click on Copy HTML/Undo/Export right after typing must
        // see this edit, and those read savedRef/state that onEdit's caller updates). Mark this
        // as a self-originated change first, so the layout effect above skips rebuilding the
        // DOM for it - see the comment on `skipRebuild` for why and how it's cleared.
        skipRebuild.current = true;
        if (skipExpiry.current !== null) clearTimeout(skipExpiry.current);
        skipExpiry.current = null;
        if (onEdit(path, value)) {
          skipExpiry.current = setTimeout(() => {
            skipExpiry.current = null;
            skipRebuild.current = false;
          }, 0);
        } else {
          // Rejected: nothing will re-render for it, so drop the flag now and put back what
          // was there before, so the DOM doesn't show text that isn't in the page.
          skipRebuild.current = false;
          if (focusHtml.current !== null) target.innerHTML = focusHtml.current;
        }
      }
    }
    focusValue.current = null;
    focusHtml.current = null;
  }

  /** The field is about to be replaced by a structural change that already carries its text,
   *  so the blur that follows mustn't save it again. */
  function forgetFocusedValue() {
    focusValue.current = null;
    focusHtml.current = null;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!editable) return;
    const field = (e.target as HTMLElement).closest<HTMLElement>("[data-edit]");
    const path = field?.getAttribute("data-edit");
    if (!field || !path) return;
    const enter = field.dataset.enter;
    if (e.key === "Enter") {
      // Inside a bullet list within a cell or callout, the browser's own Enter adds the next
      // bullet (or ends the list on an empty one).
      const li = (e.target as HTMLElement).closest("li");
      if (li && field.contains(li) && field.dataset.bullets) return;
      e.preventDefault();
      if (enter === "none") return;
      if (enter === "split" && !e.shiftKey && onAction) {
        const { before, after } = splitAtCaret(field);
        forgetFocusedValue();
        onAction({ kind: "split", path, before, after });
        return;
      }
      insertLineBreak(field);
      return;
    }
    if (e.key === "Backspace" && enter === "split" && onAction && htmlToMarkdown(field) === "") {
      e.preventDefault();
      forgetFocusedValue();
      onAction({ kind: "remove-empty", path });
    }
  }

  // "- " (or "* ", "• ") typed at the start of a line becomes a bullet: in a paragraph the
  // paragraph is split into text + a bullet list; in a cell or callout a list is made in place.
  function handleInput(e: FormEvent<HTMLDivElement>) {
    if (!editable) return;
    const field = (e.target as HTMLElement).closest<HTMLElement>("[data-edit]");
    const path = field?.getAttribute("data-edit");
    if (!field || !path) return;
    const marker = typedBulletMarker(field);
    if (field.dataset.autolist && onAction) {
      if (marker) {
        const before = markdownOfRange(field, null, marker.node);
        const after = markdownOfRange(field, { node: marker.node, offset: marker.offset }, null);
        forgetFocusedValue();
        onAction({ kind: "to-list", path, text: `${before ? `${before}\n` : ""}- ${after}`, caretLine: before ? before.split("\n").length : 0 });
      } else if (BULLET_LINE.test(field.textContent ?? "")) {
        forgetFocusedValue();
        onAction({ kind: "to-list", path, text: htmlToMarkdown(field), caretLine: 0 });
      }
    } else if (marker && field.dataset.bullets) {
      makeBulletInPlace(marker.node, marker.offset);
    }
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
      onInput={handleInput}
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    />
  );
}
