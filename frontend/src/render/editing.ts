import type { Page } from "../types/page";

const BLOCK_TAGS = new Set(["P", "DIV"]);

function collapseWhitespace(s: string): string {
  return s.replace(/[ \t\n\r]+/g, " ").trim();
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
 *   - multiple top-level <p>/<div> blocks (a multi-paragraph table cell) -> joined by "\n\n"
 *   - any other tag is dropped, its text content kept
 *   - whitespace is collapsed and the result trimmed
 */
export function htmlToMarkdown(el: Element): string {
  const blockChildren = Array.from(el.children).filter((c) => BLOCK_TAGS.has(c.tagName));
  if (blockChildren.length > 0) {
    return blockChildren
      .map((p) => collapseWhitespace(childrenInline(p)))
      .filter((s) => s.length > 0)
      .join("\n\n");
  }
  return collapseWhitespace(childrenInline(el));
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
