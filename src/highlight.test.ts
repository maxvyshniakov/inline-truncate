import { describe, expect, it } from "vitest";
import { indexTextGraphemes, splitTextGraphemes } from "./graphemes.js";
import { highlightedTextParts, mapMatchesToCut } from "./highlight.js";
import { TRUNCATION_MARKER, truncatePrepared, truncateText, type TextTruncateMode, type TruncationCut } from "./truncation.js";

const M = TRUNCATION_MARKER;

// One unit per UTF-16 code unit.
function cutOf(text: string, maxWidth: number, mode: TextTruncateMode) {
  const { text: visible, cut } = truncatePrepared(
    { text, maxWidth, mode, measureText: (value) => value.length },
    () => indexTextGraphemes(text),
  );
  return { text: visible, cut };
}

// Renders mapped parts as a string: [x] for a highlighted run, {...} for a highlighted marker.
// The cut keeps `prefix` and `suffix` of `text` around the marker.
function draw(text: string, query: string, prefix: string, suffix = "") {
  expect(text.startsWith(prefix) && text.endsWith(suffix)).toBe(true);
  const cut = { prefixEnd: prefix.length, suffixStart: text.length - suffix.length };
  const { parts, markerMatched } = mapMatchesToCut(text, query, cut);
  const drawn = parts
    .map((part) => (part.marker ? (part.matched ? `{${part.text}}` : part.text) : part.matched ? `[${part.text}]` : part.text))
    .join("");
  return { drawn, markerMatched, plain: parts.map((part) => part.text).join("") };
}

describe("the truncation search's cut", () => {
  it("is null for text that fits", () => {
    expect(cutOf("report.pdf", 100, "middle")).toEqual({ text: "report.pdf", cut: null });
  });

  it("spells the visible string for every cut, grapheme clusters included", () => {
    const texts = [
      "Quarterly-design-review.pdf",
      "release...notes...final.txt",
      "family-👨‍👩‍👧-and-👍🏽-notes.txt",
      "café-crème-brûlée.txt",
      "flag-🇺🇦🇵🇱-list.csv",
    ];
    for (const text of texts) {
      for (const mode of ["middle", "end"] as const) {
        for (let maxWidth = 1; maxWidth < text.length; maxWidth++) {
          const { text: visible, cut } = cutOf(text, maxWidth, mode);
          expect(cut, `${mode} ${maxWidth} ${visible}`).not.toBeNull();
          expect(text.slice(0, cut!.prefixEnd) + M + text.slice(cut!.suffixStart)).toBe(visible);
          expect(cut!.prefixEnd).toBeLessThan(cut!.suffixStart);
        }
      }
    }
  });

  it("names the split it made when periods beside the marker allow another", () => {
    // "release.." + M + ".final.txt" and "release..." + M + "final.txt" spell the same string.
    expect(cutOf("release...notes...final.txt", 22, "middle")).toEqual({
      text: `release......final.txt`,
      cut: { prefixEnd: 9, suffixStart: 17 },
    });
  });

  it("covers the whole text when only the marker fits", () => {
    expect(cutOf("report.pdf", 3, "middle").cut).toEqual({ prefixEnd: 0, suffixStart: 10 });
    expect(cutOf("report.pdf", 3, "end").cut).toEqual({ prefixEnd: 0, suffixStart: 10 });
  });

  it("leaves truncateText's result as the visible string and the flag", () => {
    const result = truncateText({ maxWidth: 10, measureText: (value) => value.length, mode: "middle", text: "Quarterly-design-review.pdf" });
    expect(Object.keys(result).sort()).toEqual(["text", "truncated"]);
  });
});

describe("mapMatchesToCut", () => {
  it("highlights the full text as before when nothing is cut", () => {
    const { parts, markerMatched } = mapMatchesToCut("photo-photo.jpg", "photo", null);
    expect(parts).toEqual(highlightedTextParts("photo-photo.jpg", "photo"));
    expect(markerMatched).toBe(false);
  });

  it("keeps an empty query plain", () => {
    expect(draw("report-final.pdf", "  ", "report")).toEqual({ drawn: `report${M}`, markerMatched: false, plain: `report${M}` });
  });

  it("highlights a fully visible match in place, end cut", () => {
    expect(draw("report-final.pdf", "port", "report")).toMatchObject({ drawn: `re[port]${M}`, markerMatched: false });
  });

  it("highlights the marker for a fully cut match, end cut", () => {
    expect(draw("report-final.pdf", "final", "report")).toMatchObject({ drawn: `report{${M}}`, markerMatched: true });
  });

  it("highlights the marker for a fully cut match, middle cut", () => {
    expect(draw("Quarterly-design-review.pdf", "design", "Qua", ".pdf")).toMatchObject({
      drawn: `Qua{${M}}.pdf`,
      markerMatched: true,
    });
  });

  it("highlights the visible start and the marker for a match straddling the prefix cut", () => {
    expect(draw("report-final.pdf", "port-fi", "report")).toMatchObject({ drawn: `re[port]{${M}}`, markerMatched: true });
    expect(draw("report-final.pdf", "port-fi", "repor", ".pdf")).toMatchObject({ drawn: `re[por]{${M}}.pdf`, markerMatched: true });
  });

  it("highlights the marker and the visible end for a match straddling the suffix cut", () => {
    expect(draw("report-final.pdf", "al.p", "rep", "l.pdf")).toMatchObject({ drawn: `rep{${M}}[l.p]df`, markerMatched: true });
  });

  it("highlights both visible ends and the marker for a match spanning the whole cut", () => {
    expect(draw("report-final.pdf", "ort-final.p", "repo", ".pdf")).toMatchObject({
      drawn: `rep[o]{${M}}[.p]df`,
      markerMatched: true,
    });
  });

  it("maps several matches: visible ones in place, cut ones on one marker", () => {
    expect(draw("ab-ab-ab-ab-ab", "ab", "ab-", "-ab")).toMatchObject({
      drawn: `[ab]-{${M}}-[ab]`,
      markerMatched: true,
    });
  });

  it("leaves the marker plain when every match is visible", () => {
    expect(draw("ab-xxxxxx-ab", "ab", "ab-", "-ab")).toMatchObject({ drawn: `[ab]-${M}-[ab]`, markerMatched: false });
  });

  it("does not match text that exists only where the visible ends join", () => {
    expect(draw("abc-hidden-xyz", "c...x", "abc", "xyz")).toMatchObject({ drawn: `abc${M}xyz`, markerMatched: false });
  });

  it("maps onto the cut the search made when periods beside the marker allow another split", () => {
    // The visible string "release......final.txt" also reads as "release..." + M + "final.txt";
    // the search kept ".final.txt", so ".f" is visible and the marker stays plain.
    expect(draw("release...notes...final.txt", ".f", "release..", ".final.txt")).toMatchObject({
      drawn: `release..${M}[.f]inal.txt`,
      markerMatched: false,
    });
  });

  it("highlights the marker when the visible string is the marker alone", () => {
    expect(draw("report.pdf", "pdf", "")).toMatchObject({ drawn: `{${M}}`, markerMatched: true });
  });

  it("keeps grapheme clusters whole at the cut", () => {
    const family = "👨‍👩‍👧";
    const text = `${family}${family}-notes.txt`;
    expect(draw(text, family, family, ".txt")).toMatchObject({ drawn: `[${family}]{${M}}.txt`, markerMatched: true });

    const accented = "crème-brûlée.txt";
    expect(draw(accented, "ème", "crè", ".txt")).toMatchObject({
      drawn: `cr[è]{${M}}.txt`,
      markerMatched: true,
    });
  });

  it("returns the visible string as the concatenation of its parts", () => {
    const text = "Quarterly-design-review.pdf";
    const visible = `Quart${M}w.pdf`;
    for (const query of ["q", "r", "design", "review.pdf", "rt", "-", "pdf"]) {
      expect(draw(text, query, "Quart", "w.pdf").plain, query).toBe(visible);
    }
  });
});

describe("the cut the search measures", () => {
  // The DOM probe draws a candidate's highlight from its cut, so every
  // candidate that holds the marker must arrive with the cut that makes it.
  for (const mode of ["middle", "end"] as const) it(`comes with every ${mode} candidate`, () => {
    const text = "oak-collection-spring-lookbook-2026-final-print-oak.pdf";
    const calls: Array<[string, TruncationCut | undefined]> = [];
    truncatePrepared(
      { text, maxWidth: 24, mode, measureText: (value, cut) => { calls.push([value, cut]); return value.length; } },
      () => indexTextGraphemes(text),
    );
    const candidates = calls.filter(([value]) => value.includes(M));
    expect(candidates.length).toBeGreaterThan(1);
    for (const [value, cut] of candidates) {
      expect(cut).toBeDefined();
      expect(text.slice(0, cut!.prefixEnd) + M + text.slice(cut!.suffixStart)).toBe(value);
    }
  });
});

// The matching rule: case-insensitive by the Unicode lowercase mapping
// (locale-independent, not case folding), offsets always in the original
// string, and a match never splits a grapheme cluster or a character's
// lowercase form.
describe("the matching rule", () => {
  const matched = (text: string, query: string) =>
    highlightedTextParts(text, query).filter((part) => part.matched).map((part) => [part.start, part.text]);
  const boundaries = (text: string) => new Set([0, ...splitTextGraphemes(text).map((_, i, all) => all.slice(0, i + 1).join("").length)]);
  const splitsNothing = (text: string, query: string) => {
    const edges = boundaries(text);
    for (const part of highlightedTextParts(text, query)) {
      expect(edges.has(part.start) && edges.has(part.start + part.text.length)).toBe(true);
    }
  };

  it("keeps offsets in the original string when lowercasing changes the length (İ)", () => {
    expect(matched("İstanbul-design.pdf", "design")).toEqual([[9, "design"]]);
    expect(matched("İİİ.pdf", "pdf")).toEqual([[4, "pdf"]]);
    expect(matched("İZMİR.pdf", "İzmİr")).toEqual([[0, "İZMİR"]]);
    // Lowercase mapping, not Turkish folding: a dotless query "izmir" is not İZMİR.
    expect(matched("İZMİR.pdf", "izmir")).toEqual([]);
    expect(draw("İZMİR-report-final.pdf", "report", "İZMİR-report", ".pdf")).toMatchObject({
      drawn: "İZMİR-[report]....pdf",
      markerMatched: false,
    });
  });

  it("does not match part of a character's lowercase form", () => {
    // İ lowercases to i + U+0307; "i" alone is not İ.
    expect(matched("İZMİR", "i")).toEqual([]);
  });

  it("lowercases without case folding (ß)", () => {
    expect(matched("Straße.pdf", "STRAẞE")).toEqual([[0, "Straße"]]);
    expect(matched("Straße.pdf", "strasse")).toEqual([]);
  });

  it("never splits a grapheme cluster", () => {
    // A base letter carrying a combining mark is another character.
    expect(matched("créme", "e")).toEqual([[5, "e"]]);
    expect(matched("créme", "é")).toEqual([[2, "é"]]);
    // A person inside a family, half of each of two flags, a skin tone's base.
    expect(matched("family-👨‍👩‍👧-notes.txt", "👩")).toEqual([]);
    expect(matched("family-👨‍👩‍👧-notes.txt", "👨‍👩‍👧")).toEqual([[7, "👨‍👩‍👧"]]);
    expect(matched("flag-🇺🇦🇵🇱-list.csv", "🇦🇵")).toEqual([]);
    expect(matched("ok-👍🏽.png", "👍")).toEqual([]);
    for (const [text, query] of [["family-👨‍👩‍👧-notes.txt", "👩"], ["créme", "e"], ["flag-🇺🇦🇵🇱-list.csv", "🇦🇵"], ["a\r\nb", "\r"]]) {
      splitsNothing(text, query);
    }
    const family = "family-👨‍👩‍👧-notes.txt";
    expect(mapMatchesToCut(family, "👩", { prefixEnd: 7, suffixStart: family.indexOf("-notes") }).markerMatched).toBe(false);
  });

  it("matches the query literally, not as a pattern", () => {
    expect(matched("a.b*(c)[d]+.pdf", "(c)[d]+")).toEqual([[4, "(c)[d]+"]]);
    expect(matched("abc", ".*")).toEqual([]);
    expect(matched("a$b^c", "$B^")).toEqual([[1, "$b^"]]);
  });
});
