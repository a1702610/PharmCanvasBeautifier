import type { EmbedInfo, ImageInfo } from "../types/api";
import type { Page, Tab } from "../types/page";
import { escapeAttr, renderInline } from "./inline";
import { studyMaterialsContentLines } from "./studyMaterials";
import { addSlot, contentLines, figureLines, indent, PALETTE as P, PLACEHOLDER_STYLE, rowDeleteCell, SPACER, type RenderContext } from "./templates";

export const TABS_CLASS = "dp-panels-wrapper dp-tabs-buttons-vertical";

export function buildContext(images: ImageInfo[], embeds: EmbedInfo[], editable = false): RenderContext {
  const imageMap: Record<string, ImageInfo> = Object.create(null);
  for (const i of images) imageMap[i.ref] = i;
  const embedMap: Record<string, string> = Object.create(null);
  for (const e of embeds) embedMap[e.ref] = e.html;
  return { images: imageMap, embeds: embedMap, editable };
}

const edit = (ctx: RenderContext, path: string) => (ctx.editable ? ` data-edit="${escapeAttr(path)}"` : "");

function introLines(page: Page, ctx: RenderContext): string[] {
  const paras = page.intro.map((p, i) => {
    const margin = i === page.intro.length - 1 ? "margin: 0;" : "margin: 0 0 12px 0;";
    return `<p${edit(ctx, `intro.${i}`)} style="${margin}">${renderInline(p)}</p>`;
  });
  const figure = page.intro_figure
    ? figureLines(page.intro_figure, ctx, "intro_figure")
    : [`<p style="${PLACEHOLDER_STYLE}">[ IMAGE: placeholder &mdash; delete this line and insert from Canvas Files ]</p>`];
  return [
    `<table style="width: 100%; border-collapse: separate; margin: 0px 0px 28px; background: ${P.lavender}; border-radius: 12px; border: 1px solid ${P.lavenderBorder};" role="presentation">`,
    ...indent(["<tbody>", ...indent(["<tr>", ...indent([
      '<td style="width: 58%; vertical-align: middle; padding: 26px 30px;">',
      ...indent([`<h2${edit(ctx, "title")} style="margin: 0 0 14px 0; color: ${P.purple};">${renderInline(page.title)}</h2>`, ...paras]),
      "</td>",
      '<td style="width: 42%; vertical-align: middle; text-align: center; padding: 20px;">',
      ...indent(figure),
      "</td>",
    ]), "</tr>"]), "</tbody>"]),
    "</table>",
  ];
}

function groupLines(title: string, content: string[]): string[] {
  return ['<div class="dp-panel-group">', ...indent([`<h3 class="dp-panel-heading">${title}</h3>`, '<div class="dp-panel-content">', ...indent(content), "</div>"]), "</div>"];
}

function tabLines(tab: Tab, ctx: RenderContext, i: number): string[] {
  const title = ctx.editable ? `<span data-edit="tabs.${i}.title">${renderInline(tab.title)}</span>` : renderInline(tab.title);
  return groupLines(`${i + 1}. ${title}`, contentLines(tab.blocks, ctx, `tabs.${i}.blocks`));
}

/** The Revision check, rendered as the last tab: the "explain, don't recall" prompt, the
 *  numbered points and the optional H5P slot. */
function revisionContentLines(page: Page, ctx: RenderContext): string[] {
  const rev = page.revision;
  const embed = rev.embed_ref ? ctx.embeds[rev.embed_ref] : undefined;
  const points = rev.points ?? [];
  const controls = ctx.editable === true;
  const out: string[] = [
    `<p style="margin: 0 0 18px 0;">Before moving on, check that these ideas can be <strong>explained</strong>, rather than simply recalled.</p>`,
  ];
  if (points.length) {
    out.push(
      '<table style="width: 100%; border-collapse: collapse; background: #ffffff;">',
      ...indent(["<tbody>", ...indent(points.flatMap((pt, i) => ["<tr>", ...indent([
        `<td style="width: 44px; padding: 12px; text-align: center; color: ${P.amber}; border: 1px solid ${P.border};">${i + 1}</td>`,
        `<td${edit(ctx, `revision.points.${i}`)} style="padding: 12px; border: 1px solid ${P.border};">${renderInline(pt)}</td>`,
        ...(controls ? [rowDeleteCell(`revision.points.${i}`)] : []),
      ]), "</tr>"])), "</tbody>"]),
      "</table>",
    );
  }
  if (controls) out.push(addSlot("add-item", "revision.points", points.length, "+ Add point"));
  if (rev.include || embed) {
    out.push(
      SPACER,
      `<div style="padding: 16px; background: #ffffff; border-radius: 8px; border: 2px dashed ${P.lavenderBorder}; text-align: center;">`,
      ...indent([`<p style="margin: 0 0 10px 0; color: ${P.purple};"><strong>Interactive questions</strong></p>`, `<p style="margin: 0; color: ${P.muted};">${embed ?? "[PASTE H5P EMBED HERE]"}</p>`]),
      "</div>",
    );
  }
  out.push(SPACER);
  return out;
}

export function renderPage(page: Page, ctx: RenderContext): string {
  // In edit mode the Revision check tab always shows, so a lecturer can add its first point.
  const showRevision =
    ctx.editable === true ||
    (page.revision.points?.length ?? 0) > 0 ||
    page.revision.include ||
    !!(page.revision.embed_ref && ctx.embeds[page.revision.embed_ref]);
  const tabs = [
    ...page.tabs.flatMap((t, i) => tabLines(t, ctx, i)),
    ...groupLines(`${page.tabs.length + 1}. Study materials`, studyMaterialsContentLines(page, ctx)),
    ...(showRevision ? groupLines(`${page.tabs.length + 2}. Revision check`, revisionContentLines(page, ctx)) : []),
  ];
  const lines = [
    '<div id="dp-wrapper" class="dp-wrapper" style="color: #1f2937;">',
    ...indent([...introLines(page, ctx), SPACER, `<div class="${TABS_CLASS}">`, ...indent(tabs), "</div>", SPACER]),
    "</div>",
  ];
  return lines.join("\n") + "\n";
}
