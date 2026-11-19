import { db } from "./db";

export interface Course {
  id: string; code: string; name: string; level: string; aims: string; outcomes: string; notes: string;
  outline: string; outlineSource?: string; updatedAt: number;
}

const FORMAT = "pharm-canvas-course";
const INVALID = "This file isn't a course profile.";
export const COURSE_CONTEXT_LIMIT = 12000;
export const OUTLINE_LIMIT = 50000;
const FIELDS = ["code", "name", "level", "aims", "outcomes", "notes", "outline"] as const;

export function newCourse(partial: Partial<Course> = {}): Course {
  return { id: crypto.randomUUID(), code: "", name: "", level: "", aims: "", outcomes: "", notes: "", outline: "", updatedAt: Date.now(), ...partial };
}

export async function saveCourse(c: Course): Promise<Course> {
  const next = { ...c, outline: c.outline.slice(0, OUTLINE_LIMIT), updatedAt: Date.now() };
  await (await db()).put("courses", next);
  return next;
}
export async function getCourse(id: string) { return (await db()).get("courses", id); }
export async function deleteCourse(id: string) { await (await db()).delete("courses", id); }
export async function listCourses(): Promise<Course[]> {
  const all = await (await db()).getAll("courses");
  return all.sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));
}

export function buildCourseContext(c: Course | undefined): string {
  if (!c) return "";
  const head = [
    c.code || c.name ? `Course: ${[c.code, c.name].filter(Boolean).join(" — ")}` : "",
    c.level ? `Year level: ${c.level}` : "",
    c.aims ? `Course aims:\n${c.aims}` : "",
    c.outcomes ? `Learning outcomes:\n${c.outcomes}` : "",
    c.notes ? `Notes on this course/topic:\n${c.notes}` : "",
  ].filter(Boolean).join("\n");
  if (!c.outline) return head.slice(0, COURSE_CONTEXT_LIMIT);
  const prefix = `${head}${head ? "\n" : ""}Course outline (extract):\n`;
  return (prefix + c.outline).slice(0, COURSE_CONTEXT_LIMIT);
}

export function cleanOutlineText(text: string): string {
  return text
    .split("\n").filter((l) => !/^=== SOURCE \d+: .* ===$/.test(l.trim())).join("\n")
    .replace(/\s*\[(IMG|EMBED)-\d+[^\]]*\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, OUTLINE_LIMIT);
}

export function exportCourseJson(c: Course): string {
  return JSON.stringify({ format: FORMAT, version: 1, course: c });
}

export function parseImportedCourse(json: string): Course {
  let data: { format?: string; version?: number; course?: Record<string, unknown> };
  try { data = JSON.parse(json); } catch { throw new Error(INVALID); }
  if (data?.format !== FORMAT || data.version !== 1 || !data.course || typeof data.course !== "object") throw new Error(INVALID);
  const out = newCourse();
  for (const f of FIELDS) {
    const v = data.course[f];
    if (v !== undefined && typeof v !== "string") throw new Error(INVALID);
    if (typeof v === "string") out[f] = f === "outline" ? v.slice(0, OUTLINE_LIMIT) : v;
  }
  if (typeof data.course.outlineSource === "string") out.outlineSource = data.course.outlineSource;
  return out;
}
