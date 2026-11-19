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

const strOnly = (o: Record<string, unknown>, keys: string[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const k of keys) if (typeof o[k] === "string") out[k] = o[k] as string;
  return out;
};
const isRec = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function normaliseStudy(st: unknown): Page["study"] {
  if (!isRec(st) || !Array.isArray(st.recordings) || !Array.isArray(st.resources)) return undefined;
  const handout = isRec(st.handout) ? strOnly(st.handout, ["label", "url"]) : undefined;
  return {
    ...(handout && { handout }),
    recordings: st.recordings.filter(isRec).map((r) => strOnly(r, ["part", "title", "recording_url", "transcript_url"])),
    resources: st.resources.filter((r): r is Record<string, unknown> => isRec(r) && typeof r.title === "string").map((r) => strOnly(r, ["title", "url"]) as { title: string; url?: string }),
  };
}

function normaliseRevision(rev: unknown): Page["revision"] {
  if (!isRec(rev)) return { include: false };
  const r = { ...rev } as Page["revision"] & Record<string, unknown>;
  if (!isStringArray(r.points)) delete r.points;
  return r;
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
  const raw = p as Record<string, unknown>;
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
  const fig = raw.intro_figure;
  const intro_figure = isObj(fig) && typeof fig.ref === "string" && typeof fig.alt === "string" ? (fig as unknown as Page["intro_figure"]) : undefined;
  const acts = raw.study_activities;
  const study_activities =
    Array.isArray(acts) && acts.every((a) => isObj(a) && typeof a.task === "string" && typeof a.purpose === "string")
      ? (acts as Page["study_activities"])
      : undefined;
  const st = raw.study;
  const study = normaliseStudy(st);
  return {
    title: p.title,
    intro: p.intro,
    tabs: p.tabs,
    revision: normaliseRevision(p.revision),
    notes,
    ...(intro_figure && { intro_figure }),
    ...(study_activities && { study_activities }),
    ...(study && { study }),
  };
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
