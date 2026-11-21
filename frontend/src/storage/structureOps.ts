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
 *  the way is shallow-copied, the rest is shared. Throws if the path doesn't exist. */
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
  if (node && typeof node === "object" && head in node) {
    return { ...(node as Record<string, Json>), [head]: updateAt((node as Record<string, Json>)[head], rest, fn) };
  }
  throw new Error(`Invalid path segment ${head}`);
}

function updateList(page: Page, path: string, fn: (list: Json[]) => Json[]): Page {
  return updateAt(page, path.split("."), (value) => {
    if (!Array.isArray(value)) throw new Error(`${path} is not a list`);
    return fn(value);
  }) as Page;
}

/** Inserts `item` (a block, or a panel when `listPath` ends in ".panels") at `index`. */
export function insertBlock(page: Page, listPath: string, index: number, item: Block | Panel): Page {
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
    const panels = segs.slice(0, -1).reduce<Json>((node, seg) => (node as Record<string, Json> | undefined)?.[seg], page);
    if (Array.isArray(panels) && panels.length === 1) return removeItem(page, panelMatch[1]);
  }
  return updateList(page, listPath, (list) => {
    if (!Number.isInteger(index) || index < 0 || index >= list.length) throw new Error(`Invalid path ${path}`);
    return list.filter((_, i) => i !== index);
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
