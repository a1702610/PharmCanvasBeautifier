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
  const tab: Tab = { id: nextTabId(page.tabs), title: "New tab", blocks: [{ type: "paragraph", text: PARAGRAPH }] };
  return { ...page, tabs: [...page.tabs, tab] };
}

export function removeTab(page: Page, index: number): Page {
  return { ...page, tabs: page.tabs.filter((_, i) => i !== index) };
}

/** A blank page in the house style for building a page by hand: a title, one intro paragraph
 *  and one tab to start from. Study materials and Revision check are added by the renderer. */
export function blankPage(): Page {
  return {
    title: "Untitled page",
    intro: ["Say what this page covers and why it matters. Click to edit."],
    tabs: [{ id: "t1", title: "New tab", blocks: [{ type: "paragraph", text: PARAGRAPH }] }],
    revision: { include: false },
    notes: [],
  };
}
