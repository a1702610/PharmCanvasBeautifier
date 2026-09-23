import type { Block, EvidenceChild, FigureBlock } from "../types/page";
import type { ImageInfo } from "../types/api";
import { escapeAttr, escapeText, renderInline, splitParagraphs } from "./inline";

export interface RenderContext {
  images: Record<string, ImageInfo>;
  embeds: Record<string, string>;
}

const NAVY = "#1e3a5f";
const TABLE = "border-collapse: collapse; width: 100%; margin: 16px 0;";
const TD = "padding: 10px 12px; vertical-align: top; border: 1px solid #cbd5e1;";
const ZEBRA_ROW = '<tr style="background-color: #f1f5f9;">';
const CITE_SPAN = "font-size: 8pt; color: #64748b;";
const EVIDENCE_BOX = "background-color: #eef2ff; padding: 16px 18px; margin: 16px 0px; border-radius: 6px; border: 1px solid #c7d2fe;";
const PLACEHOLDER = "text-align: center; border: 2px dashed #94a3b8; padding: 24px; color: #64748b;";

const callout = (border: string, bg: string) =>
  `border-left: 4px solid ${border}; background-color: ${bg}; padding: 14px 18px; margin: 16px 0; border-radius: 0 6px 6px 0;`;

export function indent(lines: string[], level = 1): string[] {
  const pad = "    ".repeat(level);
  return lines.map((line) => pad + line);
}

function pct(n: number): string {
  return `${Number(n.toFixed(2))}%`;
}

function th(text: string, bg: string, width?: number): string {
  const w = width === undefined ? "" : ` width: ${pct(width)};`;
  return `<th style="background-color: ${bg}; color: #ffffff; padding: 10px 12px; text-align: left;${w} border: 1px solid ${bg};">${renderInline(text)}</th>`;
}

function td(content: string, bold = false): string[] {
  const paras = splitParagraphs(content);
  if (paras.length <= 1) {
    const inner = renderInline(paras[0] ?? "");
    return [`<td style="${TD}">${bold ? `<strong>${inner}</strong>` : inner}</td>`];
  }
  return [`<td style="${TD}">`, ...indent(paras.map((p) => `<p>${renderInline(p)}</p>`)), "</td>"];
}

function columnWidths(count: number, given?: number[]): (number | undefined)[] {
  if (given && given.length === count) return given;
  if (count === 2) return [26, undefined];
  return Array.from({ length: count }, () => 100 / count);
}

const stripBold = (s: string) => s.replace(/^\*\*([\s\S]*)\*\*$/, "$1");

function tableLines(headerCells: string[], bodyRows: string[][], zebra: boolean): string[] {
  return [
    `<table style="${TABLE}">`,
    ...indent([
      "<thead>",
      ...indent(["<tr>", ...indent(headerCells), "</tr>"]),
      "</thead>",
      "<tbody>",
      ...indent(bodyRows.flatMap((cells, r) => [zebra && r % 2 === 1 ? ZEBRA_ROW : "<tr>", ...indent(cells), "</tr>"])),
      "</tbody>",
    ]),
    "</table>",
  ];
}

function listLines(items: string[], ordered: boolean, style?: string): string[] {
  const tag = ordered ? "ol" : "ul";
  return [`<${tag}${style ? ` style="${style}"` : ""}>`, ...indent(items.map((i) => `<li>${renderInline(i)}</li>`)), `</${tag}>`];
}

function citationLines(text: string): string[] {
  return [`<p style="text-align: center;"><span style="${CITE_SPAN}">${renderInline(text)}</span></p>`];
}

export function withAlt(tag: string, alt: string): string {
  const match = tag.match(/\salt="([^"]*)"/);
  const current = (match?.[1] ?? "").trim();
  const replaceable = current === "" || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(current);
  if (!replaceable) return tag;
  const attr = ` alt="${escapeAttr(alt)}"`;
  return match ? tag.replace(match[0], attr) : tag.replace(/^<img/i, `<img${attr}`);
}

export function figureLines(block: FigureBlock, ctx: RenderContext): string[] {
  const image = ctx.images[block.ref];
  const lines = image?.canvas_tag
    ? [`<p style="text-align: center;">${withAlt(image.canvas_tag, block.alt)}</p>`]
    : [
        `<p style="${PLACEHOLDER}">[INSERT IMAGE ${escapeText(block.ref)}: ${renderInline(block.alt)}${
          image?.location ? `, ${escapeText(image.location)}` : ""
        }]</p>`,
      ];
  if (block.caption) lines.push(...citationLines(block.caption));
  return lines;
}

function childLines(child: EvidenceChild, ctx: RenderContext): string[] {
  switch (child.type) {
    case "paragraph":
      return [`<p>${renderInline(child.text)}</p>`];
    case "list":
      return listLines(child.items, false, "margin: 0;");
    case "figure":
      return figureLines(child, ctx);
    case "citation":
      return citationLines(child.text);
    case "references":
      return [
        '<p style="margin-bottom: 4px;"><span style="text-decoration: underline;">References:</span></p>',
        ...child.items.map((i) => `<p style="margin: 4px 0;"><span style="${CITE_SPAN}">${renderInline(i)}</span></p>`),
      ];
  }
}

export function blockLines(block: Block, ctx: RenderContext): string[] {
  switch (block.type) {
    case "heading":
      return [`<h4 style="color: ${NAVY};">${renderInline(block.text)}</h4>`];
    case "paragraph":
      return [`<p>${renderInline(block.text)}</p>`];
    case "list":
      return listLines(block.items, block.ordered);
    case "table": {
      const widths = columnWidths(block.headers.length, block.col_widths);
      return tableLines(
        block.headers.map((h, i) => th(h, NAVY, widths[i])),
        block.rows.map((row) => row.flatMap((cell, c) => (c === 0 ? td(stripBold(cell), true) : td(cell)))),
        true,
      );
    }
    case "contrast_table":
      return tableLines(
        [th(block.left_header, "#166534", 50), th(block.right_header, "#b91c1c", 50)],
        block.rows.map((row) => row.flatMap((cell) => td(cell))),
        false,
      );
    case "clinical":
      return [`<div style="${callout("#0d9488", "#f0fdfa")}"><strong style="color: #0f766e;">Why this matters clinically</strong><br />${renderInline(block.body)}</div>`];
    case "caution": {
      const open = `<div style="${callout("#f59e0b", "#fffbeb")}"><strong style="color: #b45309;">${renderInline(block.title)}</strong>`;
      if (!block.items?.length) return [`${open}<br />${renderInline(block.body ?? "")}</div>`];
      const head = block.body ? `${open}<br />${renderInline(block.body)}` : open;
      return [head, ...indent(listLines(block.items, false, "margin: 8px 0 0 0;")), "</div>"];
    }
    case "evidence":
      return [
        `<div style="${EVIDENCE_BOX}">`,
        ...indent([
          `<p style="margin-top: 0;"><strong style="color: #3730a3;">Evidence: ${renderInline(block.title.replace(/^evidence:\s*/i, ""))}</strong></p>`,
          ...block.children.flatMap((c) => childLines(c, ctx)),
        ]),
        "</div>",
      ];
    case "citation":
      return citationLines(block.text);
    case "link": {
      const lead = block.lead_in.trim();
      const prefix = lead ? `${renderInline(lead)}${lead.endsWith(":") ? " " : ": "}` : "";
      const anchor = `<a href="${escapeAttr(block.url)}" target="_blank" rel="noopener">${renderInline(block.link_text)}</a>`;
      return [`<div style="${callout("#2563eb", "#eff6ff")}">${prefix}${anchor}</div>`];
    }
    case "figure":
      return figureLines(block, ctx);
  }
}
