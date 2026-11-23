import { describe, expect, it } from "vitest";
import { findTruncationCut, highlightedTextParts, mapMatchesToCut } from "./highlight.js";
import { TRUNCATION_MARKER, truncateText } from "./truncation.js";

const M = TRUNCATION_MARKER;

// Renders mapped parts as a string: [x] for a highlighted run, {...} for a highlighted marker.
function draw(text: string, query: string, visible: string) {
  const cut = findTruncationCut(text, visible);
  const { parts, markerMatched } = mapMatchesToCut(text, query, cut);
  const drawn = parts
    .map((part) => (part.marker ? (part.matched ? `{${part.text}}` : part.text) : part.matched ? `[${part.text}]` : part.text))
    .join("");
  return { drawn, markerMatched, plain: parts.map((part) => part.text).join("") };
}

describe("findTruncationCut", () => {
  it("returns null for text that fits", () => {
    expect(findTruncationCut("report.pdf", "report.pdf")).toBeNull();
  });

  it("finds the prefix end of an end cut", () => {
    expect(findTruncationCut("report-final.pdf", `report${M}`)).toEqual({ prefixEnd: 6, suffixStart: 16 });
  });

  it("finds both edges of a middle cut", () => {
    expect(findTruncationCut("report-final.pdf", `rep${M}.pdf`)).toEqual({ prefixEnd: 3, suffixStart: 12 });
  });

  it("treats a marker-only result as cutting the whole text", () => {
    expect(findTruncationCut("report.pdf", M)).toEqual({ prefixEnd: 0, suffixStart: 10 });
  });

  it("separates the marker from periods the text itself holds next to the cut", () => {
    expect(findTruncationCut("Quarterly-design-review.pdf", `Qua${M}.pdf`)).toEqual({ prefixEnd: 3, suffixStart: 23 });
  });

  it("recovers every cut truncateText makes, grapheme clusters included", () => {
    const texts = [
      "Quarterly-design-review.pdf",
      "family-👨‍👩‍👧-and-👍🏽-notes.txt",
      "café-crème-brûlée.txt",
      "flag-🇺🇦🇵🇱-list.csv",
    ];
    for (const text of texts) {
      for (const mode of ["middle", "end"] as const) {
        for (let maxWidth = 4; maxWidth < text.length; maxWidth++) {
          const { text: visible, truncated } = truncateText({ maxWidth, measureText: (value) => value.length, mode, text });
          if (!truncated) continue;
          const cut = findTruncationCut(text, visible);
          expect(cut, `${mode} ${maxWidth} ${visible}`).not.toBeNull();
          expect(text.slice(0, cut!.prefixEnd) + M + text.slice(cut!.suffixStart)).toBe(visible);
          expect(cut!.prefixEnd).toBeLessThan(cut!.suffixStart);
        }
      }
    }
  });
});

describe("mapMatchesToCut", () => {
  it("highlights the full text as before when nothing is cut", () => {
    const { parts, markerMatched } = mapMatchesToCut("photo-photo.jpg", "photo", null);
    expect(parts).toEqual(highlightedTextParts("photo-photo.jpg", "photo"));
    expect(markerMatched).toBe(false);
  });

  it("keeps an empty query plain", () => {
    expect(draw("report-final.pdf", "  ", `report${M}`)).toEqual({ drawn: `report${M}`, markerMatched: false, plain: `report${M}` });
  });

  it("highlights a fully visible match in place, end cut", () => {
    expect(draw("report-final.pdf", "port", `report${M}`)).toMatchObject({ drawn: `re[port]${M}`, markerMatched: false });
  });

  it("highlights the marker for a fully cut match, end cut", () => {
    expect(draw("report-final.pdf", "final", `report${M}`)).toMatchObject({ drawn: `report{${M}}`, markerMatched: true });
  });

  it("highlights the marker for a fully cut match, middle cut", () => {
    expect(draw("Quarterly-design-review.pdf", "design", `Qua${M}.pdf`)).toMatchObject({
      drawn: `Qua{${M}}.pdf`,
      markerMatched: true,
    });
  });

  it("highlights the visible start and the marker for a match straddling the prefix cut", () => {
    expect(draw("report-final.pdf", "port-fi", `report${M}`)).toMatchObject({ drawn: `re[port]{${M}}`, markerMatched: true });
    expect(draw("report-final.pdf", "port-fi", `repor${M}.pdf`)).toMatchObject({ drawn: `re[por]{${M}}.pdf`, markerMatched: true });
  });

  it("highlights the marker and the visible end for a match straddling the suffix cut", () => {
    expect(draw("report-final.pdf", "al.p", `rep${M}l.pdf`)).toMatchObject({ drawn: `rep{${M}}[l.p]df`, markerMatched: true });
  });

  it("highlights both visible ends and the marker for a match spanning the whole cut", () => {
    expect(draw("report-final.pdf", "ort-final.p", `repo${M}.pdf`)).toMatchObject({
      drawn: `rep[o]{${M}}[.p]df`,
      markerMatched: true,
    });
  });

  it("maps several matches: visible ones in place, cut ones on one marker", () => {
    expect(draw("ab-ab-ab-ab-ab", "ab", `ab-${M}-ab`)).toMatchObject({
      drawn: `[ab]-{${M}}-[ab]`,
      markerMatched: true,
    });
  });

  it("leaves the marker plain when every match is visible", () => {
    expect(draw("ab-xxxxxx-ab", "ab", `ab-${M}-ab`)).toMatchObject({ drawn: `[ab]-${M}-[ab]`, markerMatched: false });
  });

  it("does not match text that exists only where the visible ends join", () => {
    expect(draw("abc-hidden-xyz", "c...x", `abc${M}xyz`)).toMatchObject({ drawn: `abc${M}xyz`, markerMatched: false });
  });

  it("highlights the marker when the visible string is the marker alone", () => {
    expect(draw("report.pdf", "pdf", M)).toMatchObject({ drawn: `{${M}}`, markerMatched: true });
  });

  it("keeps grapheme clusters whole at the cut", () => {
    const family = "👨‍👩‍👧";
    const text = `${family}${family}-notes.txt`;
    const visible = `${family}${M}.txt`;
    expect(draw(text, family, visible)).toMatchObject({ drawn: `[${family}]{${M}}.txt`, markerMatched: true });

    const accented = "crème-brûlée.txt";
    expect(draw(accented, "ème", `crè${M}.txt`)).toMatchObject({
      drawn: `cr[è]{${M}}.txt`,
      markerMatched: true,
    });
  });

  it("returns the visible string as the concatenation of its parts", () => {
    const text = "Quarterly-design-review.pdf";
    const visible = `Quart${M}w.pdf`;
    for (const query of ["q", "r", "design", "review.pdf", "rt", "-", "pdf"]) {
      expect(draw(text, query, visible).plain, query).toBe(visible);
    }
  });
});
