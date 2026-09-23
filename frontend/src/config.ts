export const MAX_SOURCES = 5;
export const MAX_FILE_MB = 25;
export const ACCEPTED_EXTENSIONS = [".docx", ".pptx", ".pdf"];
export const MAX_PASTE_BYTES = 1_000_000;

export function checkFile(file: File, currentCount: number): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return `${file.name}: only Word (.docx), PowerPoint (.pptx) and PDF files are supported.`;
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return `${file.name} is larger than ${MAX_FILE_MB} MB.`;
  }
  if (currentCount >= MAX_SOURCES) {
    return `You can add up to ${MAX_SOURCES} sources per page.`;
  }
  return null;
}

export function checkPaste(html: string): string | null {
  if (new TextEncoder().encode(html).length > MAX_PASTE_BYTES) {
    return "That pasted page is too large (over 1 MB). Remove embedded images or paste it in parts.";
  }
  return null;
}
