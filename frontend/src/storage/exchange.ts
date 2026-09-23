import type { SavedPage } from "./db";

const FORMAT = "pharm-canvas-page";
const VERSION = 1;
const INVALID = "This file isn't a saved page.";

export function exportPageJson(p: SavedPage): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, page: p });
}

export function parseImportedPage(json: string): SavedPage {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error(INVALID);
  }
  const record = data as { format?: string; version?: number; page?: SavedPage };
  if (record?.format !== FORMAT || record.version !== VERSION || !Array.isArray(record.page?.page?.tabs)) {
    throw new Error(INVALID);
  }
  const now = Date.now();
  return { ...record.page, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
}
