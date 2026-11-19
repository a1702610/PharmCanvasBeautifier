const NAMED: Record<string, string> = {
  "\u2014": "&mdash;", "\u2013": "&ndash;", "\u2192": "&rarr;", "\u2190": "&larr;", "\u2260": "&ne;", "\u2264": "&le;", "\u2265": "&ge;",
  "\u00b5": "&micro;", "\u03bc": "&micro;", "\u00b0": "&deg;", "\u00b1": "&plusmn;", "\u00d7": "&times;", "\u2026": "&hellip;",
  "\u2018": "&lsquo;", "\u2019": "&rsquo;", "\u201c": "&ldquo;", "\u201d": "&rdquo;", "\u00a0": "&nbsp;", "\u2212": "&minus;",
};

export function escapeText(s: string): string {
  let out = "";
  for (const ch of s) {
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === '"') out += "&quot;";
    else {
      const cp = ch.codePointAt(0)!;
      out += cp < 128 ? ch : NAMED[ch] ?? `&#${cp};`;
    }
  }
  return out;
}

export const escapeAttr = escapeText;

// A URL made of "plain" characters or a single balanced (...) group, so the closing ")"
// of the markdown link isn't swallowed by a balanced pair inside the URL itself
// (e.g. a DOI like https://doi.org/10.1016/S0140-6736(20)30183-5).
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)/g;
const BOLD_RE = /\*\*(.+?)\*\*/g;
const ITALIC_RE = /(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g;
const SUB_RE = /~([^~\s]{1,16})~/g;
const SUP_RE = /\^([^^\s]{1,16})\^/g;

/** Render the allowed markdown subset (**bold**, *italic*, [text](https://url), ~sub~, ^sup^) to safe HTML. */
export function renderInline(src: string): string {
  const html = escapeText(src)
    .replace(LINK_RE, (_m, text: string, url: string) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`)
    .replace(BOLD_RE, "<strong>$1</strong>")
    .replace(ITALIC_RE, "$1<em>$2</em>");
  // Sub/superscript only outside HTML tags, so href values are never rewritten.
  return html
    .split(/(<[^>]+>)/)
    .map((seg) => (seg.startsWith("<") ? seg : seg.replace(SUB_RE, "<sub>$1</sub>").replace(SUP_RE, "<sup>$1</sup>")))
    .join("");
}

export function splitParagraphs(s: string): string[] {
  return s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}
