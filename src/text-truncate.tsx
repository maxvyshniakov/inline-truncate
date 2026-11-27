"use client";

import React from "react";
import { hasEmoji } from "./measurement.js";
import { CutHighlightedText, findMatchRanges, HighlightedMatchText } from "./highlight.js";
import {
  BoundedWidthCache,
  TRUNCATION_MARKER,
  needsBdiIsolation,
  type TextTruncateMode,
} from "./truncation.js";
import {
  cancelJob,
  fullTextState,
  invalidateMeasurements,
  scheduleJob,
  type MeasureJob,
} from "./scheduler.js";
import { observeResize, subscribeFonts, subscribeResolutionChange } from "./observers.js";
import { cn } from "cn";

export type TextTruncateStrategy = "auto" | "css" | "measure";
export type TextTruncateEllipsis = "end" | "start";

const MAX_CLASSNAME_CACHE = 64;

const BASE_CSS_END_CLASS = "block w-full min-w-0 truncate";
const BASE_CSS_START_CLASS = "block w-full min-w-0 truncate [direction:rtl]";
// A measured string fits its box, so the root clips paint, not layout: 1px past
// each inline side, room for a highlight decoration that paints past the glyphs
// (Data Grid's 1px box-shadow) at the text's first and last character. The box,
// what hosts measure on it and its scroll overflow stay as with overflow:hidden.
const BASE_MEASURE_CLASS = "block w-full min-w-0 whitespace-nowrap overflow-visible [clip-path:inset(0_-1px)]";
// Clips flush, as before the paint room: text the search has not cut yet, and
// the marker alone, which can be wider than a very narrow box, must not
// overflow into a scrolling ancestor.
const BASE_MEASURE_CLIP_CLASS = "block w-full min-w-0 whitespace-nowrap overflow-hidden";
const START_CLASS = " [direction:rtl]";

// Holds the full text for assistive technology while the visible string is cut.
// Inline, so it works without the host's CSS. Not selectable, so a copied
// selection holds the visible string once and not the full text beside it, and
// no pointer target, so clicks and hit tests land on the visible string.
const FULL_TEXT_STYLE: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  userSelect: "none",
  WebkitUserSelect: "none",
  pointerEvents: "none",
};

/**
 * "auto" measures middle mode, and end mode when the query matches: the
 * browser's own ellipsis is no node, so it cannot take the highlight of a match
 * it hides, and a clipped match would paint under it. End mode without a match
 * keeps CSS and measures nothing.
 */
function resolveTextTruncateStrategy({
  mode,
  queryMatches,
  strategy,
}: {
  mode: TextTruncateMode;
  queryMatches: boolean;
  strategy: TextTruncateStrategy;
}): "css" | "measure" {
  if (strategy !== "auto") return strategy;
  return mode === "middle" || queryMatches ? "measure" : "css";
}

const rootClassCache = new Map<string, string>();
function mergeRootClassName(baseClass: string, className: string): string {
  const key = `${baseClass}\0${className}`;
  const cached = rootClassCache.get(key);
  if (cached !== undefined) return cached;
  const merged = cn(baseClass, className);
  if (rootClassCache.size >= MAX_CLASSNAME_CACHE) rootClassCache.clear();
  rootClassCache.set(key, merged);
  return merged;
}

export interface TextTruncateProps {
  className?: string;
  ellipsis?: TextTruncateEllipsis;
  measureExtra?: string | number;
  mode: TextTruncateMode;
  query?: string;
  strategy?: TextTruncateStrategy;
  text: string;
}

export const TextTruncate = React.memo(function TextTruncate({
  className,
  ellipsis = "end",
  measureExtra,
  mode,
  query,
  strategy = "auto",
  text,
}: TextTruncateProps) {
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const jobRef = React.useRef<{
    job: MeasureJob;
    syncResolutionNeed: () => void;
  } | null>(null);
  const resumedFromInactiveRef = React.useRef(false);
  const [truncation, setTruncation] = React.useState(() => fullTextState(text));
  const queryMatches = React.useMemo(
    () => strategy === "auto" && mode === "end" && findMatchRanges(text, query).length > 0,
    [mode, query, strategy, text],
  );
  const resolvedStrategy = resolveTextTruncateStrategy({ mode, queryMatches, strategy });
  // Measured end mode with the ellipsis first: the line runs right to left, as under CSS.
  const startEllipsis = ellipsis === "start" && (resolvedStrategy === "css" || mode === "end");

  // Persistent lifecycle effect: keeps ResizeObserver and document.fonts
  // subscriptions attached across text, className, query, and mode updates.
  React.useLayoutEffect(() => {
    if (resolvedStrategy !== "measure") return undefined;
    const element = textRef.current;
    if (!element) return undefined;

    const job: MeasureJob = {
      active: true,
      initialized: false,
      clipOverride: false,
      element,
      text: "",
      mode: "middle",
      startEllipsis: false,
      query: undefined,
      className: undefined,
      emojiText: false,
      indexedText: undefined,
      matchRanges: undefined,
      lastStyle: undefined,
      lastNeedsDOM: false,
      lastHasMatch: false,
      completedWidth: undefined,
      widths: new BoundedWidthCache(),
      verifiedWidths: new BoundedWidthCache(),
      setTruncation,
    };

    const clipUntilMeasured = () => {
      if (!job.clipOverride) {
        element.style.overflow = "hidden";
        job.clipOverride = true;
      }
    };

    const onResize = () => {
      if (job.completedWidth !== undefined) {
        const width = element.clientWidth || element.getBoundingClientRect().width;
        if (width < job.completedWidth) clipUntilMeasured();
      }
      scheduleJob(job);
    };
    const onFontsChanged = () => {
      clipUntilMeasured();
      invalidateMeasurements(job, "style");
      scheduleJob(job, true);
    };

    let unsubscribeResolution: (() => void) | undefined;
    const onResolutionChanged = () => {
      if (!job.active) return;
      invalidateMeasurements(job, "style");
      scheduleJob(job, true);
    };
    const unbindResolution = () => {
      unsubscribeResolution?.();
      unsubscribeResolution = undefined;
    };

    // DOM-measured widths follow the device pixel ratio: emoji text, text
    // whose style needs the DOM, and text whose highlight is verified there.
    // Match presence comes from the measurement session (job.lastHasMatch),
    // avoiding a redundant uncached findMatchRanges scan in useLayoutEffect.
    const syncResolutionNeed = () => {
      const needsResolution = job.emojiText || job.lastNeedsDOM || job.lastHasMatch;
      if (needsResolution && !unsubscribeResolution) {
        const win = element.ownerDocument.defaultView ?? (typeof window === "undefined" ? undefined : window);
        unsubscribeResolution = subscribeResolutionChange(win, onResolutionChanged);
      } else if (!needsResolution && unsubscribeResolution) {
        unbindResolution();
      }
    };
    job.resolutionNeedChanged = syncResolutionNeed;
    jobRef.current = { job, syncResolutionNeed };

    const unobserve = observeResize(element, onResize);
    const unsubscribe = subscribeFonts(onFontsChanged);

    return () => {
      job.active = false;
      jobRef.current = null;
      resumedFromInactiveRef.current = true;
      if (job.clipOverride) {
        element.style.overflow = "";
        job.clipOverride = false;
      }
      cancelJob(job);
      unobserve();
      unsubscribe();
      unbindResolution();
    };
  }, [resolvedStrategy]);

  // Once React commits a newly measured string, lift any temporary shrink/font clip.
  React.useLayoutEffect(() => {
    const entry = jobRef.current;
    if (!entry) return;
    if (entry.job.clipOverride && truncation.measured) {
      entry.job.element.style.overflow = "";
      entry.job.clipOverride = false;
    }
  }, [truncation]);

  // Prop synchronization effect: updates job inputs and schedules a batched
  // measurement without tearing down observers or font listeners.
  React.useLayoutEffect(() => {
    if (resolvedStrategy !== "measure") return undefined;
    const entry = jobRef.current;
    if (!entry) return undefined;
    const { job, syncResolutionNeed } = entry;

    if (!job.initialized) {
      job.initialized = true;
      job.text = text;
      job.mode = mode;
      job.startEllipsis = startEllipsis;
      job.query = query;
      job.className = className;
      job.emojiText = hasEmoji(text);
      if (resumedFromInactiveRef.current) {
        resumedFromInactiveRef.current = false;
        // Resuming measurement after CSS took over: keep a held cut only when
        // it still belongs to these inputs so middle->end->middle does not flash
        // a frame of clipped text without an ellipsis; drop stale cuts.
        setTruncation((previous) => {
          const reusable = previous.cut !== null
            && previous.source === text
            && previous.mode === mode
            && previous.query === query
            && previous.startEllipsis === startEllipsis;
          if (reusable) return previous.measured ? { ...previous, measured: false } : previous;
          return previous.cut === null && !previous.measured && previous.source === text
            ? previous
            : fullTextState(text);
        });
      }
      syncResolutionNeed();
      scheduleJob(job);
      return undefined;
    }

    const textChanged = job.text !== text;
    const classChanged = job.className !== className;
    const modeChanged = job.mode !== mode;
    const ellipsisChanged = job.startEllipsis !== startEllipsis;
    const queryChanged = job.query !== query;

    if (textChanged) {
      job.text = text;
      job.emojiText = hasEmoji(text);
      invalidateMeasurements(job, "text");
    }
    if (classChanged) {
      job.className = className;
      invalidateMeasurements(job, "style");
    }
    if (modeChanged) {
      job.mode = mode;
      invalidateMeasurements(job, "mode");
    }
    if (ellipsisChanged) {
      // The direction and the bdi change what the DOM draws.
      job.startEllipsis = startEllipsis;
      invalidateMeasurements(job, "style");
    }
    if (queryChanged) {
      job.query = query;
      if (!query?.trim()) job.lastHasMatch = false;
      invalidateMeasurements(job, "query");
    }
    if (textChanged || (queryChanged && !query?.trim())) syncResolutionNeed();

    scheduleJob(job);
    return undefined;
  }, [className, mode, query, resolvedStrategy, startEllipsis, text]);

  // The search hands over where it cut and which text it cut. Truncated means
  // a cut is shown. Until the search has run for a new `text`, a previous cut
  // stays up, and its highlight comes from the text and cut it was made of; a
  // previous result that fit is not a cut, so the current text shows whole.
  const cut = resolvedStrategy === "measure" ? truncation.cut : null;
  const isTruncated = cut !== null;
  const renderedText = isTruncated ? truncation.text : text;
  const trimmedQuery = query?.trim();
  // Recreate decorated text when it changes. Reusing positioned inline spans
  // can retain stale shaping across a resize even with identical font styles.
  // Matches are found in the full text; a cut maps them onto the visible string.
  const content = trimmedQuery ? (
    cut ? (
      <CutHighlightedText
        // The query, the cut and its source decide the runs (and the visible
        // string); the visible string alone can be the same for two of them.
        key={`${query!.length}:${query}:${cut.prefixEnd}:${cut.suffixStart}:${truncation.source}`}
        text={truncation.source}
        cut={cut}
        query={query}
      />
    ) : (
      <HighlightedMatchText
        key={`${query!.length}:${query}:${renderedText}`}
        text={renderedText}
        query={query}
      />
    )
  ) : (
    renderedText
  );
  // Until the search has run for this text, measured end mode looks as CSS
  // draws it, dots included: the server's HTML and the frame before the first
  // measurement, and the frame after the query starts matching.
  const unmeasured = resolvedStrategy === "measure" && cut === null
    && !(truncation.measured && truncation.source === text);
  const cssLook = resolvedStrategy === "css" || (unmeasured && mode === "end");
  // Paint-only clipping (overflow-visible + clip-path) is only safe once a
  // highlighted commit is DOM-verified (or fit by a clear margin) and is not
  // the marker alone; plain Canvas-only commits keep overflow-hidden so
  // subpixel discrepancies never add to an ancestor's scroll size.
  const paintClip = !unmeasured
    && truncation.verified
    && Boolean(trimmedQuery)
    && truncation.text !== TRUNCATION_MARKER;
  const baseClass = cssLook
    ? (startEllipsis ? BASE_CSS_START_CLASS : BASE_CSS_END_CLASS)
    : (paintClip ? BASE_MEASURE_CLASS : BASE_MEASURE_CLIP_CLASS)
      + (startEllipsis ? START_CLASS : "");
  // The text sits in a bdi in its own direction with the ellipsis first, as
  // under CSS, and for an end-mode cut that keeps the end, so the marker leads it.
  const isolated = needsBdiIsolation({
    mode,
    startEllipsis,
    cut,
    sourceLength: truncation.source.length,
  });
  const shown = isolated ? <bdi>{content}</bdi> : content;
  const rootClassName = className ? mergeRootClassName(baseClass, className) : baseClass;

  return (
    <span
      ref={textRef}
      className={rootClassName}
      data-tip-align={startEllipsis ? "end" : undefined}
      data-truncate=""
      data-truncate-measure-extra={measureExtra}
      data-truncate-mode={mode}
      data-truncate-original={text}
      data-truncate-overflow-target={cssLook && startEllipsis ? ":scope > bdi" : undefined}
      data-truncate-state={isTruncated ? "truncated" : undefined}
      data-truncate-strategy={resolvedStrategy}
    >
      {isTruncated ? (
        <>
          <span aria-hidden="true" data-truncate-visible="">{shown}</span>
          <span data-truncate-full-text="" style={FULL_TEXT_STYLE}>{text}</span>
        </>
      ) : (
        shown
      )}
    </span>
  );
});
