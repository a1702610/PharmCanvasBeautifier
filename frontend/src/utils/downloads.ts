import type { ImageInfo } from "../types/api";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
const IMG_REF_RE = /^IMG-\d+$/;

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function zipEntries(images: ImageInfo[], refs: string[]): { name: string; base64: string }[] {
  const entries = [];
  for (const ref of refs) {
    if (!IMG_REF_RE.test(ref)) continue;
    const image = images.find((i) => i.ref === ref);
    if (!image?.data_b64) continue;
    entries.push({ name: `${ref}.${EXT[image.mime ?? ""] ?? "png"}`, base64: image.data_b64 });
  }
  return entries;
}

export async function buildImagesZip(images: ImageInfo[], refs: string[]): Promise<Blob | null> {
  const entries = zipEntries(images, refs);
  if (!entries.length) return null;
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const entry of entries) zip.file(entry.name, entry.base64, { base64: true });
  return zip.generateAsync({ type: "blob" });
}

export function safeFilename(s: string): string {
  return s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "page";
}
