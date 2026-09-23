import { api } from "./client";
import type { ExtractResult, GenerateRequest, RegenerateTabRequest, SourceInput } from "../types/api";
import type { Note, Page, Tab } from "../types/page";

export async function checkHealth(): Promise<void> {
  await api.get("/health", { timeout: 10_000 });
}

export async function extractSources(sources: SourceInput[]): Promise<ExtractResult> {
  const form = new FormData();
  let files = 0;
  let pastes = 0;
  for (const source of sources) {
    if (source.kind === "file") {
      form.append("files", source.file);
      form.append("order", `file:${files++}`);
    } else {
      form.append("canvas_html", source.html);
      form.append("order", `canvas:${pastes++}`);
    }
  }
  const { data } = await api.post<ExtractResult>("/extract", form);
  return data;
}

export async function generatePage(req: GenerateRequest): Promise<{ page: Page }> {
  const { data } = await api.post<{ page: Page }>("/generate", req);
  return data;
}

export async function regenerateTab(req: RegenerateTabRequest): Promise<{ tab: Tab; notes: Note[] }> {
  const { data } = await api.post<{ tab: Tab; notes: Note[] }>("/regenerate-tab", req);
  return data;
}
