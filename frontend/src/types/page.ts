export type NoteKind = "image" | "flag" | "citation" | "unplaced";

export interface Note {
  kind: NoteKind;
  text: string;
}

export interface FigureBlock {
  type: "figure";
  ref: string;
  alt: string;
  caption?: string;
}

export type EvidenceChild =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | FigureBlock
  | { type: "citation"; text: string }
  | { type: "references"; items: string[] };

export interface QuestionBlock {
  question: string;
  answer: string;
}

export interface FlowStep {
  label: string;
  sub?: string;
  style: "solid" | "outline" | "amber";
}

export interface FlowBlock {
  type: "flow";
  steps: FlowStep[];
}

export type InnerBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; col_widths?: number[]; rows: string[][]; variant?: "primary" | "secondary"; row_headers?: boolean }
  | { type: "contrast_table"; left_header: string; right_header: string; rows: string[][] }
  | { type: "clinical"; body: string }
  | { type: "caution"; title: string; body?: string; items?: string[] }
  | { type: "evidence"; title: string; children: EvidenceChild[] }
  | { type: "citation"; text: string }
  | { type: "link"; lead_in: string; url: string; link_text: string }
  | FigureBlock
  | { type: "takeaways"; items: string[] }
  | { type: "self_check"; questions: QuestionBlock[] }
  | { type: "counselling"; title?: string; items: string[] }
  | { type: "tip"; body: string }
  | { type: "critical"; title?: string; body?: string; items?: string[] }
  | { type: "key_point"; lead?: string; text: string }
  | FlowBlock
  | { type: "formula"; expression: string; note?: string };

export interface AccordionBlock {
  type: "accordion";
  panels: { title: string; blocks: InnerBlock[] }[];
}

export type Block = InnerBlock | AccordionBlock;

export interface StudyMaterials {
  handout?: { label?: string; url?: string };
  recordings: { part?: string; title?: string; recording_url?: string; transcript_url?: string }[];
  resources: { title: string; url?: string }[];
}

export interface Tab {
  id: string;
  title: string;
  blocks: Block[];
}

export interface Page {
  title: string;
  intro: string[];
  tabs: Tab[];
  intro_figure?: FigureBlock;
  study_activities?: { task: string; purpose: string }[];
  study?: StudyMaterials;
  revision: { include: boolean; embed_ref?: string; points?: string[]; flow_title?: string; flow?: FlowBlock };
  notes: Note[];
}
