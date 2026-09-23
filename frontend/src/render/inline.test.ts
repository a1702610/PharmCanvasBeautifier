import { describe, expect, it } from "vitest";
import { escapeText, renderInline, splitParagraphs } from "./inline";

describe("renderInline", () => {
  it("escapes HTML", () => {
    expect(renderInline('Use <b>care</b> & "dose"')).toBe("Use &lt;b&gt;care&lt;/b&gt; &amp; &quot;dose&quot;");
  });
  it("renders bold and italic", () => {
    expect(renderInline("**Start low** - then *go slow*")).toBe("<strong>Start low</strong> - then <em>go slow</em>");
  });
  it("leaves lone asterisks alone", () => {
    expect(renderInline("2 * 3 * 4")).toBe("2 * 3 * 4");
  });
  it("renders http(s) links", () => {
    expect(renderInline("See [TGA](https://www.tga.gov.au/a?b=1&c=2)")).toBe(
      'See <a href="https://www.tga.gov.au/a?b=1&amp;c=2" target="_blank" rel="noopener">TGA</a>',
    );
  });
  it("renders a URL with a balanced parenthesis pair (e.g. a DOI) in full", () => {
    expect(renderInline("See [the study](https://doi.org/10.1016/S0140-6736(20)30183-5).")).toBe(
      'See <a href="https://doi.org/10.1016/S0140-6736(20)30183-5" target="_blank" rel="noopener">the study</a>.',
    );
  });
  it("does not link other schemes", () => {
    expect(renderInline("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
  });
  it("encodes special characters as entities", () => {
    expect(renderInline("4 g/day — max ≥ 2 µg, Vægter")).toBe("4 g/day &mdash; max &ge; 2 &micro;g, V&#230;gter");
  });
});

describe("escapeText", () => {
  it("encodes non-BMP characters as one entity", () => {
    expect(escapeText("💊")).toBe("&#128138;");
  });
});

describe("splitParagraphs", () => {
  it("splits on blank lines and trims", () => {
    expect(splitParagraphs("A\n\n  B  \n \nC")).toEqual(["A", "B", "C"]);
    expect(splitParagraphs("single")).toEqual(["single"]);
  });
});
