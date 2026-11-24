import {
  indexTextGraphemes,
  prefixEndOffset,
  slicePrefix,
  sliceSuffix,
  suffixStartOffset,
  type IndexedText,
} from "./graphemes.js";

export type TextTruncateMode = "middle" | "end";

export const TRUNCATION_MARKER = "...";
export const MAX_CACHED_WIDTHS = 256;
export const MAX_CACHED_CODE_UNITS = 32_768;

/**
 * Where the search cut the full text: the visible string is
 * `text.slice(0, prefixEnd) + TRUNCATION_MARKER + text.slice(suffixStart)`.
 * Offsets are UTF-16 code units on grapheme boundaries.
 */
export interface TruncationCut {
  prefixEnd: number;
  suffixStart: number;
}

/** The search's result: the visible string and, when it is cut, the cut. */
export interface TruncationResult {
  text: string;
  truncated: boolean;
  cut: TruncationCut | null;
}

type TruncateInput = {
  maxWidth: number;
  measureText: (value: string) => number;
  mode: TextTruncateMode;
  text: string;
};

/**
 * Measures a candidate. A candidate that holds the marker comes with the cut
 * that makes it, so a measurer can draw what the component renders for it.
 */
type CandidateMeasure = (value: string, cut?: TruncationCut) => number;

type PreparedInput = Omit<TruncateInput, "measureText"> & { measureText: CandidateMeasure };

export function truncateText(input: TruncateInput): { text: string; truncated: boolean } {
  const widths = new Map<string, number>();
  let cachedUnits = 0;
  const measureText = (value: string) => {
    const cached = widths.get(value);
    if (cached !== undefined) return cached;
    const width = input.measureText(value);
    if (widths.size >= MAX_CACHED_WIDTHS || cachedUnits + value.length > MAX_CACHED_CODE_UNITS) {
      widths.clear();
      cachedUnits = 0;
    }
    if (value.length <= MAX_CACHED_CODE_UNITS) {
      widths.set(value, width);
      cachedUnits += value.length;
    }
    return width;
  };
  const { text, truncated } = truncatePrepared(
    { maxWidth: input.maxWidth, measureText, mode: input.mode, text: input.text },
    () => indexTextGraphemes(input.text),
  );
  return { text, truncated };
}

export function truncatePrepared(
  { maxWidth, measureText, mode, text }: PreparedInput,
  getIndexed: () => IndexedText,
): TruncationResult {
  if (!text || maxWidth <= 0) {
    return { text, truncated: false, cut: null };
  }
  const fullWidth = measureText(text);
  if (fullWidth <= maxWidth) {
    return { text, truncated: false, cut: null };
  }

  const markerWidth = measureText(TRUNCATION_MARKER, { prefixEnd: 0, suffixStart: text.length });
  if (markerWidth >= maxWidth) {
    return { text: TRUNCATION_MARKER, truncated: true, cut: { prefixEnd: 0, suffixStart: text.length } };
  }

  const indexed = getIndexed();
  if (mode === "end") {
    const prefixCount = takePrefixThatFits({
      fullWidth,
      indexed,
      markerWidth,
      maxWidth,
      measureText,
    });
    return {
      text: `${slicePrefix(indexed, prefixCount)}${TRUNCATION_MARKER}`,
      truncated: true,
      cut: { prefixEnd: prefixEndOffset(indexed, prefixCount), suffixStart: text.length },
    };
  }

  return measuredMiddleTruncate({
    fullWidth,
    indexed,
    markerWidth,
    maxWidth,
    measureText,
  });
}

// Finds the largest count in [0, maxCount] where measureCount(count) <= targetBudget.
// Uses an interpolated initial probe + one secant refinement + galloping bracket
// before binary search, converging in 2-3 calls for typical fonts while remaining
// O(log k) and never probing long prefixes on narrow containers.
function findMaxFittingCount(
  maxCount: number,
  targetBudget: number,
  initialGuess: number,
  baseOffset: number,
  measureCount: (count: number) => number,
): number {
  if (maxCount <= 0 || targetBudget <= baseOffset) return 0;

  let low = 0;
  let high = maxCount;
  const probe = Math.max(1, Math.min(maxCount, initialGuess));
  const width = measureCount(probe);

  if (width <= targetBudget) {
    low = probe;
    if (low === high) return low;

    const delta = width - baseOffset;
    if (delta > 0) {
      const scaled = Math.floor(probe * ((targetBudget - baseOffset) / delta));
      if (scaled > low + 1 && scaled <= high) {
        if (measureCount(scaled) <= targetBudget) {
          low = scaled;
          if (low === high) return low;
        } else {
          high = scaled - 1;
        }
      }
    }

    let step = 1;
    while (low < high) {
      const next = Math.min(high, low + step);
      if (measureCount(next) <= targetBudget) {
        low = next;
        step *= 2;
      } else {
        high = next - 1;
        break;
      }
    }
  } else {
    high = probe - 1;
    if (high <= 0) return 0;

    const delta = width - baseOffset;
    const scaled = delta > 0
      ? Math.max(1, Math.min(high, Math.floor(probe * ((targetBudget - baseOffset) / delta))))
      : Math.max(1, high >>> 1);
    if (measureCount(scaled) <= targetBudget) {
      low = scaled;
      let step = 1;
      while (low < high) {
        const next = Math.min(high, low + step);
        if (measureCount(next) <= targetBudget) {
          low = next;
          step *= 2;
        } else {
          high = next - 1;
          break;
        }
      }
    } else {
      high = scaled - 1;
      let step = 1;
      while (high > low && step < high) {
        const next = Math.max(1, high - step + 1);
        if (next <= low) break;
        if (measureCount(next) <= targetBudget) {
          low = next;
          break;
        }
        high = next - 1;
        step *= 2;
      }
    }
  }

  while (low < high) {
    const mid = (low + high + 1) >>> 1;
    if (measureCount(mid) <= targetBudget) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low;
}

function measuredMiddleTruncate({
  fullWidth,
  indexed,
  markerWidth,
  maxWidth,
  measureText,
}: {
  fullWidth: number;
  indexed: IndexedText;
  markerWidth: number;
  maxWidth: number;
  measureText: CandidateMeasure;
}): TruncationResult {
  const maxEdge = indexed.length - 1;
  if (maxEdge <= 0) {
    return { text: TRUNCATION_MARKER, truncated: true, cut: { prefixEnd: 0, suffixStart: indexed.text.length } };
  }

  const prefixWidths = createEdgeWidths(indexed, measureText, false);
  const suffixWidths = createEdgeWidths(indexed, measureText, true);

  const halfBudget = (maxWidth - markerWidth) / 2;
  const initialGuess = fullWidth > 0 ? Math.floor((halfBudget / fullWidth) * indexed.length) : 1;

  let prefixCount = findMaxFittingCount(maxEdge, halfBudget, initialGuess, 0, prefixWidths);
  let suffixCount = findMaxFittingCount(maxEdge, halfBudget, initialGuess, 0, suffixWidths);

  const fits = (nextPrefixCount: number, nextSuffixCount: number) =>
    nextPrefixCount + nextSuffixCount < indexed.length
    && measureText(
      slicePrefix(indexed, nextPrefixCount)
        + TRUNCATION_MARKER
        + sliceSuffix(indexed, nextSuffixCount),
      { prefixEnd: prefixEndOffset(indexed, nextPrefixCount), suffixStart: suffixStartOffset(indexed, nextSuffixCount) },
    ) <= maxWidth;

  // Shrink if combined edges + marker exceed maxWidth (e.g. shaping/kerning at
  // the marker boundary) or leave no hidden grapheme. On ties, shrink prefix so
  // suffix keeps the extra grapheme just like the balanced growth tie-breaker.
  while (!fits(prefixCount, suffixCount) && (prefixCount > 0 || suffixCount > 0)) {
    if (prefixCount > 0 && (suffixCount === 0 || prefixWidths(prefixCount) >= suffixWidths(suffixCount))) {
      prefixCount -= 1;
    } else {
      suffixCount -= 1;
    }
  }

  while (true) {
    const canGrowPrefix = fits(prefixCount + 1, suffixCount);
    const canGrowSuffix = fits(prefixCount, suffixCount + 1);

    if (!canGrowPrefix && !canGrowSuffix) break;

    if (canGrowPrefix && canGrowSuffix) {
      const prefixBalance = Math.abs(prefixWidths(prefixCount + 1) - suffixWidths(suffixCount));
      const suffixBalance = Math.abs(prefixWidths(prefixCount) - suffixWidths(suffixCount + 1));

      if (prefixBalance < suffixBalance) {
        prefixCount += 1;
      } else if (suffixBalance < prefixBalance) {
        suffixCount += 1;
      } else if (prefixWidths(prefixCount) < suffixWidths(suffixCount)) {
        prefixCount += 1;
      } else {
        suffixCount += 1;
      }
      continue;
    }

    if (canGrowPrefix) {
      prefixCount += 1;
    } else {
      suffixCount += 1;
    }
  }

  return {
    text: `${slicePrefix(indexed, prefixCount)}${TRUNCATION_MARKER}${sliceSuffix(indexed, suffixCount)}`,
    truncated: true,
    cut: { prefixEnd: prefixEndOffset(indexed, prefixCount), suffixStart: suffixStartOffset(indexed, suffixCount) },
  };
}

// Only the visible edges need measuring. Eagerly preparing every prefix and
// suffix makes a narrow filename cost quadratic text work in its full length.
function createEdgeWidths(
  indexed: IndexedText,
  measureText: CandidateMeasure,
  fromEnd: boolean,
) {
  const widths = new Map<number, number>([[0, 0]]);
  return (count: number) => {
    const cached = widths.get(count);
    if (cached !== undefined) return cached;
    const value = fromEnd ? sliceSuffix(indexed, count) : slicePrefix(indexed, count);
    const width = measureText(value);
    widths.set(count, width);
    return width;
  };
}

function takePrefixThatFits({
  fullWidth,
  indexed,
  markerWidth,
  maxWidth,
  measureText,
}: {
  fullWidth: number;
  indexed: IndexedText;
  markerWidth: number;
  maxWidth: number;
  measureText: CandidateMeasure;
}) {
  const initialGuess = fullWidth > 0 ? Math.floor(((maxWidth - markerWidth) / fullWidth) * indexed.length) : 1;
  // At most every grapheme but one: a cut hides at least one, as in middle mode.
  return findMaxFittingCount(
    indexed.length - 1,
    maxWidth,
    initialGuess,
    markerWidth,
    (count) => measureText(slicePrefix(indexed, count) + TRUNCATION_MARKER, {
      prefixEnd: prefixEndOffset(indexed, count),
      suffixStart: indexed.text.length,
    }),
  );
}
