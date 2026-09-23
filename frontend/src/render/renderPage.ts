import type { EmbedInfo, ImageInfo } from "../types/api";
import type { Page, Tab } from "../types/page";
import { renderInline } from "./inline";
import { blockLines, indent, type RenderContext } from "./templates";

export const PANELS_CLASS =
  "dp-panels-wrapper dp-tabs-pills-group-vertical dp-panel-color-dp-gray dp-panel-active-color-dp-accent dp-panel-hover-color-dp-secondary";

export function buildContext(images: ImageInfo[], embeds: EmbedInfo[]): RenderContext {
  return {
    images: Object.fromEntries(images.map((i) => [i.ref, i])),
    embeds: Object.fromEntries(embeds.map((e) => [e.ref, e.html])),
  };
}

function tabLines(tab: Tab, ctx: RenderContext): string[] {
  return [
    '<div class="dp-panel-group">',
    ...indent([
      `<h3 class="dp-panel-heading">${renderInline(tab.title)}</h3>`,
      '<div class="dp-panel-content">',
      ...indent(tab.blocks.flatMap((b) => blockLines(b, ctx))),
      "</div>",
    ]),
    "</div>",
  ];
}

function revisionLines(embed?: string): string[] {
  return [
    '<div style="display: flex; align-items: center; text-align: center; margin: 36px 0 8px 0;"><span style="padding: 0 16px; color: #6d28d9; font-size: 26px;">Revision</span></div>',
    '<div style="border-radius: 10px; margin: 28px 0px 8px; overflow: hidden; background-color: #faf5ff; border: 2px solid #6d28d9;">',
    ...indent([
      '<div style="background-color: #6d28d9; color: #ffffff; padding: 10px 16px; font-size: 16px;">Check your understanding &mdash; revision questions</div>',
      '<div style="padding: 18px;">',
      ...indent([
        '<p style="margin-top: 0; color: #6b21a8;">Work through the interactive questions below to test yourself on this module.</p>',
        '<div style="border-radius: 8px; padding: 28px; text-align: center; background-color: #ffffff; border: 2px dashed #c4b5fd;">',
        ...indent([`<p style="margin: 0; color: #94a3b8;">${embed ?? "[PASTE H5P EMBED HERE]"}</p>`]),
        "</div>",
      ]),
      "</div>",
    ]),
    "</div>",
  ];
}

export function renderPage(page: Page, ctx: RenderContext): string {
  const lines = [
    '<div id="dp-wrapper" class="dp-wrapper">',
    ...indent([
      '<div class="dp-content-block">',
      ...indent([
        ...page.intro.map((p) => `<p>${renderInline(p)}</p>`),
        `<div class="${PANELS_CLASS}">`,
        ...indent(page.tabs.flatMap((t) => tabLines(t, ctx))),
        "</div>",
      ]),
      "</div>",
    ]),
    "</div>",
  ];
  if (page.revision.include) {
    const embed = page.revision.embed_ref ? ctx.embeds[page.revision.embed_ref] : undefined;
    lines.push(...revisionLines(embed));
  }
  return lines.join("\n") + "\n";
}
