"use client";

import React from "react";
import { createMeasurementSession, hasEmoji } from "./measurement.js";
import {highlightedTextParts,HIGHLIGHT_CLASS_NAME} from "./highlight.js";
import { cn } from "cn";

export type TextTruncateMode = "middle" | "end";
export type TextTruncateStrategy = "auto" | "css" | "measure";
export type TextTruncateEllipsis = "end" | "start";

const TRUNCATION_MARKER = "...";
const MAX_CACHED_WIDTHS = 256;
const MAX_CACHED_CODE_UNITS = 32_768;


export function splitTextGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (segment) => segment.segment);
  }

  return Array.from(text);
}

type TruncateInput = {
  maxWidth: number;
  measureText: (value: string) => number;
  mode: TextTruncateMode;
  text: string;
};

export function truncateText(input: TruncateInput): {text:string;truncated:boolean} {
  return truncatePrepared(input, () => splitTextGraphemes(input.text));
}

function truncatePrepared({
  maxWidth,
  measureText: measureInput,
  mode,
  text,
}: TruncateInput, getGraphemes: () => string[]): { text: string; truncated: boolean } {
  const widths = new Map<string, number>();
  let cachedUnits = 0;
  const measureText = (value: string) => {
    const cached = widths.get(value);
    if (cached !== undefined) return cached;
    const width = measureInput(value);
    if (widths.size >= MAX_CACHED_WIDTHS || cachedUnits + value.length > MAX_CACHED_CODE_UNITS) {
      widths.clear(); cachedUnits = 0;
    }
    if (value.length <= MAX_CACHED_CODE_UNITS) { widths.set(value, width); cachedUnits += value.length; }
    return width;
  };
  if (!text || maxWidth <= 0 || measureText(text) <= maxWidth) {
    return { text, truncated: false };
  }

  const markerWidth = measureText(TRUNCATION_MARKER);
  if (markerWidth >= maxWidth) {
    return { text: TRUNCATION_MARKER, truncated: true };
  }

  const graphemes = getGraphemes();
  if (mode === "end") {
    const prefix = takePrefixThatFits({
      graphemes,
      maxWidth,
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
  });
}

function measuredMiddleTruncate({
  graphemes,
  maxWidth,
  measureText,
}: {
  graphemes: string[];
  maxWidth: number;
  measureText: (value: string) => number;
}) {
  let prefixCount = 0;
  let suffixCount = 0;
  const prefixWidths = createEdgeWidths(graphemes, measureText, false);
  const suffixWidths = createEdgeWidths(graphemes, measureText, true);

  const hasHiddenGrapheme = (nextPrefixCount: number, nextSuffixCount: number) =>
    nextPrefixCount + nextSuffixCount < graphemes.length;

  const fits = (nextPrefixCount: number, nextSuffixCount: number) =>
    hasHiddenGrapheme(nextPrefixCount, nextSuffixCount) &&
    measureText(graphemes.slice(0, nextPrefixCount).join("") + TRUNCATION_MARKER
      + (nextSuffixCount ? graphemes.slice(graphemes.length - nextSuffixCount).join("") : "")) <= maxWidth;

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
    text: `${graphemes.slice(0, prefixCount).join("")}${TRUNCATION_MARKER}${graphemes
      .slice(graphemes.length - suffixCount)
      .join("")}`,
    truncated: true,
  };
}

// Only the visible edges need measuring. Eagerly preparing every prefix and
// suffix makes a narrow filename cost quadratic text work in its full length.
function createEdgeWidths(
  graphemes: string[],
  measureText: (value: string) => number,
  fromEnd: boolean,
) {
  const widths = new Map<number, number>([[0, 0]]);
  return (count: number) => {
    const cached = widths.get(count);
    if (cached !== undefined) return cached;
    const value = fromEnd
      ? graphemes.slice(graphemes.length - count).join("")
      : graphemes.slice(0, count).join("");
    const width = measureText(value);
    widths.set(count, width);
    return width;
  };
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
    if (measureText(graphemes.slice(0, mid).join("") + TRUNCATION_MARKER) <= maxWidth) {
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
  const parts = highlightedTextParts(text,query);
  if (parts.length === 1 && !parts[0].matched) return text;
  return <>{parts.map(part => part.matched
    ? <span key={part.start} data-slot="highlighted-match" className={HIGHLIGHT_CLASS_NAME}>{part.text}</span>
    : part.text)}</>;

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
    let active = true;
    let graphemes: string[] | undefined;
    let styleSignature = "";
    let completedWidth: number | undefined;
    const widths = new Map<string, number>();
    const verifiedWidths = new Map<string,number>();
    let cachedUnits = 0;
    let verifiedUnits = 0;
    const invalidate = () => {
      completedWidth = undefined;
      styleSignature = ""; widths.clear(); cachedUnits = 0;
      verifiedWidths.clear(); verifiedUnits = 0;
    };

    const update = () => {
      if (!active) return;
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        let width = element.clientWidth || element.getBoundingClientRect().width;
        if (width <= 0) {
          completedWidth = undefined;
          setTruncatedText(text);
          return;
        }

        const computed = window.getComputedStyle(element);
        width -= (Number.parseFloat(computed.paddingLeft) || 0) + (Number.parseFloat(computed.paddingRight) || 0);
        if (width <= 0) {completedWidth = undefined;setTruncatedText(text);return;}
        const signature = [computed.font, computed.fontFamily, computed.fontSize,
          computed.fontWeight, computed.fontStyle, computed.fontKerning, computed.fontStretch,
          computed.fontVariantCaps, computed.letterSpacing, computed.fontFeatureSettings,
          computed.fontVariationSettings, computed.fontVariantNumeric, computed.fontOpticalSizing, computed.wordSpacing,
          computed.textTransform, computed.direction,
          element.closest("[lang]")?.getAttribute("lang") ?? element.ownerDocument.documentElement.lang,
          String(window.devicePixelRatio)].join("\u001f");
        if (signature !== styleSignature) {
          invalidate();
          styleSignature = signature;
        }
        // RO may report only height changes, including our own cut. Validate
        // live typography first; font/DPR events invalidate completion too.
        if (completedWidth === width) return;
        const session = createMeasurementSession(element,computed,query);
        const commit = (value: string) => {completedWidth = width;setTruncatedText(value);};
        const measureText = (value: string) => {
          const cached = widths.get(value);
          if (cached !== undefined) return cached;
          const width = session.measureText(value);
          // Component-local, bounded by both entries and retained text size.
          // Evict between measurements; no global strings survive unmount.
          if (widths.size >= MAX_CACHED_WIDTHS || cachedUnits + value.length > MAX_CACHED_CODE_UNITS) {
            widths.clear(); cachedUnits = 0;
          }
          if (value.length <= MAX_CACHED_CODE_UNITS) { widths.set(value, width); cachedUnits += value.length; }
          return width;
        };
        try {
          if (!session.verifyText) {
            const next=truncatePrepared({text,maxWidth:width,mode,measureText},
              () => graphemes ??= splitTextGraphemes(text));
            commit(next.text);
            return;
          }
          const select = (budget:number,measure=measureText) => truncatePrepared({text,maxWidth:budget,mode,measureText:measure},
            () => graphemes ??= splitTextGraphemes(text));
          const verify = (value:string) => {
            const cached=verifiedWidths.get(value);
            if (cached !== undefined) return cached;
            const actual=session.verifyText?.(value);
            if (actual === undefined) return undefined;
            if (verifiedWidths.size >= MAX_CACHED_WIDTHS || verifiedUnits + value.length > MAX_CACHED_CODE_UNITS) {
              verifiedWidths.clear(); verifiedUnits=0;
            }
            if (value.length <= MAX_CACHED_CODE_UNITS) {verifiedWidths.set(value,actual);verifiedUnits+=value.length;}
            return actual;
          };
          let next=select(width);
          let budget=width;
          for (let refinement=0;;refinement++) {
            const actual=verify(next.text);
            if (next.text === TRUNCATION_MARKER || actual === undefined || actual <= width) break;
            if (refinement >= 2) {
              next=select(width,session.measureExact!);
              verify(next.text);
              break;
            }
            budget=Math.min(budget,width-(actual-measureText(next.text)));
            if (budget <= 0) {
              next=select(width,session.measureExact!);
              verify(next.text);
              break;
            }
            next=select(budget);
          }
          commit(next.text);
        } finally { session.dispose(); }
      });
    };

    update();

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);

    const fontsChanged = () => { invalidate(); update(); };
    const fontsLoading = () => { getPendingFontsReady()?.then(fontsChanged); };
    fontsLoading();
    document.fonts?.addEventListener?.("loading", fontsLoading);
    document.fonts?.addEventListener?.("loadingdone", fontsChanged);

    let resolutionQuery: MediaQueryList | undefined;
    const resolutionChanged = () => {
      if (!active) return;
      invalidate(); update(); bindResolution();
    };
    const bindResolution = () => {
      resolutionQuery?.removeEventListener?.("change",resolutionChanged);
      resolutionQuery=window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
      resolutionQuery?.addEventListener?.("change",resolutionChanged);
    };
    if (hasEmoji(text)) bindResolution();

    return () => {
      active = false;
      window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      document.fonts?.removeEventListener?.("loading", fontsLoading);
      document.fonts?.removeEventListener?.("loadingdone", fontsChanged);
      resolutionQuery?.removeEventListener?.("change",resolutionChanged);
    };
  }, [className, mode, query, resolvedStrategy, text]);

  const renderedText = resolvedStrategy === "measure" ? truncatedText : text;
  const isTruncated = resolvedStrategy === "measure" && truncatedText !== text;
  // Recreate decorated text when it changes. Reusing positioned inline spans
  // can retain stale shaping across a resize even with identical font styles.
  const content = <HighlightedMatchText key={query?.trim() ? JSON.stringify([query,renderedText]) : undefined} text={renderedText} query={query} />;
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
