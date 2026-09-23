import type { EmbedInfo, ImageInfo } from "../types/api";
import type { Note, NoteKind, Page, Tab } from "../types/page";
import type { SavedPage } from "./db";

const FORMAT = "pharm-canvas-page";
const VERSION = 1;
const INVALID = "This file isn't a saved page.";
const NOTE_KINDS: NoteKind[] = ["image", "flag", "citation", "unplaced"];
const IMG_REF_RE = /^IMG-\d+$/;
const EMBED_REF_RE = /^EMBED-\d+$/;

export function exportPageJson(p: SavedPage): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, page: p });
}

function fail(): never {
  throw new Error(INVALID);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === "string");
}

function isTab(v: unknown): v is Tab {
  if (!v || typeof v !== "object") return false;
  const t = v as Partial<Tab>;
  return typeof t.id === "string" && typeof t.title === "string" && Array.isArray(t.blocks);
}

function validatePage(v: unknown): Page {
  if (!v || typeof v !== "object") fail();
  const p = v as Partial<Page>;
  if (typeof p.title !== "string") fail();
  if (!isStringArray(p.intro)) fail();
  if (!Array.isArray(p.tabs) || !p.tabs.every(isTab)) fail();
  const notes: Note[] = Array.isArray(p.notes)
    ? p.notes.filter(
        (n): n is Note => !!n && typeof n === "object" && NOTE_KINDS.includes((n as Note).kind) && typeof (n as Note).text === "string",
      )
    : [];
  return { title: p.title, intro: p.intro, tabs: p.tabs, revision: p.revision ?? { include: false }, notes };
}

export function parseImportedPage(json: string): SavedPage {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    fail();
  }
  const record = data as { format?: string; version?: number; page?: Partial<SavedPage> };
  if (record?.format !== FORMAT || record.version !== VERSION || !record.page) {
    fail();
  }
  const saved = record.page;
  const page = validatePage(saved.page);
  const images: ImageInfo[] = Array.isArray(saved.images)
    ? saved.images.filter((i): i is ImageInfo => !!i && IMG_REF_RE.test((i as ImageInfo).ref))
    : [];
  const embeds: EmbedInfo[] = Array.isArray(saved.embeds)
    ? saved.embeds.filter((e): e is EmbedInfo => !!e && EMBED_REF_RE.test((e as EmbedInfo).ref))
    : [];
  const history = saved.history && typeof saved.history === "object" && !Array.isArray(saved.history) ? saved.history : {};
  const sourceText = typeof saved.sourceText === "string" ? saved.sourceText : "";
  const title = typeof saved.title === "string" ? saved.title : page.title;
  const now = Date.now();
  return { title, page, sourceText, images, embeds, history, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
}
