"use client";

import React from "react";
import { hasEmoji } from "./measurement.js";
import { HighlightedMatchText } from "./highlight.js";
import type { TextTruncateMode } from "./truncation.js";
import { cancelJob, scheduleJob, type MeasureJob } from "./scheduler.js";
import { observeResize, subscribeFonts } from "./observers.js";
import { cn } from "cn";

export type TextTruncateStrategy = "auto" | "css" | "measure";
export type TextTruncateEllipsis = "end" | "start";

const MAX_CLASSNAME_CACHE = 64;

const BASE_CSS_END_CLASS = "block w-full min-w-0 truncate";
const BASE_CSS_START_CLASS = "block w-full min-w-0 truncate [direction:rtl]";
const BASE_MEASURE_CLASS = "block w-full min-w-0 overflow-hidden whitespace-nowrap";

// Holds the full text for assistive technology while the visible string is cut.
// Inline, so it works without the host's CSS. Not selectable, so a copied
// selection holds the visible string once and not the full text beside it.
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
};

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
    syncResolution: (needsResolution: boolean) => void;
  } | null>(null);
  const [truncatedText, setTruncatedText] = React.useState(text);
  const resolvedStrategy = resolveTextTruncateStrategy({ mode, strategy });

  // Persistent lifecycle effect: keeps ResizeObserver and document.fonts
  // subscriptions attached across text, className, query, and mode updates.
  React.useLayoutEffect(() => {
    if (resolvedStrategy !== "measure") return undefined;
    const element = textRef.current;
    if (!element) return undefined;

    const job: MeasureJob = {
      active: true,
      initialized: false,
      element,
      text: "",
      mode: "middle",
      query: undefined,
      className: undefined,
      emojiText: false,
      indexedText: undefined,
      lastStyle: undefined,
      lastNeedsDOM: false,
      completedWidth: undefined,
      widths: new Map(),
      cachedUnits: 0,
      verifiedWidths: new Map(),
      verifiedUnits: 0,
      setTruncatedText,
      invalidate() {
        job.completedWidth = undefined;
        job.lastStyle = undefined;
        job.widths.clear();
        job.cachedUnits = 0;
        job.verifiedWidths.clear();
        job.verifiedUnits = 0;
      },
    };

    const schedule = () => scheduleJob(job);
    const onFontsChanged = () => {
      job.invalidate();
      scheduleJob(job, true);
    };

    let resolutionQuery: MediaQueryList | undefined;
    const resolutionChanged = () => {
      if (!job.active) return;
      job.invalidate();
      scheduleJob(job, true);
      bindResolution();
    };
    const unbindResolution = () => {
      resolutionQuery?.removeEventListener?.("change", resolutionChanged);
      resolutionQuery = undefined;
    };
    const bindResolution = () => {
      unbindResolution();
      resolutionQuery = window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
      resolutionQuery?.addEventListener?.("change", resolutionChanged);
    };
    const syncResolution = (needsResolution: boolean) => {
      if (needsResolution && !resolutionQuery) {
        bindResolution();
      } else if (!needsResolution && resolutionQuery) {
        unbindResolution();
      }
    };

    jobRef.current = { job, syncResolution };

    const unobserve = observeResize(element, schedule);
    const unsubscribe = subscribeFonts(onFontsChanged);

    return () => {
      job.active = false;
      jobRef.current = null;
      cancelJob(job);
      unobserve();
      unsubscribe();
      unbindResolution();
    };
  }, [resolvedStrategy]);

  // Prop synchronization effect: updates job inputs and schedules a batched
  // measurement without tearing down observers or font listeners.
  React.useLayoutEffect(() => {
    if (resolvedStrategy !== "measure") return undefined;
    const entry = jobRef.current;
    if (!entry) return undefined;
    const { job, syncResolution } = entry;

    if (!job.initialized) {
      job.initialized = true;
      job.text = text;
      job.mode = mode;
      job.query = query;
      job.className = className;
      job.emojiText = hasEmoji(text);
      syncResolution(job.emojiText);
      scheduleJob(job);
      return undefined;
    }

    const textChanged = job.text !== text;
    const classChanged = job.className !== className;
    const modeChanged = job.mode !== mode;
    const queryChanged = job.query !== query;

    if (textChanged) {
      job.text = text;
      job.indexedText = undefined;
      job.emojiText = hasEmoji(text);
      job.completedWidth = undefined;
      job.widths.clear();
      job.cachedUnits = 0;
      job.verifiedWidths.clear();
      job.verifiedUnits = 0;
      syncResolution(job.emojiText);
    }
    if (classChanged) {
      job.className = className;
      job.invalidate();
    }
    if (modeChanged) {
      job.mode = mode;
      job.completedWidth = undefined;
    }
    if (queryChanged) {
      job.query = query;
      if (job.emojiText || job.lastNeedsDOM) {
        job.completedWidth = undefined;
        job.verifiedWidths.clear();
        job.verifiedUnits = 0;
      }
    }

    scheduleJob(job);
    return undefined;
  }, [className, mode, query, resolvedStrategy, text]);

  const renderedText = resolvedStrategy === "measure" ? truncatedText : text;
  const isTruncated = resolvedStrategy === "measure" && truncatedText !== text;
  const trimmedQuery = query?.trim();
  // Recreate decorated text when it changes. Reusing positioned inline spans
  // can retain stale shaping across a resize even with identical font styles.
  const content = trimmedQuery ? (
    <HighlightedMatchText
      key={`${query!.length}:${query}:${renderedText}`}
      text={renderedText}
      query={query}
    />
  ) : (
    renderedText
  );
  const shouldUseStartEllipsis = resolvedStrategy === "css" && ellipsis === "start";
  const baseClass =
    resolvedStrategy === "css"
      ? shouldUseStartEllipsis
        ? BASE_CSS_START_CLASS
        : BASE_CSS_END_CLASS
      : BASE_MEASURE_CLASS;
  const rootClassName = className ? mergeRootClassName(baseClass, className) : baseClass;

  return (
    <span
      ref={textRef}
      className={rootClassName}
      data-tip-align={shouldUseStartEllipsis ? "end" : undefined}
      data-truncate=""
      data-truncate-measure-extra={measureExtra}
      data-truncate-mode={mode}
      data-truncate-original={text}
      data-truncate-overflow-target={shouldUseStartEllipsis ? ":scope > bdi" : undefined}
      data-truncate-state={isTruncated ? "truncated" : undefined}
      data-truncate-strategy={resolvedStrategy}
    >
      {shouldUseStartEllipsis ? (
        <bdi>{content}</bdi>
      ) : isTruncated ? (
        <>
          <span aria-hidden="true" data-truncate-visible="">{content}</span>
          <span data-truncate-full-text="" style={FULL_TEXT_STYLE}>{text}</span>
        </>
      ) : (
        content
      )}
    </span>
  );
});
