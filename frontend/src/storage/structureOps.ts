import { BULLET_LINE } from "../render/inline";
import type { AccordionBlock, Block, Page, Tab } from "../types/page";

type BlockType = Block["type"];
type Panel = AccordionBlock["panels"][number];

/** Section types a lecturer can add in the editor, in menu order. Legacy (takeaways),
 *  citation and link blocks aren't offered: links need a URL, which can't be typed inline. */
const CHOICES: { type: BlockType; label: string }[] = [
  { type: "heading", label: "Heading" },
  { type: "paragraph", label: "Paragraph" },
  { type: "list", label: "Bullet list" },
  { type: "table", label: "Table" },
  { type: "contrast_table", label: "Comparison table" },
  { type: "key_point", label: "Key point" },
  { type: "clinical", label: "Why this matters clinically" },
  { type: "self_check", label: "Check your understanding" },
  { type: "caution", label: "Caution" },
  { type: "critical", label: "Critical safety warning" },
  { type: "tip", label: "Pharmacist tip" },
  { type: "counselling", label: "Counselling points" },
  { type: "evidence", label: "Evidence" },
  { type: "flow", label: "Flow diagram" },
  { type: "formula", label: "Formula" },
  { type: "figure", label: "Image placeholder" },
  { type: "accordion", label: "Collapsible section" },
];

/** Menu choices; inside an accordion panel another accordion isn't allowed (one level only). */
export function blockChoices(insidePanel: boolean): { type: BlockType; label: string }[] {
  return insidePanel ? CHOICES.filter((c) => c.type !== "accordion") : CHOICES;
}

const PARAGRAPH = "New paragraph. Click to edit.";

/** A new block of `type` with placeholder text for the lecturer to type over. */
export function newBlock(type: BlockType): Block {
  switch (type) {
    case "heading":
      return { type, text: "New heading" };
    case "paragraph":
      return { type, text: PARAGRAPH };
    case "list":
      return { type, ordered: false, items: ["First point", "Second point"] };
    case "table":
      return { type, headers: ["Heading", "Heading"], rows: [["Row label", "Cell"], ["Row label", "Cell"]] };
    case "contrast_table":
      return { type, left_header: "Concept A", right_header: "Concept B", rows: [["Point about A", "Point about B"]] };
    case "key_point":
      return { type, lead: "Key point.", text: "State the central idea of this section." };
    case "clinical":
      return { type, body: "Explain how this connects to what a pharmacist does." };
    case "self_check":
      return { type, questions: [{ question: "Question?", answer: "Answer." }] };
    case "caution":
      return { type, title: "Caution", body: "Add the practice point to watch for." };
    case "critical":
      return { type, body: "Describe the serious risk." };
    case "tip":
      return { type, body: "Add a practical tip." };
    case "counselling":
      return { type, items: ["What to tell the patient."] };
    case "evidence":
      return { type, title: "Study name", children: [{ type: "paragraph", text: "Summarise the study and its findings." }] };
    case "flow":
      return { type, steps: [{ label: "Step 1", style: "solid" }, { label: "Step 2", style: "outline" }, { label: "Step 3", style: "amber" }] };
    case "formula":
      return { type, expression: "A = B × C", note: "Define each term." };
    case "figure":
      return { type, ref: "", alt: "describe the image" };
    case "accordion":
      return { type, panels: [newPanel()] };
    case "citation":
      return { type, text: "Reference." };
    case "link":
      return { type, lead_in: "Read more", url: "", link_text: "link text" };
    case "takeaways":
      return { type, items: ["Takeaway."] };
  }
}

export function newPanel(): Panel {
  return { title: "More detail", blocks: [{ type: "paragraph", text: PARAGRAPH }] };
}

type Json = unknown;

/** Returns a copy of `node` with the value at `segs` replaced by `fn(value)`; every object on
 *  the way is shallow-copied, the rest is shared. Throws if the path doesn't exist, except that
 *  the final key may be missing on an object (fn then receives undefined). */
function updateAt(node: Json, segs: string[], fn: (value: Json) => Json): Json {
  if (segs.length === 0) return fn(node);
  const [head, ...rest] = segs;
  if (Array.isArray(node)) {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0 || index >= node.length) throw new Error(`Invalid path segment ${head}`);
    const copy = node.slice();
    copy[index] = updateAt(node[index], rest, fn);
    return copy;
  }
  if (node && typeof node === "object" && (head in node || rest.length === 0)) {
    return { ...(node as Record<string, Json>), [head]: updateAt((node as Record<string, Json>)[head], rest, fn) };
  }
  throw new Error(`Invalid path segment ${head}`);
}

function updateList(page: Page, path: string, fn: (list: Json[]) => Json[]): Page {
  return updateAt(page, path.split("."), (value) => {
    // A missing optional list (e.g. revision.points on an older page) starts empty.
    if (value === undefined) return fn([]);
    if (!Array.isArray(value)) throw new Error(`${path} is not a list`);
    return fn(value);
  }) as Page;
}

/** Inserts `item` at `index` of the list at `listPath`: a block, a panel (".panels"), or a
 *  point/row/question/step from newListItem. */
export function insertBlock(page: Page, listPath: string, index: number, item: unknown): Page {
  return updateList(page, listPath, (list) => {
    if (index < 0 || index > list.length) throw new Error(`Invalid index ${index}`);
    return [...list.slice(0, index), item, ...list.slice(index)];
  });
}

/** Removes the block or panel at `path` (ending in a list index). Deleting an accordion's
 *  last panel removes the whole accordion. */
export function removeItem(page: Page, path: string): Page {
  const segs = path.split(".");
  const index = Number(segs[segs.length - 1]);
  const listPath = segs.slice(0, -1).join(".");
  const panelMatch = path.match(/^(.*\.blocks\.\d+)\.panels\.\d+$/);
  if (panelMatch) {
    const panels = getAt(page, listPath);
    if (Array.isArray(panels) && panels.length === 1) return removeItem(page, panelMatch[1]);
  }
  return updateList(page, listPath, (list) => {
    if (!Number.isInteger(index) || index < 0 || index >= list.length) throw new Error(`Invalid path ${path}`);
    return list.filter((_, i) => i !== index);
  });
}

function getAt(page: Page, path: string): Json {
  return path.split(".").reduce<Json>((node, seg) => (node as Record<string, Json> | undefined)?.[seg], page);
}

/** A new entry for the list at `listPath`: a bullet or revision point, a table row sized to the
 *  table, a self-check question or a flow step. */
export function newListItem(page: Page, listPath: string): unknown {
  const parentPath = listPath.split(".").slice(0, -1).join(".");
  const parent = getAt(page, parentPath) as Block | undefined;
  if (listPath === "revision.points" || listPath.endsWith(".items")) return "New point";
  if (listPath.endsWith(".questions")) return { question: "Question?", answer: "Answer." };
  if (listPath.endsWith(".steps")) return { label: "New step", style: "outline" };
  if (listPath.endsWith(".rows") && parent?.type === "contrast_table") return ["Point about A", "Point about B"];
  if (listPath.endsWith(".rows") && parent?.type === "table") {
    return parent.headers.map((_, i) => (i === 0 && parent.row_headers !== false ? "Row label" : "Cell"));
  }
  throw new Error(`Can't add an item to ${listPath}`);
}

type TableBlock = Extract<Block, { type: "table" }>;

function updateTable(page: Page, tablePath: string, change: (table: TableBlock) => TableBlock): Page {
  return updateAt(page, tablePath.split("."), (value) => {
    const block = value as Block | undefined;
    if (block?.type !== "table") throw new Error(`${tablePath} is not a table`);
    return change(block);
  }) as Page;
}

/** Adds a column at the end of a table. Fixed column widths no longer fit, so they're dropped. */
export function addColumn(page: Page, tablePath: string): Page {
  return updateTable(page, tablePath, ({ col_widths: _widths, ...table }) => ({
    ...table,
    headers: [...table.headers, "Heading"],
    rows: table.rows.map((row) => [...row, "Cell"]),
  }));
}

/** Removes column `col` from a table; a table always keeps at least one column. */
export function removeColumn(page: Page, tablePath: string, col: number): Page {
  return updateTable(page, tablePath, ({ col_widths: _widths, ...table }) => {
    if (table.headers.length <= 1 || col < 0 || col >= table.headers.length) throw new Error(`Can't remove column ${col}`);
    return {
      ...table,
      headers: table.headers.filter((_, i) => i !== col),
      rows: table.rows.map((row) => row.filter((_, i) => i !== col)),
    };
  });
}

function nextTabId(tabs: Tab[]): string {
  const used = new Set(tabs.map((t) => t.id));
  let n = tabs.length + 1;
  while (used.has(`t${n}`)) n++;
  return `t${n}`;
}

export function addTab(page: Page): Page {
  const tab: Tab = { id: nextTabId(page.tabs), title: "New tab", blocks: [] };
  return { ...page, tabs: [...page.tabs, tab] };
}

export function removeTab(page: Page, index: number): Page {
  return { ...page, tabs: page.tabs.filter((_, i) => i !== index) };
}

/** A blank page in the house style for building a page by hand: a title, one intro paragraph
 *  and one empty tab (the editor shows "+ Add" in it). Study materials and Revision check are added by the renderer. */
export function blankPage(): Page {
  return {
    title: "Untitled page",
    intro: ["Say what this page covers and why it matters. Click to edit."],
    tabs: [{ id: "t1", title: "New tab", blocks: [] }],
    revision: { include: false },
    notes: [],
  };
}

/** Where to put the caret after a typing change re-renders the page. */
export interface Focus {
  path: string;
  caret: "start" | "end";
}

const BLOCK_TEXT_RE = /^(.*\.blocks)\.(\d+)\.text$/;
const ITEM_RE = /^(.*)\.(\d+)$/;

function setAt(page: Page, path: string, value: unknown): Page {
  return updateAt(page, path.split("."), () => value) as Page;
}

/** Where the caret goes to continue typing at the end of `block` (at `blockPath`), if it has text. */
function endOf(block: Block | undefined, blockPath: string): Focus | undefined {
  if (block?.type === "paragraph" || block?.type === "heading") return { path: `${blockPath}.text`, caret: "end" };
  if (block?.type === "list" && block.items.length) return { path: `${blockPath}.items.${block.items.length - 1}`, caret: "end" };
  return undefined;
}

/** Enter in an editable field at `path`, with the text before and after the caret:
 *  - the intro or a paragraph/heading: the text after the caret moves into a new paragraph below;
 *  - a bullet or revision point: the text after the caret becomes a new item below;
 *  - an empty last bullet: it's removed, and a list block is followed by a new paragraph. */
export function splitText(page: Page, path: string, before: string, after: string): { page: Page; focus?: Focus } {
  const intro = path.match(/^intro\.(\d+)$/);
  if (intro) {
    const i = Number(intro[1]);
    const next = insertBlock(setAt(page, path, before), "intro", i + 1, after);
    return { page: next, focus: { path: `intro.${i + 1}`, caret: "start" } };
  }

  const blockText = path.match(BLOCK_TEXT_RE);
  if (blockText) {
    const [, list, index] = blockText;
    const block = getAt(page, `${list}.${index}`) as Block | undefined;
    if (block?.type !== "paragraph" && block?.type !== "heading") throw new Error(`Can't split ${path}`);
    const i = Number(index);
    const next = insertBlock(setAt(page, path, before), list, i + 1, { type: "paragraph", text: after });
    return { page: next, focus: { path: `${list}.${i + 1}.text`, caret: "start" } };
  }

  const item = path.match(ITEM_RE);
  const items = item ? getAt(page, item[1]) : undefined;
  if (!item || !Array.isArray(items) || !(item[1].endsWith(".items") || item[1] === "revision.points")) throw new Error(`Can't split ${path}`);
  const [, listPath, index] = item;
  const i = Number(index);
  if (before === "" && after === "" && i === items.length - 1) {
    const listBlock = listPath.match(/^(.*\.blocks)\.(\d+)\.items$/);
    const owner = listBlock ? (getAt(page, `${listBlock[1]}.${listBlock[2]}`) as Block | undefined) : undefined;
    const removed = removeEmptyItem(page, listPath, i);
    if (listBlock && owner?.type === "list") {
      // The list may have just disappeared (it only held this empty bullet).
      const stillThere = items.length > 1;
      const at = Number(listBlock[2]) + (stillThere ? 1 : 0);
      return { page: insertBlock(removed, listBlock[1], at, { type: "paragraph", text: "" }), focus: { path: `${listBlock[1]}.${at}.text`, caret: "start" } };
    }
    return { page: removed };
  }
  const next = insertBlock(setAt(page, path, before), listPath, i + 1, after);
  return { page: next, focus: { path: `${listPath}.${i + 1}`, caret: "start" } };
}

/** Removes item `i` from the list at `listPath`; a bullet list block left empty is removed too. */
function removeEmptyItem(page: Page, listPath: string, i: number): Page {
  const listBlock = listPath.match(/^(.*\.blocks\.\d+)\.items$/);
  const items = getAt(page, listPath);
  const owner = listBlock ? (getAt(page, listBlock[1]) as Block | undefined) : undefined;
  if (owner?.type === "list" && Array.isArray(items) && items.length === 1) return removeItem(page, listBlock![1]);
  return removeItem(page, `${listPath}.${i}`);
}

/** Turns the paragraph at `path` into blocks from `text`, its lines: runs of "- " / "* " lines
 *  become bullet lists, other runs stay paragraphs. A list that comes first joins a bullet list
 *  directly above the paragraph. With `caretLine` (the line the caret is on), the caret goes to
 *  the start of that line's new paragraph or bullet. */
export function paragraphLinesToBlocks(page: Page, path: string, text: string, caretLine?: number): { page: Page; focus?: Focus } {
  const match = path.match(BLOCK_TEXT_RE);
  const block = match ? (getAt(page, `${match[1]}.${match[2]}`) as Block | undefined) : undefined;
  if (!match || block?.type !== "paragraph") throw new Error(`Can't make a list from ${path}`);
  const [, list, index] = match;
  const i = Number(index);

  // Group the lines, remembering where each original line ends up.
  type Run = { bullets: boolean; lines: string[] };
  const runs: Run[] = [];
  const lineAt: { run: number; item: number }[] = [];
  for (const raw of text.split("\n")) {
    const bullet = BULLET_LINE.test(raw);
    const value = bullet ? raw.replace(BULLET_LINE, "") : raw;
    let last = runs[runs.length - 1];
    if (!last || last.bullets !== bullet) runs.push((last = { bullets: bullet, lines: [] }));
    last.lines.push(value);
    lineAt.push({ run: runs.length - 1, item: last.lines.length - 1 });
  }
  const kept = runs.filter((run) => run.bullets || run.lines.some((line) => line.trim()));
  const blocks: Block[] = kept.map((run) =>
    run.bullets
      ? { type: "list", ordered: false, items: run.lines }
      : { type: "paragraph", text: run.lines.filter((line) => line.trim()).join("\n") },
  );

  const prev = i > 0 ? (getAt(page, `${list}.${i - 1}`) as Block | undefined) : undefined;
  const joinPrev = prev?.type === "list" && !prev.ordered && blocks[0]?.type === "list";
  let next = removeItem(page, `${list}.${i}`);
  let at = i;
  if (joinPrev) {
    for (const item of (blocks[0] as { items: string[] }).items) {
      next = insertBlock(next, `${list}.${i - 1}.items`, (getAt(next, `${list}.${i - 1}.items`) as string[]).length, item);
    }
  }
  blocks.slice(joinPrev ? 1 : 0).forEach((b) => {
    next = insertBlock(next, list, at++, b);
  });

  if (caretLine === undefined || !lineAt[caretLine]) return { page: next };
  const where = lineAt[caretLine];
  const keptIndex = kept.indexOf(runs[where.run]);
  if (keptIndex < 0) return { page: next };
  if (!runs[where.run].bullets) return { page: next, focus: { path: `${list}.${i + keptIndex - (joinPrev ? 1 : 0)}.text`, caret: "start" } };
  if (joinPrev && keptIndex === 0) {
    const prevCount = prev.items.length;
    return { page: next, focus: { path: `${list}.${i - 1}.items.${prevCount + where.item}`, caret: "start" } };
  }
  return { page: next, focus: { path: `${list}.${i + keptIndex - (joinPrev ? 1 : 0)}.items.${where.item}`, caret: "start" } };
}

/** Backspace in an empty field at `path`: removes the empty bullet, revision point, paragraph,
 *  heading or (when there's more than one) intro paragraph, and moves the caret to the end of
 *  what came before. */
export function removeEmpty(page: Page, path: string): { page: Page; focus?: Focus } {
  const intro = path.match(/^intro\.(\d+)$/);
  if (intro) {
    const i = Number(intro[1]);
    if (page.intro.length <= 1) return { page };
    return { page: removeItem(page, path), focus: i > 0 ? { path: `intro.${i - 1}`, caret: "end" } : undefined };
  }
  const blockText = path.match(BLOCK_TEXT_RE);
  if (blockText) {
    const [, list, index] = blockText;
    const i = Number(index);
    const prev = i > 0 ? (getAt(page, `${list}.${i - 1}`) as Block | undefined) : undefined;
    return { page: removeItem(page, `${list}.${i}`), focus: endOf(prev, `${list}.${i - 1}`) };
  }
  const item = path.match(ITEM_RE);
  if (!item) throw new Error(`Can't remove ${path}`);
  const [, listPath, index] = item;
  const i = Number(index);
  return { page: removeEmptyItem(page, listPath, i), focus: i > 0 ? { path: `${listPath}.${i - 1}`, caret: "end" } : undefined };
}

/** Moves tab `index` one place up (dir -1) or down (dir 1); a move past either end does nothing. */
export function moveTab(page: Page, index: number, dir: -1 | 1): Page {
  const to = index + dir;
  if (index < 0 || index >= page.tabs.length || to < 0 || to >= page.tabs.length) return page;
  const tabs = page.tabs.slice();
  [tabs[index], tabs[to]] = [tabs[to], tabs[index]];
  return { ...page, tabs };
}
