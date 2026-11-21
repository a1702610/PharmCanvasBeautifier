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

/** A whole PDF page as a JPEG: sent to the AI so it can read tables and charts in slides.
 *  Used only for generation, never saved with the page. */
export interface PageImage {
  source_index: number;
  source: string;
  location: string;
  data_b64: string;
}

export interface ExtractResult {
  sources: SourceStatus[];
  text: string;
  images: ImageInfo[];
  embeds: EmbedInfo[];
  pages?: PageImage[];
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
  pages: PageImage[];
  instructions: string;
  include_revision: boolean;
  title: string;
  course_context: string;
}

export type SourceInput =
  | { id: string; kind: "file"; file: File }
  | { id: string; kind: "canvas"; html: string; label: string };
