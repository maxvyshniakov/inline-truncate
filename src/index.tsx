"use client";

import React from "react";
import {
  createCanvasMeasurerFromStyle,
  createMeasurementSession,
  hasEmoji,
  needsDomMeasurement,
  type StyleSnapshot,
} from "./measurement.js";
import { HighlightedMatchText } from "./highlight.js";
import { indexTextGraphemes, type IndexedText } from "./graphemes.js";
import {
  MAX_CACHED_CODE_UNITS,
  MAX_CACHED_WIDTHS,
  TRUNCATION_MARKER,
  truncatePrepared,
  type TextTruncateMode,
} from "./truncation.js";
import { observeResize, subscribeFonts } from "./observers.js";
import { cn } from "cn";

export type TextTruncateStrategy = "auto" | "css" | "measure";
export type TextTruncateEllipsis = "end" | "start";

export { splitTextGraphemes } from "./graphemes.js";
export { truncateText, type TextTruncateMode } from "./truncation.js";
export { HighlightedMatchText } from "./highlight.js";

const MAX_CLASSNAME_CACHE = 64;

const BASE_CSS_END_CLASS = "block w-full min-w-0 truncate";
const BASE_CSS_START_CLASS = "block w-full min-w-0 truncate [direction:rtl]";
const BASE_MEASURE_CLASS = "block w-full min-w-0 overflow-hidden whitespace-nowrap";

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

// --- Shared two-phase batched RAF scheduler ---
// Phase 1 reads all layout geometry and computed styles before any DOM probe
// mutations or React state updates run in Phase 2, preventing N-way layout
// thrashing and coalescing 200 component updates into a single animation frame.
interface FlushContext {
  dpr: number;
  docLang: string | undefined;
  langCache: Map<Element, string> | undefined;
  canvasMeasurers: Map<string, (value: string) => number> | undefined;
  canvasWidths: Map<string, Map<string, number>> | undefined;
}

interface MeasureWorkItem {
  job: MeasureJob;
  width: number;
  computed: CSSStyleDeclaration | null;
  style: StyleSnapshot | null;
}

interface MeasureJob {
  active: boolean;
  initialized: boolean;
  element: HTMLElement;
  text: string;
  mode: TextTruncateMode;
  query: string | undefined;
  className: string | undefined;
  emojiText: boolean;
  indexedText: IndexedText | undefined;
  lastStyle: StyleSnapshot | undefined;
  lastNeedsDOM: boolean;
  completedWidth: number | undefined;
  widths: Map<string, number>;
  cachedUnits: number;
  verifiedWidths: Map<string, number>;
  verifiedUnits: number;
  setTruncatedText: React.Dispatch<React.SetStateAction<string>>;
  invalidate: () => void;
}

function resolveLang(element: Element, flush: FlushContext): string {
  const ownLang = element.getAttribute("lang");
  if (ownLang !== null) return ownLang;

  const parent = element.parentElement;
  if (!parent) {
    return (flush.docLang ??= element.ownerDocument.documentElement.lang);
  }

  const langCache = flush.langCache;
  if (langCache) {
    const parentCached = langCache.get(parent);
    if (parentCached !== undefined) return parentCached;
  }

  const chain: Element[] | null = langCache ? [parent] : null;
  let curr: Element | null = parent;
  let result: string | undefined;
  while (curr) {
    if (langCache) {
      const hit = langCache.get(curr);
      if (hit !== undefined) {
        result = hit;
        chain!.pop();
        break;
      }
    }
    const attr = curr.getAttribute("lang");
    if (attr !== null) {
      result = attr;
      break;
    }
    curr = curr.parentElement;
    if (curr && chain) chain.push(curr);
  }
  if (result === undefined) {
    result = (flush.docLang ??= element.ownerDocument.documentElement.lang);
  }
  if (langCache && chain) {
    for (let i = 0; i < chain.length; i++) {
      langCache.set(chain[i], result);
    }
  }
  return result;
}

function isSameStyle(prev: StyleSnapshot, computed: CSSStyleDeclaration, lang: string, dpr: number): boolean {
  return prev.dpr === dpr
    && prev.lang === lang
    && prev.fontSize === computed.fontSize
    && prev.fontFamily === computed.fontFamily
    && prev.fontWeight === computed.fontWeight
    && prev.fontStyle === computed.fontStyle
    && prev.fontKerning === computed.fontKerning
    && prev.fontStretch === computed.fontStretch
    && prev.fontVariantCaps === computed.fontVariantCaps
    && prev.letterSpacing === computed.letterSpacing
    && prev.fontFeatureSettings === computed.fontFeatureSettings
    && prev.fontVariationSettings === computed.fontVariationSettings
    && prev.fontVariantNumeric === computed.fontVariantNumeric
    && prev.fontOpticalSizing === computed.fontOpticalSizing
    && prev.wordSpacing === computed.wordSpacing
    && prev.textTransform === computed.textTransform
    && prev.direction === computed.direction
    // Avoid reading the expensive `font` shorthand serializer on every hit
    // when longhand font properties are already populated by the engine.
    && (prev.fontFamily !== "" || prev.font === computed.font);
}

function captureStyle(
  target: StyleSnapshot | undefined,
  computed: CSSStyleDeclaration,
  lang: string,
  dpr: number,
): StyleSnapshot {
  if (target) {
    target.font = computed.font;
    target.fontFamily = computed.fontFamily;
    target.fontSize = computed.fontSize;
    target.fontWeight = computed.fontWeight;
    target.fontStyle = computed.fontStyle;
    target.fontKerning = computed.fontKerning;
    target.fontStretch = computed.fontStretch;
    target.fontVariantCaps = computed.fontVariantCaps;
    target.letterSpacing = computed.letterSpacing;
    target.fontFeatureSettings = computed.fontFeatureSettings;
    target.fontVariationSettings = computed.fontVariationSettings;
    target.fontVariantNumeric = computed.fontVariantNumeric;
    target.fontOpticalSizing = computed.fontOpticalSizing;
    target.wordSpacing = computed.wordSpacing;
    target.textTransform = computed.textTransform;
    target.direction = computed.direction;
    target.lang = lang;
    target.dpr = dpr;
    return target;
  }
  return {
    font: computed.font,
    fontFamily: computed.fontFamily,
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    fontStyle: computed.fontStyle,
    fontKerning: computed.fontKerning,
    fontStretch: computed.fontStretch,
    fontVariantCaps: computed.fontVariantCaps,
    letterSpacing: computed.letterSpacing,
    fontFeatureSettings: computed.fontFeatureSettings,
    fontVariationSettings: computed.fontVariationSettings,
    fontVariantNumeric: computed.fontVariantNumeric,
    fontOpticalSizing: computed.fontOpticalSizing,
    wordSpacing: computed.wordSpacing,
    textTransform: computed.textTransform,
    direction: computed.direction,
    lang,
    dpr,
  };
}

function canvasStyleKey(style: StyleSnapshot): string {
  return `${style.font}\u001f${style.fontFamily}\u001f${style.fontSize}\u001f${style.fontWeight}\u001f${style.fontStyle}\u001f${style.fontKerning}\u001f${style.fontStretch}\u001f${style.fontVariantCaps}\u001f${style.letterSpacing}\u001f${style.dpr}`;
}

const pendingJobs = new Set<MeasureJob>();
let batchScheduled = false;
let batchRafId = 0;
let scheduledRafFn: typeof window.requestAnimationFrame | null = null;
let scheduledCancelFn: typeof window.cancelAnimationFrame | null = null;

function flushJobs() {
  batchScheduled = false;
  batchRafId = 0;
  scheduledRafFn = null;
  scheduledCancelFn = null;
  if (pendingJobs.size === 0) return;

  const batch = Array.from(pendingJobs);
  pendingJobs.clear();

  const multi = batch.length > 1;
  const flush: FlushContext = {
    dpr: window.devicePixelRatio,
    docLang: undefined,
    langCache: multi ? new Map() : undefined,
    canvasMeasurers: multi ? new Map() : undefined,
    canvasWidths: multi ? new Map() : undefined,
  };

  // Phase 1: layout & computed-style reads only
  const work: MeasureWorkItem[] = [];
  for (let i = 0; i < batch.length; i++) {
    const job = batch[i];
    if (!job.active) continue;
    const element = job.element;
    let width = element.clientWidth || element.getBoundingClientRect().width;
    if (width <= 0) {
      work.push({ job, width: 0, computed: null, style: null });
      continue;
    }

    const computed = window.getComputedStyle(element);
    const padL = computed.paddingLeft;
    const padR = computed.paddingRight;
    if (padL && padL !== "0px") width -= Number.parseFloat(padL) || 0;
    if (padR && padR !== "0px") width -= Number.parseFloat(padR) || 0;
    if (width <= 0) {
      work.push({ job, width: 0, computed: null, style: null });
      continue;
    }

    const lang = resolveLang(element, flush);
    let style: StyleSnapshot;
    if (!job.lastStyle || !isSameStyle(job.lastStyle, computed, lang, flush.dpr)) {
      job.invalidate();
      style = captureStyle(job.lastStyle, computed, lang, flush.dpr);
      job.lastStyle = style;
    } else {
      style = job.lastStyle;
    }

    // RO may report only height changes, including our own cut. Validate
    // live typography first; font/DPR events invalidate completion too.
    if (job.completedWidth === width) continue;
    work.push({ job, width, computed, style });
  }

  // Phase 2: measure, verify, and commit React updates
  for (let i = 0; i < work.length; i++) {
    const item = work[i];
    const { job, width, computed, style } = item;
    if (!job.active) continue;
    if (width <= 0 || !computed || !style) {
      job.completedWidth = undefined;
      job.setTruncatedText(job.text);
      continue;
    }

    const needsDOM = needsDomMeasurement(style);
    job.lastNeedsDOM = needsDOM;

    let sharedCanvasMeasure: ((value: string) => number) | undefined;
    let flushWidthMap: Map<string, number> | undefined;
    if (!needsDOM && flush.canvasMeasurers && flush.canvasWidths) {
      const key = canvasStyleKey(style);
      sharedCanvasMeasure = flush.canvasMeasurers.get(key);
      if (!sharedCanvasMeasure) {
        sharedCanvasMeasure = createCanvasMeasurerFromStyle(computed, style);
        flush.canvasMeasurers.set(key, sharedCanvasMeasure);
      }
      flushWidthMap = flush.canvasWidths.get(key);
      if (!flushWidthMap) {
        flushWidthMap = new Map();
        flush.canvasWidths.set(key, flushWidthMap);
      }
    }

    const session = createMeasurementSession(job.element, computed, job.query, {
      emojiText: job.emojiText,
      lang: style.lang,
      needsDOM,
      originalText: job.text,
      sharedCanvasMeasure,
      style,
    });

    const commit = (value: string) => {
      job.completedWidth = width;
      job.setTruncatedText(value);
    };

    const measureText = (value: string) => {
      const cached = job.widths.get(value);
      if (cached !== undefined) return cached;
      if (flushWidthMap) {
        const flushHit = flushWidthMap.get(value);
        if (flushHit !== undefined) {
          if (job.widths.size >= MAX_CACHED_WIDTHS || job.cachedUnits + value.length > MAX_CACHED_CODE_UNITS) {
            job.widths.clear();
            job.cachedUnits = 0;
          }
          if (value.length <= MAX_CACHED_CODE_UNITS) {
            job.widths.set(value, flushHit);
            job.cachedUnits += value.length;
          }
          return flushHit;
        }
      }
      const measured = session.measureText(value);
      if (flushWidthMap && value.length <= MAX_CACHED_CODE_UNITS) {
        flushWidthMap.set(value, measured);
      }
      // Component-local, bounded by both entries and retained text size.
      // Evict between measurements; no global strings survive unmount.
      if (job.widths.size >= MAX_CACHED_WIDTHS || job.cachedUnits + value.length > MAX_CACHED_CODE_UNITS) {
        job.widths.clear();
        job.cachedUnits = 0;
      }
      if (value.length <= MAX_CACHED_CODE_UNITS) {
        job.widths.set(value, measured);
        job.cachedUnits += value.length;
      }
      return measured;
    };

    const getIndexed = () => (job.indexedText ??= indexTextGraphemes(job.text));

    try {
      if (!session.verifyText) {
        const next = truncatePrepared({ text: job.text, maxWidth: width, mode: job.mode, measureText }, getIndexed);
        commit(next.text);
        continue;
      }

      const select = (budget: number, measure = measureText) =>
        truncatePrepared({ text: job.text, maxWidth: budget, mode: job.mode, measureText: measure }, getIndexed);
      const verify = (value: string) => {
        const cached = job.verifiedWidths.get(value);
        if (cached !== undefined) return cached;
        const actual = session.verifyText?.(value);
        if (actual === undefined) return undefined;
        if (job.verifiedWidths.size >= MAX_CACHED_WIDTHS || job.verifiedUnits + value.length > MAX_CACHED_CODE_UNITS) {
          job.verifiedWidths.clear();
          job.verifiedUnits = 0;
        }
        if (value.length <= MAX_CACHED_CODE_UNITS) {
          job.verifiedWidths.set(value, actual);
          job.verifiedUnits += value.length;
        }
        return actual;
      };

      let next = select(width);
      let budget = width;
      for (let refinement = 0; ; refinement++) {
        const actual = verify(next.text);
        if (next.text === TRUNCATION_MARKER || actual === undefined || actual <= width) break;
        if (refinement >= 2) {
          next = select(width, session.measureExact!);
          verify(next.text);
          break;
        }
        budget = Math.min(budget, width - (actual - measureText(next.text)));
        if (budget <= 0) {
          next = select(width, session.measureExact!);
          verify(next.text);
          break;
        }
        next = select(budget);
      }
      commit(next.text);
    } finally {
      session.dispose();
    }
  }
}

function scheduleJob(job: MeasureJob, forceReschedule = false) {
  if (!job.active) return;
  const alreadyPending = pendingJobs.has(job);
  pendingJobs.add(job);
  const currentRaf = window.requestAnimationFrame;
  if (!batchScheduled) {
    batchScheduled = true;
    scheduledRafFn = currentRaf;
    scheduledCancelFn = window.cancelAnimationFrame;
    batchRafId = window.requestAnimationFrame(flushJobs);
  } else if (scheduledRafFn !== currentRaf || (forceReschedule && alreadyPending)) {
    scheduledCancelFn?.call(window, batchRafId);
    scheduledRafFn = currentRaf;
    scheduledCancelFn = window.cancelAnimationFrame;
    batchRafId = window.requestAnimationFrame(flushJobs);
  }
}

function cancelJob(job: MeasureJob) {
  pendingJobs.delete(job);
  if (pendingJobs.size === 0 && batchScheduled) {
    batchScheduled = false;
    scheduledCancelFn?.call(window, batchRafId);
    batchRafId = 0;
    scheduledRafFn = null;
    scheduledCancelFn = null;
  }
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
      {shouldUseStartEllipsis ? <bdi>{content}</bdi> : content}
    </span>
  );
});
