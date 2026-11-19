import type { Block, EvidenceChild, FigureBlock, FlowBlock, FlowStep } from "../types/page";
import type { ImageInfo } from "../types/api";
import { escapeAttr, escapeText, renderInline, splitParagraphs } from "./inline";

export interface RenderContext {
  images: Record<string, ImageInfo>;
  embeds: Record<string, string>;
  /** When true, user-editable text elements get data-edit="PATH" (dot path into the Page JSON). */
  editable?: boolean;
}

export const PALETTE = {
  purple: "#140f50", lavender: "#f4f2fb", lavenderBorder: "#ddd8ef", violet: "#836bff",
  blue: "#1448ff", bluePale: "#eff4ff", blueBorder: "#b8caff", blueDark: "#1039cc",
  amberDark: "#b45309", amber: "#d97706", amberPale: "#fff7ed",
  border: "#cbd5e1", muted: "#64748b", red: "#b91c1c", redPale: "#fef2f2", redDark: "#991b1b",
} as const;
const P = PALETTE;

export const SPACER = "<p>&nbsp;</p>";
export const PLACEHOLDER_STYLE = `text-align: center; border: 2px dashed ${P.border}; padding: 20px; color: ${P.muted};`;
const CITE_SPAN = `font-size: 8pt; color: ${P.muted};`;
const CELL = `padding: 11px; border: 1px solid ${P.border};`;
const ARROW = `<div style="font-size: 1.5em; color: ${P.amber};" aria-hidden="true">&rarr;</div>`;
const LIST_IN_CALLOUT = "margin: 0; padding-left: 24px;";
const lr = (rule: string, fill: string) => `margin: 20px 0; padding: 16px 18px; border-left: 5px solid ${rule}; background: ${fill};`;
const box = (border: string, fill: string, width = 2) =>
  `margin: 20px 0px; padding: 17px 19px; background: ${fill}; border-radius: 8px; border: ${width}px solid ${border};`;
const STEP_STYLE: Record<FlowStep["style"], string> = {
  solid: `padding: 13px 18px; background: ${P.purple}; color: #ffffff; border-radius: 8px;`,
  outline: `padding: 13px 18px; background: ${P.lavender}; border-radius: 8px; border: 2px solid ${P.purple};`,
  amber: `padding: 13px 18px; background: ${P.amberPale}; border-radius: 8px; border: 2px solid ${P.amber};`,
};
const MAJOR = new Set<Block["type"]>([
  "table", "contrast_table", "flow", "formula", "figure", "key_point", "clinical", "caution", "critical",
  "tip", "counselling", "evidence", "self_check", "link", "takeaways", "accordion",
]);

export function indent(lines: string[], level = 1): string[] {
  const pad = "    ".repeat(level);
  return lines.map((line) => pad + line);
}

function editAttr(ctx: RenderContext, path: string | undefined): string {
  return ctx.editable && path ? ` data-edit="${escapeAttr(path)}"` : "";
}

function editSpan(ctx: RenderContext, path: string | undefined, inner: string): string {
  return ctx.editable && path ? `<span data-edit="${escapeAttr(path)}">${inner}</span>` : inner;
}

const join = (base: string | undefined, key: string | number) => (base === undefined ? undefined : `${base}.${key}`);
const pct = (n: number) => `${Number(n.toFixed(2))}%`;
const stripBold = (s: string) => s.replace(/^\*\*([\s\S]*)\*\*$/, "$1");

function cellLines(tag: "td" | "th", style: string, content: string, ctx: RenderContext, path?: string, extra = ""): string[] {
  const paras = splitParagraphs(content);
  const open = `<${tag}${editAttr(ctx, path)} style="${style}"${extra}>`;
  if (paras.length <= 1) return [`${open}${renderInline(paras[0] ?? "")}</${tag}>`];
  return [open, ...indent(paras.map((p) => `<p>${renderInline(p)}</p>`)), `</${tag}>`];
}

/** A table with one header row (primary = deep purple, secondary = dark amber) and optional row labels. */
export function simpleTableLines(
  headers: string[],
  rows: string[][],
  opts: { variant?: "primary" | "secondary"; rowHeaders?: boolean; widths?: (number | undefined)[]; headerPaths?: (string | undefined)[]; cellPath?: (r: number, c: number) => string | undefined },
  ctx: RenderContext,
): string[] {
  const secondary = opts.variant === "secondary";
  const headBg = secondary ? P.amberDark : P.purple;
  const labelBg = secondary ? P.amberPale : P.lavender;
  const rowHeaders = opts.rowHeaders !== false;
  const headerCells = headers.map((h, i) => {
    const w = opts.widths?.[i] === undefined ? "" : ` width: ${pct(opts.widths[i]!)};`;
    return `<th${editAttr(ctx, opts.headerPaths?.[i])} style="padding: 11px; text-align: left;${w} border: 1px solid ${P.border};" scope="col">${renderInline(h)}</th>`;
  });
  return [
    '<table style="width: 100%; border-collapse: collapse; margin: 18px 0;">',
    ...indent([
      "<thead>",
      ...indent([`<tr style="background: ${headBg}; color: #ffffff;">`, ...indent(headerCells), "</tr>"]),
      "</thead>",
      "<tbody>",
      ...indent(
        rows.flatMap((row, r) => [
          "<tr>",
          ...indent(
            row.flatMap((cell, c) =>
              c === 0 && rowHeaders
                ? cellLines("th", `padding: 11px; background: ${labelBg}; text-align: left; border: 1px solid ${P.border};`, stripBold(cell), ctx, opts.cellPath?.(r, c), ' scope="row"')
                : cellLines("td", CELL, cell, ctx, opts.cellPath?.(r, c)),
            ),
          ),
          "</tr>",
        ]),
      ),
      "</tbody>",
    ]),
    "</table>",
  ];
}

function listLines(items: string[], ordered: boolean, ctx: RenderContext, itemsPath?: string, style?: string): string[] {
  const tag = ordered ? "ol" : "ul";
  return [`<${tag}${style ? ` style="${style}"` : ""}>`, ...indent(items.map((i, idx) => `<li${editAttr(ctx, join(itemsPath, idx))}>${renderInline(i)}</li>`)), `</${tag}>`];
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
    : [`<p style="${PLACEHOLDER_STYLE}">[ IMAGE ${escapeText(block.ref)}: ${renderInline(block.alt)}${image?.location ? `, ${escapeText(image.location)}` : ""} &mdash; delete this line and insert from Canvas Files ]</p>`];
  if (block.caption) lines.push(...citationLines(block.caption, ctx, join(path, "caption")));
  return lines;
}

export function flowRowLines(flow: FlowBlock, ctx: RenderContext, path?: string): string[] {
  const items = flow.steps.flatMap((s, i) => {
    const stepPath = join(join(path, "steps"), i);
    const sub = s.sub ? `<br /><span${editAttr(ctx, join(stepPath, "sub"))} style="font-size: 0.9em;">${renderInline(s.sub)}</span>` : "";
    const step = `<div style="${STEP_STYLE[s.style] ?? STEP_STYLE.outline}"><strong${editAttr(ctx, join(stepPath, "label"))}>${renderInline(s.label)}</strong>${sub}</div>`;
    return i === 0 ? [step] : [ARROW, step];
  });
  return ['<div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; text-align: center;">', ...indent(items), "</div>"];
}

/** Title-led callout: body-only → single line; with items → title paragraph, optional body paragraph, list. */
function titledCallout(style: string, title: string, titleColor: string | undefined, ctx: RenderContext, path: string | undefined, opts: { titlePath?: string; body?: string; items?: string[] }): string[] {
  const strong = `<strong${editAttr(ctx, opts.titlePath)}${titleColor ? ` style="color: ${titleColor};"` : ""}>${renderInline(title)}</strong>`;
  const bodyHtml = opts.body !== undefined ? editSpan(ctx, join(path, "body"), renderInline(opts.body)) : "";
  if (!opts.items?.length) return [`<div style="${style}"><p style="margin: 0;">${strong}${bodyHtml ? ` ${bodyHtml}` : ""}</p></div>`];
  return [
    `<div style="${style}">`,
    ...indent([
      `<p style="margin: 0 0 8px 0;">${strong}</p>`,
      ...(opts.body ? [`<p style="margin: 0 0 8px 0;">${bodyHtml}</p>`] : []),
      ...listLines(opts.items, false, ctx, join(path, "items"), LIST_IN_CALLOUT),
    ]),
    "</div>",
  ];
}

function childLines(child: EvidenceChild, ctx: RenderContext, path?: string): string[] {
  switch (child.type) {
    case "paragraph":
      return [`<p${editAttr(ctx, join(path, "text"))}>${renderInline(child.text)}</p>`];
    case "list":
      return listLines(child.items, false, ctx, join(path, "items"), LIST_IN_CALLOUT);
    case "figure":
      return figureLines(child, ctx, path);
    case "citation":
      return citationLines(child.text, ctx, join(path, "text"));
    case "references":
      return [
        '<p style="margin-bottom: 4px;"><span style="text-decoration: underline;">References:</span></p>',
        ...child.items.map((i, idx) => `<p style="margin: 4px 0;"><span style="${CITE_SPAN}"${editAttr(ctx, join(join(path, "items"), idx))}>${renderInline(i)}</span></p>`),
      ];
  }
}

/** Blocks for a tab or accordion panel, with spacer paragraphs per spec §5. */
export function contentLines(blocks: Block[], ctx: RenderContext, basePath?: string): string[] {
  const out: string[] = [];
  blocks.forEach((b, i) => {
    if (i > 0 && (MAJOR.has(b.type) || MAJOR.has(blocks[i - 1].type))) out.push(SPACER);
    out.push(...blockLines(b, ctx, join(basePath, i)));
  });
  out.push(SPACER);
  return out;
}

export function blockLines(block: Block, ctx: RenderContext, path?: string): string[] {
  switch (block.type) {
    case "heading":
      return [`<h4${editAttr(ctx, join(path, "text"))} style="color: ${P.purple};">${renderInline(block.text)}</h4>`];
    case "paragraph":
      return [`<p${editAttr(ctx, join(path, "text"))}>${renderInline(block.text)}</p>`];
    case "list":
      return listLines(block.items, block.ordered, ctx, join(path, "items"));
    case "table": {
      const widths = block.col_widths && block.col_widths.length === block.headers.length ? block.col_widths : undefined;
      return simpleTableLines(block.headers, block.rows, {
        variant: block.variant,
        rowHeaders: block.row_headers,
        widths,
        headerPaths: block.headers.map((_, i) => join(join(path, "headers"), i)),
        cellPath: (r, c) => join(join(join(path, "rows"), r), c),
      }, ctx);
    }
    case "contrast_table": {
      const head = (text: string, bg: string, key: string) =>
        `<th${editAttr(ctx, join(path, key))} style="padding: 11px; text-align: left; width: 50%; background: ${bg}; color: #ffffff; border: 1px solid ${P.border};" scope="col">${renderInline(text)}</th>`;
      return [
        '<table style="width: 100%; border-collapse: collapse; margin: 18px 0;">',
        ...indent([
          "<thead>",
          ...indent(["<tr>", ...indent([head(block.left_header, P.purple, "left_header"), head(block.right_header, P.amberDark, "right_header")]), "</tr>"]),
          "</thead>",
          "<tbody>",
          ...indent(block.rows.flatMap((row, r) => ["<tr>", ...indent(row.flatMap((cell, c) => cellLines("td", CELL, cell, ctx, join(join(join(path, "rows"), r), c)))), "</tr>"])),
          "</tbody>",
        ]),
        "</table>",
      ];
    }
    case "flow":
      return ['<div style="margin: 24px 0;">', ...indent(flowRowLines(block, ctx, path)), "</div>"];
    case "formula":
      return [
        `<div style="margin: 18px auto; padding: 16px; max-width: 440px; text-align: center; background: ${P.lavender}; border-radius: 8px; border: 1px solid ${P.lavenderBorder};">`,
        ...indent([
          `<p style="margin: 0; font-size: 1.25em;"><strong${editAttr(ctx, join(path, "expression"))}>${renderInline(block.expression)}</strong></p>`,
          ...(block.note ? [`<p${editAttr(ctx, join(path, "note"))} style="margin: 6px 0 0 0; font-size: 0.9em; color: ${P.muted};">${renderInline(block.note)}</p>`] : []),
        ]),
        "</div>",
      ];
    case "key_point": {
      const lead = block.lead !== undefined ? `<strong>${editSpan(ctx, join(path, "lead"), renderInline(block.lead))}</strong> ` : "";
      return [`<div style="${lr(P.purple, P.lavender)}"><p style="margin: 0;">${lead}${editSpan(ctx, join(path, "text"), renderInline(block.text))}</p></div>`];
    }
    case "clinical":
      return titledCallout(lr(P.amber, P.amberPale), "Why this matters clinically:", undefined, ctx, path, { body: block.body });
    case "caution":
      return titledCallout(box(P.amber, P.amberPale), block.title, undefined, ctx, path, { titlePath: join(path, "title"), body: block.body, items: block.items });
    case "critical":
      return titledCallout(lr(P.red, P.redPale), block.title ?? "Critical safety warning", P.redDark, ctx, path, {
        titlePath: block.title !== undefined ? join(path, "title") : undefined, body: block.body, items: block.items,
      });
    case "tip":
      return titledCallout(lr(P.blue, P.bluePale), "Pharmacist tip:", P.blueDark, ctx, path, { body: block.body });
    case "counselling":
      return titledCallout(box(P.lavenderBorder, P.lavender, 1), block.title ?? "Counselling points", P.purple, ctx, path, {
        titlePath: block.title !== undefined ? join(path, "title") : undefined, items: block.items,
      });
    case "evidence": {
      const title = block.title.replace(/^evidence:\s*/i, "");
      return [
        `<div style="${box(P.blueBorder, P.bluePale)}">`,
        ...indent([
          `<p style="margin: 0 0 8px 0;"><strong style="color: ${P.blueDark};">Evidence: ${editSpan(ctx, join(path, "title"), renderInline(title))}</strong></p>`,
          ...block.children.flatMap((c, i) => childLines(c, ctx, join(join(path, "children"), i))),
        ]),
        "</div>",
      ];
    }
    case "citation":
      return citationLines(block.text, ctx, join(path, "text"));
    case "link": {
      const lead = block.lead_in.trim();
      const prefix = lead ? `${editSpan(ctx, join(path, "lead_in"), renderInline(lead))}${lead.endsWith(":") ? " " : ": "}` : "";
      const textPath = join(path, "link_text");
      const body = /^https?:\/\//.test(block.url)
        ? `<a href="${escapeAttr(block.url)}"${editAttr(ctx, textPath)} target="_blank" rel="noopener">${renderInline(block.link_text)}</a>`
        : editSpan(ctx, textPath, renderInline(block.link_text));
      return [`<div style="${box(P.blueBorder, P.bluePale)}"><p style="margin: 0;">${prefix}${body}</p></div>`];
    }
    case "figure":
      return figureLines(block, ctx, path);
    case "takeaways":
      return [
        `<div style="border: 1px solid ${P.lavenderBorder}; border-radius: 8px; margin: 16px 0; overflow: hidden;">`,
        ...indent([
          `<div style="background: ${P.purple}; color: #ffffff; padding: 8px 16px; font-weight: bold;">Key takeaways</div>`,
          ...listLines(block.items, false, ctx, join(path, "items"), "margin: 12px 16px 12px 0; padding-left: 40px;"),
        ]),
        "</div>",
      ];
    case "self_check":
      return [
        `<div style="${lr(P.violet, P.lavender)}">`,
        ...indent([
          `<p style="margin: 0 0 8px 0;"><strong style="color: ${P.purple};">Check your understanding</strong></p>`,
          ...block.questions.flatMap((q, i) => [
            `<p style="margin: 10px 0 4px 0;"><strong>${i + 1}.</strong> ${editSpan(ctx, join(join(join(path, "questions"), i), "question"), renderInline(q.question))}</p>`,
            "<details>",
            ...indent([
              `<summary style="cursor: pointer; color: ${P.purple};">Show answer</summary>`,
              `<p${editAttr(ctx, join(join(join(path, "questions"), i), "answer"))} style="margin: 6px 0 0 0;">${renderInline(q.answer)}</p>`,
            ]),
            "</details>",
          ]),
        ]),
        "</div>",
      ];
    case "accordion":
      return [
        '<div class="dp-panels-wrapper dp-accordion-default">',
        ...indent(
          block.panels.flatMap((panel, i) => [
            '<div class="dp-panel-group">',
            ...indent([
              `<h4 class="dp-panel-heading">${renderInline(panel.title)}</h4>`,
              '<div class="dp-panel-content">',
              ...indent(contentLines(panel.blocks, ctx, join(join(join(path, "panels"), i), "blocks"))),
              "</div>",
            ]),
            "</div>",
          ]),
        ),
        "</div>",
      ];
  }
}
