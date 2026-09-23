import type { ImageForAI, ImageInfo } from "../types/api";
import type { Note, Page, Tab } from "../types/page";
import type { SavedPage } from "./db";

export const HISTORY_LIMIT = 5;

export function replaceTab(saved: SavedPage, tabId: string, next: Tab, notes: Note[] = []): SavedPage {
  const current = saved.page.tabs.find((t) => t.id === tabId);
  if (!current) throw new Error(`Unknown tab ${tabId}`);
  const history = [...(saved.history[tabId] ?? []), current].slice(-HISTORY_LIMIT);
  return {
    ...saved,
    history: { ...saved.history, [tabId]: history },
    page: {
      ...saved.page,
      tabs: saved.page.tabs.map((t) => (t.id === tabId ? { ...next, id: tabId } : t)),
      notes: [...saved.page.notes, ...notes],
    },
  };
}

export function undoTab(saved: SavedPage, tabId: string): SavedPage {
  const history = saved.history[tabId] ?? [];
  if (!history.length) return saved;
  const previous = history[history.length - 1];
  return {
    ...saved,
    history: { ...saved.history, [tabId]: history.slice(0, -1) },
    page: { ...saved.page, tabs: saved.page.tabs.map((t) => (t.id === tabId ? previous : t)) },
  };
}

export function usedImageRefs(page: Page): string[] {
  const refs: string[] = [];
  const add = (ref: string) => {
    if (!refs.includes(ref)) refs.push(ref);
  };
  for (const tab of page.tabs) {
    for (const block of tab.blocks) {
      if (block.type === "figure") add(block.ref);
      if (block.type === "evidence") {
        for (const child of block.children) if (child.type === "figure") add(child.ref);
      }
    }
  }
  return refs;
}

export function imagesForAI(images: ImageInfo[]): ImageForAI[] {
  return images
    .filter((i) => i.thumb_b64)
    .map((i) => ({ ref: i.ref, location: i.location, thumb_b64: i.thumb_b64! }));
}
