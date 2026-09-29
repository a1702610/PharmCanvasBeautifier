import type { Block, EvidenceChild, FigureBlock } from "../types/page";
import type { ImageInfo } from "../types/api";
import { escapeAttr, escapeText, renderInline, splitParagraphs } from "./inline";

export interface RenderContext {
  images: Record<string, ImageInfo>;
  embeds: Record<string, string>;
  /**
   * When true, blockLines/childLines/figureLines emit data-edit="PATH" attributes
   * (a dot path into the Page JSON) on user-editable text elements, for the inline
   * editing feature in CanvasPreview. Defaults to false/absent, in which case output
   * is byte-identical to the non-editable render (see editing.ts and preview.css).
   */
  editable?: boolean;
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

/** Renders a data-edit="PATH" attribute (with a leading space) when editable, else "". */
function editAttr(ctx: RenderContext, path: string | undefined): string {
  return ctx.editable && path ? ` data-edit="${escapeAttr(path)}"` : "";
}

/** Wraps rendered inline HTML in a <span data-edit="PATH"> when editable, for a field that
 *  shares its containing element with fixed (non-editable) text. No-op otherwise. */
function editSpan(ctx: RenderContext, path: string | undefined, inner: string): string {
  if (!ctx.editable || !path) return inner;
  return `<span data-edit="${escapeAttr(path)}">${inner}</span>`;
}

function pct(n: number): string {
  return `${Number(n.toFixed(2))}%`;
}

function th(text: string, bg: string, ctx: RenderContext, width?: number, path?: string): string {
  const w = width === undefined ? "" : ` width: ${pct(width)};`;
  return `<th${editAttr(ctx, path)} style="background-color: ${bg}; color: #ffffff; padding: 10px 12px; text-align: left;${w} border: 1px solid ${bg};">${renderInline(text)}</th>`;
}

function td(content: string, bold: boolean, ctx: RenderContext, path?: string): string[] {
  const paras = splitParagraphs(content);
  const attr = editAttr(ctx, path);
  if (paras.length <= 1) {
    const inner = renderInline(paras[0] ?? "");
    return [`<td${attr} style="${TD}">${bold ? `<strong>${inner}</strong>` : inner}</td>`];
  }
  return [`<td${attr} style="${TD}">`, ...indent(paras.map((p) => `<p>${renderInline(p)}</p>`)), "</td>"];
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

function listLines(items: string[], ordered: boolean, ctx: RenderContext, itemsPath?: string, style?: string): string[] {
  const tag = ordered ? "ol" : "ul";
  return [
    `<${tag}${style ? ` style="${style}"` : ""}>`,
    ...indent(items.map((i, idx) => `<li${editAttr(ctx, itemsPath && `${itemsPath}.${idx}`)}>${renderInline(i)}</li>`)),
    `</${tag}>`,
  ];
}

function citationLines(text: string, ctx: RenderContext, path?: string): string[] {
  return [`<p style="text-align: center;"><span style="${CITE_SPAN}"${editAttr(ctx, path)}>${renderInline(text)}</span></p>`];
}

export function withAlt(tag: string, alt: string): string {
  const match = tag.match(/\salt="([^"]*)"/);
  const current = (match?.[1] ?? "").trim();
  const replaceable = current === "" || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(current);
  if (!replaceable) return tag;
  const attr = ` alt="${escapeAttr(alt)}"`;
  return match ? tag.replace(match[0], attr) : tag.replace(/^<img/i, `<img${attr}`);
}

export function figureLines(block: FigureBlock, ctx: RenderContext, path?: string): string[] {
  const image = ctx.images[block.ref];
  const lines = image?.canvas_tag
    ? [`<p style="text-align: center;">${withAlt(image.canvas_tag, block.alt)}</p>`]
    : [
        `<p style="${PLACEHOLDER}">[INSERT IMAGE ${escapeText(block.ref)}: ${renderInline(block.alt)}${
          image?.location ? `, ${escapeText(image.location)}` : ""
        }]</p>`,
      ];
  if (block.caption) lines.push(...citationLines(block.caption, ctx, path && `${path}.caption`));
  return lines;
}

function childLines(child: EvidenceChild, ctx: RenderContext, path?: string): string[] {
  switch (child.type) {
    case "paragraph":
      return [`<p${editAttr(ctx, path && `${path}.text`)}>${renderInline(child.text)}</p>`];
    case "list":
      return listLines(child.items, false, ctx, path && `${path}.items`, "margin: 0;");
    case "figure":
      return figureLines(child, ctx, path);
    case "citation":
      return citationLines(child.text, ctx, path && `${path}.text`);
    case "references":
      return [
        '<p style="margin-bottom: 4px;"><span style="text-decoration: underline;">References:</span></p>',
        ...child.items.map(
          (i, idx) =>
            `<p style="margin: 4px 0;"><span style="${CITE_SPAN}"${editAttr(ctx, path && `${path}.items.${idx}`)}>${renderInline(i)}</span></p>`,
        ),
      ];
  }
}

export function blockLines(block: Block, ctx: RenderContext, path?: string): string[] {
  switch (block.type) {
    case "heading":
      return [`<h4${editAttr(ctx, path && `${path}.text`)} style="color: ${NAVY};">${renderInline(block.text)}</h4>`];
    case "paragraph":
      return [`<p${editAttr(ctx, path && `${path}.text`)}>${renderInline(block.text)}</p>`];
    case "list":
      return listLines(block.items, block.ordered, ctx, path && `${path}.items`);
    case "table": {
      const widths = columnWidths(block.headers.length, block.col_widths);
      return tableLines(
        block.headers.map((h, i) => th(h, NAVY, ctx, widths[i], path && `${path}.headers.${i}`)),
        block.rows.map((row, r) =>
          row.flatMap((cell, c) =>
            c === 0 ? td(stripBold(cell), true, ctx, path && `${path}.rows.${r}.${c}`) : td(cell, false, ctx, path && `${path}.rows.${r}.${c}`),
          ),
        ),
        true,
      );
    }
    case "contrast_table":
      return tableLines(
        [
          th(block.left_header, "#166534", ctx, 50, path && `${path}.left_header`),
          th(block.right_header, "#b91c1c", ctx, 50, path && `${path}.right_header`),
        ],
        block.rows.map((row, r) => row.flatMap((cell, c) => td(cell, false, ctx, path && `${path}.rows.${r}.${c}`))),
        false,
      );
    case "clinical":
      return [
        `<div style="${callout("#0d9488", "#f0fdfa")}"><strong style="color: #0f766e;">Why this matters clinically</strong><br />${editSpan(
          ctx,
          path && `${path}.body`,
          renderInline(block.body),
        )}</div>`,
      ];
    case "caution": {
      const open = `<div style="${callout("#f59e0b", "#fffbeb")}"><strong${editAttr(ctx, path && `${path}.title`)} style="color: #b45309;">${renderInline(block.title)}</strong>`;
      const bodyPath = block.body !== undefined ? path && `${path}.body` : undefined;
      const bodySpan = editSpan(ctx, bodyPath, renderInline(block.body ?? ""));
      if (!block.items?.length) return [`${open}<br />${bodySpan}</div>`];
      const head = block.body ? `${open}<br />${bodySpan}` : open;
      return [head, ...indent(listLines(block.items, false, ctx, path && `${path}.items`, "margin: 8px 0 0 0;")), "</div>"];
    }
    case "evidence": {
      const strippedTitle = block.title.replace(/^evidence:\s*/i, "");
      return [
        `<div style="${EVIDENCE_BOX}">`,
        ...indent([
          `<p style="margin-top: 0;"><strong style="color: #3730a3;">Evidence: ${editSpan(ctx, path && `${path}.title`, renderInline(strippedTitle))}</strong></p>`,
          ...block.children.flatMap((c, i) => childLines(c, ctx, path && `${path}.children.${i}`)),
        ]),
        "</div>",
      ];
    }
    case "citation":
      return citationLines(block.text, ctx, path && `${path}.text`);
    case "link": {
      const lead = block.lead_in.trim();
      const leadHtml = editSpan(ctx, path && `${path}.lead_in`, renderInline(lead));
      const prefix = lead ? `${leadHtml}${lead.endsWith(":") ? " " : ": "}` : "";
      const linkTextPath = path && `${path}.link_text`;
      const body = /^https?:\/\//.test(block.url)
        ? `<a href="${escapeAttr(block.url)}"${editAttr(ctx, linkTextPath)} target="_blank" rel="noopener">${renderInline(block.link_text)}</a>`
        : editSpan(ctx, linkTextPath, renderInline(block.link_text));
      return [`<div style="${callout("#2563eb", "#eff6ff")}">${prefix}${body}</div>`];
    }
    case "figure":
      return figureLines(block, ctx, path);
    case "takeaways":
      return [
        `<div style="border: 1px solid ${NAVY}; border-radius: 6px; margin: 16px 0; overflow: hidden;">`,
        ...indent([
          `<div style="background-color: ${NAVY}; color: #ffffff; padding: 8px 16px; font-weight: bold;">Key takeaways</div>`,
          ...listLines(block.items, false, ctx, path && `${path}.items`, "margin: 12px 16px 12px 0; padding-left: 40px;"),
        ]),
        "</div>",
      ];
    case "self_check": {
      const open = `<div style="${callout("#e11d48", "#fff1f2")}"><strong style="color: #be123c;">Check your understanding</strong>`;
      const body = block.questions.flatMap((q, i) => [
        `<p style="margin: 10px 0 4px 0;"><strong>${i + 1}.</strong> ${editSpan(ctx, path && `${path}.questions.${i}.question`, renderInline(q.question))}</p>`,
        "<details>",
        ...indent([
          '<summary style="cursor: pointer; color: #be123c;">Show answer</summary>',
          `<p${editAttr(ctx, path && `${path}.questions.${i}.answer`)} style="margin: 6px 0 0 0;">${renderInline(q.answer)}</p>`,
        ]),
        "</details>",
      ]);
      return [open, ...indent(body), "</div>"];
    }
    case "counselling": {
      const titlePath = block.title !== undefined ? path && `${path}.title` : undefined;
      const open = `<div style="${callout("#16a34a", "#f0fdf4")}"><strong${editAttr(ctx, titlePath)} style="color: #15803d;">${renderInline(block.title ?? "Counselling points")}</strong>`;
      return [open, ...indent(listLines(block.items, false, ctx, path && `${path}.items`, "margin: 8px 0 0 0;")), "</div>"];
    }
    case "tip":
      return [
        `<div style="${callout("#0ea5e9", "#f0f9ff")}"><strong style="color: #0369a1;">Pharmacist tip</strong><br />${editSpan(
          ctx,
          path && `${path}.body`,
          renderInline(block.body),
        )}</div>`,
      ];
    case "critical": {
      const titlePath = block.title !== undefined ? path && `${path}.title` : undefined;
      const open = `<div style="${callout("#dc2626", "#fef2f2")}"><strong${editAttr(ctx, titlePath)} style="color: #b91c1c;">${renderInline(block.title ?? "Critical safety warning")}</strong>`;
      const bodyPath = block.body !== undefined ? path && `${path}.body` : undefined;
      const bodySpan = editSpan(ctx, bodyPath, renderInline(block.body ?? ""));
      if (!block.items?.length) return [`${open}<br />${bodySpan}</div>`];
      const head = block.body ? `${open}<br />${bodySpan}` : open;
      return [head, ...indent(listLines(block.items, false, ctx, path && `${path}.items`, "margin: 8px 0 0 0;")), "</div>"];
    }
  }
}
