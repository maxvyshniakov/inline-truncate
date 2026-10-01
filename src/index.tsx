"use client";

import React from "react";
import type { ReactNode } from "react";
import { createCanvasTextMeasurer } from "@skipstery/inline-measure";
import { cn } from "cn";

export type TextTruncateMode = "middle" | "end";
export type TextTruncateStrategy = "auto" | "css" | "measure";
export type TextTruncateEllipsis = "end" | "start";

const TRUNCATION_MARKER = "...";
const HIGHLIGHT_CLASS_NAME =
  "relative isolate rounded-[2px] text-[var(--text-truncate-highlight-foreground,currentColor)] before:pointer-events-none before:absolute before:inset-x-0 before:inset-y-0 before:-z-10 before:rounded-[2px] before:bg-[var(--text-truncate-highlight-background,#fde68a)]";

export function splitTextGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (segment) => segment.segment);
  }

  return Array.from(text);
}

export function truncateText({
  maxWidth,
  measureText,
  mode,
  text,
}: {
  maxWidth: number;
  measureText: (value: string) => number;
  mode: TextTruncateMode;
  text: string;
}): { text: string; truncated: boolean } {
  if (!text || maxWidth <= 0 || measureText(text) <= maxWidth) {
    return { text, truncated: false };
  }

  const markerWidth = measureText(TRUNCATION_MARKER);
  if (markerWidth >= maxWidth) {
    return { text: TRUNCATION_MARKER, truncated: true };
  }

  const graphemes = splitTextGraphemes(text);
  if (mode === "end") {
    const prefix = takePrefixThatFits({
      graphemes,
      maxWidth: maxWidth - markerWidth,
      measureText,
    });
    return {
      text: `${prefix}${TRUNCATION_MARKER}`,
      truncated: true,
    };
  }

  return measuredMiddleTruncate({
    graphemes,
    maxWidth,
    measureText,
    markerWidth,
  });
}

function measuredMiddleTruncate({
  graphemes,
  markerWidth,
  maxWidth,
  measureText,
}: {
  graphemes: string[];
  markerWidth: number;
  maxWidth: number;
  measureText: (value: string) => number;
}) {
  let prefixCount = 0;
  let suffixCount = 0;
  const prefixWidths = createPrefixWidths(graphemes, measureText);
  const suffixWidths = createSuffixWidths(graphemes, measureText);

  const hasHiddenGrapheme = (nextPrefixCount: number, nextSuffixCount: number) =>
    nextPrefixCount + nextSuffixCount < graphemes.length;

  const fits = (nextPrefixCount: number, nextSuffixCount: number) =>
    hasHiddenGrapheme(nextPrefixCount, nextSuffixCount) &&
    prefixWidths[nextPrefixCount] + markerWidth + suffixWidths[nextSuffixCount] <= maxWidth;

  while (true) {
    const canGrowPrefix = fits(prefixCount + 1, suffixCount);
    const canGrowSuffix = fits(prefixCount, suffixCount + 1);

    if (!canGrowPrefix && !canGrowSuffix) break;

    if (canGrowPrefix && canGrowSuffix) {
      const prefixBalance = Math.abs(prefixWidths[prefixCount + 1] - suffixWidths[suffixCount]);
      const suffixBalance = Math.abs(prefixWidths[prefixCount] - suffixWidths[suffixCount + 1]);

      if (prefixBalance < suffixBalance) {
        prefixCount += 1;
      } else if (suffixBalance < prefixBalance) {
        suffixCount += 1;
      } else if (prefixWidths[prefixCount] < suffixWidths[suffixCount]) {
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
    text: `${graphemes.slice(0, prefixCount).join("")}${TRUNCATION_MARKER}${graphemes
      .slice(graphemes.length - suffixCount)
      .join("")}`,
    truncated: true,
  };
}

function createPrefixWidths(graphemes: string[], measureText: (value: string) => number) {
  return graphemes.reduce<number[]>(
    (widths, _grapheme, index) => {
      widths.push(measureText(graphemes.slice(0, index + 1).join("")));
      return widths;
    },
    [0],
  );
}

function createSuffixWidths(graphemes: string[], measureText: (value: string) => number) {
  return graphemes.reduce<number[]>(
    (widths, _grapheme, index) => {
      widths.push(measureText(graphemes.slice(graphemes.length - index - 1).join("")));
      return widths;
    },
    [0],
  );
}

function takePrefixThatFits({
  graphemes,
  maxWidth,
  measureText,
}: {
  graphemes: string[];
  maxWidth: number;
  measureText: (value: string) => number;
}) {
  let low = 0;
  let high = graphemes.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measureText(graphemes.slice(0, mid).join("")) <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return graphemes.slice(0, low).join("");
}

function resolveTextTruncateStrategy({
  mode,
  strategy,
}: {
  mode: TextTruncateMode;
  strategy: TextTruncateStrategy;
}) {
  if (strategy !== "auto") return strategy;
  return mode === "middle" ? "measure" : "css";
}

export function HighlightedMatchText({
  query,
  text,
}: {
  query?: string;
  text: string;
}) {
  const normalizedQuery = query?.trim().toLowerCase() ?? "";
  if (!normalizedQuery) return text;

  const normalizedText = text.toLowerCase();
  const firstMatchIndex = normalizedText.indexOf(normalizedQuery);
  if (firstMatchIndex < 0) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = normalizedText.indexOf(normalizedQuery, cursor);

  while (matchIndex >= 0) {
    if (matchIndex > cursor) {
      parts.push(text.slice(cursor, matchIndex));
    }

    const matchEnd = matchIndex + normalizedQuery.length;
    parts.push(
      <span
        key={`${matchIndex}-${matchEnd}`}
        data-slot="highlighted-match"
        className={HIGHLIGHT_CLASS_NAME}
      >
        {text.slice(matchIndex, matchEnd)}
      </span>,
    );

    cursor = matchEnd;
    matchIndex = normalizedText.indexOf(normalizedQuery, cursor);
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts}</>;
}

// Reading `document.fonts.ready` is surprisingly expensive — it can flush font
// and layout work — and `TextTruncate` mounts once per virtualized row, so a
// fast scroll hits this getter hundreds of times. Once the document's fonts are
// loaded there is nothing left to wait for, so skip the access entirely; while
// they are still loading, share a single promise across every instance.
let pendingFontsReady: Promise<unknown> | null | undefined;
function getPendingFontsReady(): Promise<unknown> | null {
  if (typeof document === "undefined" || !document.fonts) return null;
  if (document.fonts.status === "loaded") return null;
  if (pendingFontsReady === undefined) {
    pendingFontsReady = document.fonts.ready;
    // Reset after this load cycle so a later font load can be awaited again.
    void pendingFontsReady.then(() => {
      pendingFontsReady = undefined;
    });
  }
  return pendingFontsReady ?? null;
}

export function TextTruncate({
  className,
  ellipsis = "end",
  measureExtra,
  mode,
  query,
  strategy = "auto",
  text,
}: {
  className?: string;
  ellipsis?: TextTruncateEllipsis;
  measureExtra?: string | number;
  mode: TextTruncateMode;
  query?: string;
  strategy?: TextTruncateStrategy;
  text: string;
}) {
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const [truncatedText, setTruncatedText] = React.useState(text);
  const resolvedStrategy = resolveTextTruncateStrategy({ mode, strategy });

  React.useLayoutEffect(() => {
    if (resolvedStrategy !== "measure") return undefined;

    const element = textRef.current;
    if (!element) return undefined;
    let rafId = 0;

    const update = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        const width = element.clientWidth || element.getBoundingClientRect().width;
        if (width <= 0) {
          setTruncatedText(text);
          return;
        }

        const computed = window.getComputedStyle(element);
        const next = truncateText({
          text,
          maxWidth: width,
          mode,
          measureText: createCanvasTextMeasurer(computed),
        });
        setTruncatedText(next.text);
      });
    };

    update();

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);

    getPendingFontsReady()?.then(update);

    return () => {
      window.cancelAnimationFrame(rafId);
      observer?.disconnect();
    };
  }, [mode, resolvedStrategy, text]);

  const renderedText = resolvedStrategy === "measure" ? truncatedText : text;
  const isTruncated = resolvedStrategy === "measure" && truncatedText !== text;
  const content = <HighlightedMatchText text={renderedText} query={query} />;
  const shouldUseStartEllipsis = resolvedStrategy === "css" && ellipsis === "start";

  return (
    <span
      ref={textRef}
      className={cn(
        resolvedStrategy === "css"
          ? cn("block w-full min-w-0 truncate", shouldUseStartEllipsis && "[direction:rtl]")
          : "block w-full min-w-0 overflow-hidden whitespace-nowrap",
        className,
      )}
      data-tip-align={shouldUseStartEllipsis ? "end" : undefined}
      data-truncate=""
      data-truncate-measure-extra={measureExtra}
      data-truncate-mode={mode}
      data-truncate-original={text}
      data-truncate-overflow-target={shouldUseStartEllipsis ? ":scope > bdi" : undefined}
      data-truncate-state={isTruncated ? "truncated" : undefined}
      data-truncate-strategy={resolvedStrategy}
    >
      {shouldUseStartEllipsis ? <bdi>{content}</bdi> : content}
    </span>
  );
}
