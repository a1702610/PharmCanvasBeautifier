import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { EmbedInfo, ImageInfo } from "../types/api";
import type { Page, Tab } from "../types/page";

export interface SavedPage {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  page: Page;
  sourceText: string;
  images: ImageInfo[];
  embeds: EmbedInfo[];
  history: Record<string, Tab[]>;
}

export interface PageSummary {
  id: string;
  title: string;
  updatedAt: number;
  tabCount: number;
}

interface Schema extends DBSchema {
  pages: { key: string; value: SavedPage };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db(): Promise<IDBPDatabase<Schema>> {
  dbPromise ??= openDB<Schema>("pharm-canvas", 1, {
    upgrade(database) {
      database.createObjectStore("pages", { keyPath: "id" });
    },
  });
  return dbPromise;
}

export function newSavedPage(args: { page: Page; sourceText: string; images: ImageInfo[]; embeds: EmbedInfo[] }): SavedPage {
  const now = Date.now();
  return { id: crypto.randomUUID(), title: args.page.title, createdAt: now, updatedAt: now, history: {}, ...args };
}

export async function savePage(p: SavedPage): Promise<SavedPage> {
  const next = { ...p, updatedAt: Date.now() };
  await (await db()).put("pages", next);
  return next;
}

export async function getPage(id: string): Promise<SavedPage | undefined> {
  return (await db()).get("pages", id);
}

export async function listPages(): Promise<PageSummary[]> {
  const all = await (await db()).getAll("pages");
  return all
    .map((p) => ({ id: p.id, title: p.title, updatedAt: p.updatedAt, tabCount: p.page.tabs.length }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deletePage(id: string): Promise<void> {
  await (await db()).delete("pages", id);
}

export async function renamePage(id: string, title: string): Promise<void> {
  const p = await getPage(id);
  if (!p) return;
  await savePage({ ...p, title, page: { ...p.page, title } });
}

export async function duplicatePage(id: string): Promise<SavedPage | undefined> {
  const p = await getPage(id);
  if (!p) return undefined;
  const title = `${p.title} (copy)`;
  const copy: SavedPage = { ...structuredClone(p), id: crypto.randomUUID(), title, createdAt: Date.now() };
  copy.page.title = title;
  return savePage(copy);
}
