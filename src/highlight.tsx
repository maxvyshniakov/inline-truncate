import { indexTextGraphemes, NON_ASCII_OR_CR } from "./graphemes.js";
import { TRUNCATION_MARKER, type TruncationCut } from "./truncation.js";

export const HIGHLIGHT_CLASS_NAME =
  "relative isolate rounded-[2px] text-[var(--text-truncate-highlight-foreground,currentColor)] before:pointer-events-none before:absolute before:inset-x-0 before:inset-y-0 before:-z-10 before:rounded-[2px] before:bg-[var(--text-truncate-highlight-background,#fde68a)]";

export interface HighlightedTextPart {
  /** Offset of `text` in the full string; for the marker, the prefix end. */
  start: number;
  text: string;
  matched: boolean;
  /** The truncation marker standing in for the cut part. */
  marker?: boolean;
}

export interface MatchRange {
  start: number;
  end: number;
}

// In ASCII without CR (NON_ASCII_OR_CR, graphemes.ts), lowercasing keeps every
// length and every index is a grapheme boundary, so matches need no mapping.

// Lowercases code point by code point and records, for every index of the
// lowercase string that starts a code point's lowercase form, the original
// index it came from (-1 inside a form that grew, as İ -> i + U+0307).
// One code point's lowercase form for matching. Σ lowercases to ς at the
// end of a word and σ elsewhere, so both sigmas match as one letter; ς and σ
// are one code unit each, so offsets stay exact.
function lowercaseForMatch(codePoint: string) {
  const form = codePoint.toLowerCase();
  return form === "ς" ? "σ" : form;
}

function lowercaseWithOrigins(text: string) {
  let lower = "";
  const origins: number[] = [];
  for (let index = 0; index < text.length;) {
    const codePoint = String.fromCodePoint(text.codePointAt(index)!);
    const form = lowercaseForMatch(codePoint);
    origins.push(index);
    for (let extra = 1; extra < form.length; extra++) origins.push(-1);
    lower += form;
    index += codePoint.length;
  }
  origins.push(text.length);
  return { lower, origins };
}

function lowercaseCodePoints(value: string) {
  let lower = "";
  for (const codePoint of value) lower += lowercaseForMatch(codePoint);
  return lower;
}

/**
 * Every non-overlapping match of the trimmed query, left to right. The rule:
 * case-insensitive by the Unicode lowercase mapping, the same in every locale
 * and without case folding (ß does not match "ss"), with ς and σ as one
 * letter; offsets are in `text`; a
 * match never splits a grapheme cluster or a character's lowercase form, so a
 * candidate that would is skipped.
 */
export function findMatchRanges(text: string, query?: string): MatchRange[] {
  const trimmed = query?.trim() ?? "";
  if (!trimmed) return [];
  const ranges: MatchRange[] = [];
  if (!NON_ASCII_OR_CR.test(text) && !NON_ASCII_OR_CR.test(trimmed)) {
    const normalizedText = text.toLowerCase();
    const normalizedQuery = trimmed.toLowerCase();
    let matchIndex = normalizedText.indexOf(normalizedQuery);
    while (matchIndex >= 0) {
      const end = matchIndex + normalizedQuery.length;
      ranges.push({ start: matchIndex, end });
      matchIndex = normalizedText.indexOf(normalizedQuery, end);
    }
    return ranges;
  }
  const { lower, origins } = lowercaseWithOrigins(text);
  const normalizedQuery = lowercaseCodePoints(trimmed);
  // Grapheme boundaries; null when every index is one (ASCII text without CR
  // reaches here when only the query is non-ASCII, as the Kelvin sign is).
  let boundaries: Set<number> | null | undefined;
  let matchIndex = lower.indexOf(normalizedQuery);
  while (matchIndex >= 0) {
    const start = origins[matchIndex];
    const end = origins[matchIndex + normalizedQuery.length];
    if (boundaries === undefined) {
      const { offsets } = indexTextGraphemes(text);
      boundaries = offsets ? new Set(offsets) : null;
    }
    if (start >= 0 && end >= 0 && (!boundaries || (boundaries.has(start) && boundaries.has(end)))) {
      ranges.push({ start, end });
      matchIndex = lower.indexOf(normalizedQuery, matchIndex + normalizedQuery.length);
    } else {
      matchIndex = lower.indexOf(normalizedQuery, matchIndex + 1);
    }
  }
  return ranges;
}

// Splits text[from, to) into plain and matched parts, clipping each range to the window.
function pushWindowParts(
  parts: HighlightedTextPart[],
  text: string,
  ranges: readonly MatchRange[],
  from: number,
  to: number,
) {
  let cursor = from;
  for (const range of ranges) {
    const start = Math.max(range.start, from);
    const end = Math.min(range.end, to);
    if (start >= end) continue;
    if (start > cursor) parts.push({ text: text.slice(cursor, start), matched: false, start: cursor });
    parts.push({ text: text.slice(start, end), matched: true, start });
    cursor = end;
  }
  if (cursor < to) parts.push({ text: text.slice(cursor, to), matched: false, start: cursor });
}

export function highlightedTextParts(
  text: string,
  query?: string,
  ranges: readonly MatchRange[] = findMatchRanges(text, query),
): HighlightedTextPart[] {
  if (ranges.length === 0) return [{ text, matched: false, start: 0 }];
  const parts: HighlightedTextPart[] = [];
  pushWindowParts(parts, text, ranges, 0, text.length);
  return parts;
}

/**
 * Maps matches found in the full text onto the visible string of a cut.
 * Parts come in visible order: the prefix, the marker, the suffix. A match's
 * visible portion is highlighted where it stands; the marker is highlighted
 * when any match intersects the cut part. With no cut, the full text is
 * highlighted as `highlightedTextParts` does.
 */
export function mapMatchesToCut(
  text: string,
  query: string | undefined,
  cut: TruncationCut | null,
  ranges: readonly MatchRange[] = findMatchRanges(text, query),
): { parts: HighlightedTextPart[]; markerMatched: boolean } {
  if (!cut) return { parts: highlightedTextParts(text, query), markerMatched: false };
  const markerMatched = ranges.some((range) => range.start < cut.suffixStart && range.end > cut.prefixEnd);
  const parts: HighlightedTextPart[] = [];
  pushWindowParts(parts, text, ranges, 0, cut.prefixEnd);
  parts.push({ text: TRUNCATION_MARKER, matched: markerMatched, start: cut.prefixEnd, marker: true });
  pushWindowParts(parts, text, ranges, cut.suffixStart, text.length);
  return { parts, markerMatched };
}

/**
 * The runs a cut's visible string is drawn in: mapped parts with adjacent
 * plain parts (the marker included when it is not highlighted) joined into
 * one. Engines shape each text node apart, so the component renders these
 * runs and the DOM measurement probe measures the same ones.
 */
export function cutHighlightRuns(
  text: string,
  query: string | undefined,
  cut: TruncationCut,
  ranges?: readonly MatchRange[],
): HighlightedTextPart[] {
  const runs: HighlightedTextPart[] = [];
  for (const part of mapMatchesToCut(text, query, cut, ranges).parts) {
    const previous = runs.at(-1);
    if (!part.matched && previous && !previous.matched) {
      runs[runs.length - 1] = { start: previous.start, text: previous.text + part.text, matched: false };
    } else {
      runs.push(part);
    }
  }
  return runs;
}

export function HighlightedMatchText({
  query,
  text,
}: {
  query?: string;
  text: string;
}) {
  const parts = highlightedTextParts(text, query);
  if (parts.length === 1 && !parts[0].matched) return text;
  return (
    <>
      {parts.map((part) =>
        part.matched ? (
          <span key={part.start} data-slot="highlighted-match" className={HIGHLIGHT_CLASS_NAME}>
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/**
 * The visible string of a cut, with matches found in the full text: visible
 * portions highlighted in place, the marker highlighted for any match in the
 * cut part. `cut` comes from the truncation search, which knows it exactly.
 * The DOM measurement probe draws the same runs (`cutHighlightRuns`).
 */
export function CutHighlightedText({
  cut,
  query,
  text,
}: {
  cut: TruncationCut;
  query?: string;
  text: string;
}) {
  return (
    <>
      {cutHighlightRuns(text, query, cut).map((part) =>
        part.matched ? (
          <span
            key={part.start}
            data-slot="highlighted-match"
            data-truncate-marker={part.marker ? "" : undefined}
            className={HIGHLIGHT_CLASS_NAME}
          >
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
