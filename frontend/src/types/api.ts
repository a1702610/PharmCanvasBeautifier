import type { Tab } from "./page";

export type SourceKind = "docx" | "pptx" | "pdf" | "canvas";

export interface SourceStatus {
  name: string;
  kind?: SourceKind;
  ok: boolean;
  error?: string;
  warnings: string[];
}

export interface ImageInfo {
  ref: string;
  source: string;
  location: string;
  mime?: string;
  data_b64?: string;
  thumb_b64?: string;
  canvas_tag?: string;
}

export interface EmbedInfo {
  ref: string;
  html: string;
}

export interface ExtractResult {
  sources: SourceStatus[];
  text: string;
  images: ImageInfo[];
  embeds: EmbedInfo[];
  approx_tokens: number;
  token_limit: number;
}

export interface ImageForAI {
  ref: string;
  location: string;
  thumb_b64: string;
}

export interface GenerateRequest {
  text: string;
  images: ImageForAI[];
  instructions: string;
  include_revision: boolean;
  title: string;
}

export interface RegenerateTabRequest {
  text: string;
  images: ImageForAI[];
  outline: { intro: string[]; tab_titles: string[] };
  tab: Tab;
  instruction: string;
}

export type SourceInput =
  | { id: string; kind: "file"; file: File }
  | { id: string; kind: "canvas"; html: string; label: string };
