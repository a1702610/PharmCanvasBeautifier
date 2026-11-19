import type { Page } from "../types/page";
import { escapeAttr, escapeText, renderInline } from "./inline";
import { indent, PALETTE as P, SPACER, type RenderContext } from "./templates";

export function safeUrl(url?: string): string | undefined {
  const u = url?.trim();
  return u && /^https?:\/\//i.test(u) ? u : undefined;
}

const link = (url: string, text: string) => `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${text}</a>`;
const DASHED = `display: inline-block; padding: 10px 16px; border: 2px dashed ${P.lavenderBorder}; color: ${P.purple}; border-radius: 999px;`;

export function studyMaterialsContentLines(page: Page, ctx: RenderContext): string[] {
  const study = page.study ?? { recordings: [], resources: [] };
  const recs = study.recordings ?? [];
  const ress = (study.resources ?? []).filter((r) => r?.title?.trim() || safeUrl(r?.url));
  const out: string[] = [];

  const activities = page.study_activities ?? [];
  if (activities.length) {
    const edit = (path: string) => (ctx.editable ? ` data-edit="${escapeAttr(path)}"` : "");
    out.push(
      '<table style="width: 100%; border-collapse: collapse; margin: 18px 0;">',
      ...indent([
        "<thead>",
        ...indent([`<tr style="background: ${P.purple}; color: #ffffff;">`, ...indent([
          `<th style="padding: 11px; text-align: left; border: 1px solid ${P.border};" scope="col">What to do</th>`,
          `<th style="padding: 11px; text-align: left; border: 1px solid ${P.border};" scope="col">Purpose</th>`,
        ]), "</tr>"]),
        "</thead>",
        "<tbody>",
        ...indent(activities.flatMap((a, i) => ["<tr>", ...indent([
          `<td style="padding: 11px; border: 1px solid ${P.border};"><strong${edit(`study_activities.${i}.task`)}>${renderInline(a.task)}</strong></td>`,
          `<td${edit(`study_activities.${i}.purpose`)} style="padding: 11px; border: 1px solid ${P.border};">${renderInline(a.purpose)}</td>`,
        ]), "</tr>"])),
        "</tbody>",
      ]),
      "</table>",
      SPACER,
    );
  }

  out.push(`<h4 style="color: ${P.purple}; margin-top: 22px;">Handout</h4>`);
  const handoutUrl = safeUrl(study.handout?.url);
  const label = study.handout?.label?.trim();
  if (handoutUrl) {
    out.push(`<p><a href="${escapeAttr(handoutUrl)}" target="_blank" rel="noopener" style="display: inline-block; padding: 10px 16px; background: ${P.purple}; color: #ffffff; text-decoration: none; border-radius: 999px;">${escapeText(label || "Handout")}</a></p>`);
  } else if (label) {
    out.push(`<p style="${DASHED}">[Handout: ${escapeText(label)} &mdash; insert the Canvas file link]</p>`);
  } else {
    out.push(`<p style="${DASHED}">[Add handout link]</p>`);
  }
  out.push(SPACER);

  out.push(`<h4 style="color: ${P.purple}; margin-top: 26px;">Recordings</h4>`);
  const recordings = recs.length ? recs : [{}];
  const rows = recordings.map((r: { part?: string; title?: string; recording_url?: string; transcript_url?: string }, i) => {
    const part = r.part?.trim() || `Part ${i + 1}`;
    const title = r.title?.trim();
    const recUrl = safeUrl(r.recording_url);
    const trUrl = safeUrl(r.transcript_url);
    const recording = recUrl ? link(recUrl, escapeText(title || "Recording")) : `${title ? `${escapeText(title)} ` : ""}[Add recording link]`;
    const transcript = trUrl ? link(trUrl, escapeText(`${part} transcript`)) : "[Add transcript link]";
    return { part: escapeText(part), recording, transcript };
  });
  out.push(
    '<table style="width: 100%; border-collapse: collapse; margin: 18px 0;">',
    ...indent([
      "<thead>",
      ...indent([`<tr style="background: ${P.amberDark}; color: #ffffff;">`, ...indent(["Part", "Recording", "Transcript"].map((h) => `<th style="padding: 11px; text-align: left; border: 1px solid ${P.border};" scope="col">${h}</th>`)), "</tr>"]),
      "</thead>",
      "<tbody>",
      ...indent(rows.flatMap((r) => ["<tr>", ...indent([
        `<th style="padding: 11px; background: ${P.amberPale}; text-align: left; border: 1px solid ${P.border};" scope="row">${r.part}</th>`,
        `<td style="padding: 11px; border: 1px solid ${P.border};">${r.recording}</td>`,
        `<td style="padding: 11px; border: 1px solid ${P.border};">${r.transcript}</td>`,
      ]), "</tr>"])),
      "</tbody>",
    ]),
    "</table>",
    SPACER,
  );

  const resources = ress.length
    ? ress.map((res) => {
        const url = safeUrl(res.url);
        const text = res.title?.trim() || url || "";
        return `<p>${url ? link(url, escapeText(text)) : escapeText(text)}</p>`;
      })
    : ["<p>[Add additional resources]</p>"];
  out.push(
    '<div class="dp-panels-wrapper dp-accordion-default">',
    ...indent(['<div class="dp-panel-group">', ...indent(['<h4 class="dp-panel-heading">Additional resources</h4>', '<div class="dp-panel-content">', ...indent([...resources, SPACER]), "</div>"]), "</div>"]),
    "</div>",
    SPACER,
  );
  return out;
}
