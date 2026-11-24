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

interface MatchRange {
  start: number;
  end: number;
}

// Every non-overlapping case-insensitive match of the trimmed query, left to right.
function findMatchRanges(text: string, query?: string): MatchRange[] {
  const normalizedQuery = query?.trim().toLowerCase() ?? "";
  if (!normalizedQuery) return [];
  const normalizedText = text.toLowerCase();
  const ranges: MatchRange[] = [];
  let matchIndex = normalizedText.indexOf(normalizedQuery);
  while (matchIndex >= 0) {
    const end = matchIndex + normalizedQuery.length;
    ranges.push({ start: matchIndex, end });
    matchIndex = normalizedText.indexOf(normalizedQuery, end);
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

export function highlightedTextParts(text: string, query?: string): HighlightedTextPart[] {
  const ranges = findMatchRanges(text, query);
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
): { parts: HighlightedTextPart[]; markerMatched: boolean } {
  if (!cut) return { parts: highlightedTextParts(text, query), markerMatched: false };
  const ranges = findMatchRanges(text, query);
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
): HighlightedTextPart[] {
  const runs: HighlightedTextPart[] = [];
  for (const part of mapMatchesToCut(text, query, cut).parts) {
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
