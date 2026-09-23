import DOMPurify from "dompurify";

/**
 * Sanitizes renderPage() output before it is injected into the in-app preview
 * via dangerouslySetInnerHTML. renderPage()/templates.ts splice some values
 * (image.canvas_tag from pasted Canvas HTML, embed <iframe> HTML) through
 * without escaping, because that output must stay byte-identical to what gets
 * copied into Canvas. Pages can also arrive via Import (a colleague's JSON
 * file), so this is the last line of defence against a crafted canvas_tag or
 * embed running script same-origin, where the Gemini key lives in
 * localStorage.
 *
 * Preview-only: never applied to the HTML that gets copied/exported.
 */
export function sanitizePreviewHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "target"],
  });
}
