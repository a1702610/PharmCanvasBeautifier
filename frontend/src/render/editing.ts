import type { Page } from "../types/page";

const BLOCK_TAGS = new Set(["P", "DIV"]);

/** Converts a stray U+00A0 to a normal space, except between a digit and a following
 *  letter/unit (e.g. "4 mg"), where it's meaningful and kept as-is. */
function normalizeNbsp(s: string): string {
  return s.replace(/ /g, (_match, offset: number, str: string) => {
    const before = str[offset - 1];
    const after = str[offset + 1];
    return before && /\d/.test(before) && after && /[A-Za-z]/.test(after) ? " " : " ";
  });
}

function collapseWhitespace(s: string): string {
  return normalizeNbsp(s)
    .replace(/[ \t\n\r]+/g, " ")
    .trim();
}

function childrenInline(el: Element): string {
  return Array.from(el.childNodes).map(inlineToMarkdown).join("");
}

function inlineToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as Element;
  switch (el.tagName) {
    case "BR":
      return " ";
    case "STRONG":
    case "B":
      return `**${childrenInline(el)}**`;
    case "EM":
    case "I":
      return `*${childrenInline(el)}*`;
    case "A": {
      const href = el.getAttribute("href") ?? "";
      const text = childrenInline(el);
      return /^https?:\/\//.test(href) ? `[${text}](${href})` : text;
    }
    default:
      // Stray/unsupported tags are dropped; their text content is kept.
      return childrenInline(el);
  }
}

/**
 * Converts a [data-edit] element's current HTML back to the inline markdown subset
 * used by renderInline (**bold**, *italic*, [text](https://url)), per the "Inline text
 * editing" section of callouts-spec.md:
 *   - <strong>/<b> -> **...**, <em>/<i> -> *...*, <a href="https://..."> -> [text](url)
 *   - <br> -> a single space
 *   - top-level content is split into paragraphs at each <p>/<div> child (a multi-paragraph
 *     table cell, or lines a browser wrapped in <div>s on Enter/paste), joined by "\n\n";
 *     runs of plain inline content between/around those block children form their own
 *     paragraph too, so nothing typed before/after a block child is lost
 *   - any other tag is dropped, its text content kept
 *   - a stray U+00A0 becomes a normal space (except between a digit and a unit)
 *   - whitespace is collapsed and each paragraph trimmed; empty paragraphs are dropped
 */
export function htmlToMarkdown(el: Element): string {
  const paragraphs: string[] = [];
  let pending: Node[] = [];

  const flushPending = () => {
    if (pending.length === 0) return;
    const text = collapseWhitespace(pending.map(inlineToMarkdown).join(""));
    if (text) paragraphs.push(text);
    pending = [];
  };

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).tagName)) {
      flushPending();
      const text = collapseWhitespace(childrenInline(node as Element));
      if (text) paragraphs.push(text);
    } else {
      pending.push(node);
    }
  }
  flushPending();

  return paragraphs.join("\n\n");
}

function setRec(obj: unknown, segments: string[], value: string): unknown {
  const [key, ...rest] = segments;
  if (Array.isArray(obj)) {
    const idx = Number(key);
    if (!/^\d+$/.test(key) || idx < 0 || idx >= obj.length) {
      throw new Error(`Invalid path segment "${key}"`);
    }
    const copy = obj.slice();
    copy[idx] = rest.length ? setRec(obj[idx], rest, value) : value;
    return copy;
  }
  if (obj !== null && typeof obj === "object") {
    if (!(key in obj)) {
      throw new Error(`Invalid path segment "${key}"`);
    }
    const record = obj as Record<string, unknown>;
    const copy = { ...record };
    copy[key] = rest.length ? setRec(record[key], rest, value) : value;
    return copy;
  }
  throw new Error(`Invalid path segment "${key}"`);
}

/**
 * Immutably sets the string value at `path` (a dot path as emitted in data-edit, e.g.
 * "intro.0" or "tabs.1.blocks.3.questions.1.answer") within `page`, returning a new Page.
 * `page` itself, and any part of it not on the path, is left untouched. Throws if any
 * path segment doesn't resolve to an existing array index or object key.
 */
export function setAtPath(page: Page, path: string, value: string): Page {
  if (!path) throw new Error("Invalid path");
  return setRec(page, path.split("."), value) as Page;
}

/** Collapses hard line breaks in pasted/dropped plain text to a single space, since a
 *  [data-edit] element must stay a single logical field (Enter is blocked; see CanvasPreview). */
export function collapseNewlines(s: string): string {
  return s.replace(/\s*[\r\n]+\s*/g, " ");
}
