import type React from "react";
import { findMatchRanges, type MatchRange } from "./highlight.js";
import {
  createCanvasMeasurerFromStyle,
  createMeasurementSession,
  needsDomMeasurement,
  type StyleSnapshot,
} from "./measurement.js";
import { indexTextGraphemes, type IndexedText } from "./graphemes.js";
import {
  MAX_CACHED_CODE_UNITS,
  MAX_CACHED_WIDTHS,
  TRUNCATION_MARKER,
  endModeSide,
  truncatePrepared,
  type TextTruncateMode,
  type TruncationSide,
  type TruncationCut,
  type TruncationResult,
} from "./truncation.js";

/** What the component renders: the visible string of `source` and where it was cut. */
export interface TruncationState {
  source: string;
  text: string;
  cut: TruncationCut | null;
  /** The search ran for `source` at the current width; false while it is pending. */
  measured: boolean;
}

export function fullTextState(text: string): TruncationState {
  return { source: text, text, cut: null, measured: false };
}

// Keeps the previous state object when nothing changed, so React bails out of
// the render as it did when the state was the visible string alone.
function sameTruncation(a: TruncationState, b: TruncationState) {
  return a.source === b.source
    && a.measured === b.measured
    && a.text === b.text
    && a.cut?.prefixEnd === b.cut?.prefixEnd
    && a.cut?.suffixStart === b.cut?.suffixStart;
}

function setTruncation(job: MeasureJob, next: TruncationState) {
  job.setTruncation((previous) => (sameTruncation(previous, next) ? previous : next));
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

export interface WidthCache {
  entries: Map<string, number>;
  units: number;
}

export function createWidthCache(): WidthCache {
  return { entries: new Map(), units: 0 };
}

function clearWidthCache(cache: WidthCache) {
  cache.entries.clear();
  cache.units = 0;
}

function setCachedWidth(cache: WidthCache, key: string, unitLength: number, width: number) {
  if (cache.entries.size >= MAX_CACHED_WIDTHS || cache.units + unitLength > MAX_CACHED_CODE_UNITS) {
    clearWidthCache(cache);
  }
  if (unitLength <= MAX_CACHED_CODE_UNITS) {
    cache.entries.set(key, width);
    cache.units += unitLength;
  }
}

export interface MeasureJob {
  active: boolean;
  initialized: boolean;
  element: HTMLElement;
  text: string;
  mode: TextTruncateMode;
  /**
   * End mode with the ellipsis first: the root runs right to left and the
   * text sits in a `bdi`, as under CSS.
   */
  startEllipsis: boolean;
  query: string | undefined;
  className: string | undefined;
  emojiText: boolean;
  indexedText: IndexedText | undefined;
  matchRanges: readonly MatchRange[] | undefined;
  lastStyle: StyleSnapshot | undefined;
  lastNeedsDOM: boolean;
  lastHasMatch: boolean;
  completedWidth: number | undefined;
  widths: WidthCache;
  verifiedWidths: WidthCache;
  setTruncation: React.Dispatch<React.SetStateAction<TruncationState>>;
  /** Called when whether the style or highlight needs the DOM changes. */
  resolutionNeedChanged?: () => void;
}

/**
 * The cache key of a candidate's width. With `byCut` (the width was drawn in
 * the DOM with a query's highlight, which depends on the cut), a cut
 * candidate and an uncut string live in disjoint namespaces, and two cuts that
 * make the same string get two keys. Otherwise the string alone is the key.
 */
export function widthCacheKey(value: string, cut: TruncationCut | undefined, byCut: boolean) {
  if (!byCut) return value;
  return cut ? `c${cut.prefixEnd}:${cut.suffixStart}:${value}` : `u${value}`;
}

// Pixels a Canvas width must stay below the box, plus one per highlighted
// match, for a fitting text to skip the DOM verification.
const FIT_MARGIN = 2;

/** An input whose change can make what a job measured stale. */
export type MeasurementChange = "text" | "style" | "query" | "mode";

/**
 * Drops what a changed input makes stale. The rules, in one place:
 * - text: every width and the grapheme index, all measured on the old text.
 * - style (class, computed typography, fonts, device pixel ratio): every
 *   width and the captured style.
 * - query: the DOM probe draws highlights and verifies any highlighted cut,
 *   so the cut is redone and DOM-drawn widths go: verified widths always,
 *   primary widths when the last measurement ran in the DOM. Canvas widths
 *   ignore markup and stay.
 * - mode: the cut only; a width does not depend on the mode.
 * The available width needs no rule: widths do not depend on it, and the cut
 * is redone whenever it differs from `completedWidth`.
 */
export function invalidateMeasurements(job: MeasureJob, change: MeasurementChange) {
  if (change === "mode") {
    job.completedWidth = undefined;
    return;
  }
  const dropsPrimary = change !== "query" || job.lastNeedsDOM;
  job.completedWidth = undefined;
  clearWidthCache(job.verifiedWidths);
  if (dropsPrimary) {
    clearWidthCache(job.widths);
  }
  if (change === "style") job.lastStyle = undefined;
  if (change === "text") job.indexedText = undefined;
  if (change === "text" || change === "query") job.matchRanges = undefined;
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
    const dpr = element.ownerDocument.defaultView?.devicePixelRatio ?? flush.dpr;
    let style: StyleSnapshot;
    if (!job.lastStyle || !isSameStyle(job.lastStyle, computed, lang, dpr)) {
      invalidateMeasurements(job, "style");
      style = captureStyle(job.lastStyle, computed, lang, dpr);
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
      if (job.lastNeedsDOM || job.lastHasMatch) {
        job.lastNeedsDOM = false;
        job.lastHasMatch = false;
        job.resolutionNeedChanged?.();
      }
      setTruncation(job, fullTextState(job.text));
      continue;
    }

    const needsDOM = needsDomMeasurement(style);

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

    // End mode hides what CSS text-overflow hides in this line (see endModeSide).
    // With the ellipsis first the line runs right to left by definition, not
    // only when the host compiled the root's [direction:rtl] class.
    const side: TruncationSide = job.mode === "middle"
      ? "middle"
      : endModeSide(job.text, job.startEllipsis ? "rtl" : style.direction);
    const matchRanges = (job.matchRanges ??= findMatchRanges(job.text, job.query));
    const hasMatch = matchRanges.length > 0;
    if (job.lastNeedsDOM !== needsDOM || job.lastHasMatch !== hasMatch) {
      job.lastNeedsDOM = needsDOM;
      job.lastHasMatch = hasMatch;
      job.resolutionNeedChanged?.();
    }

    const session = createMeasurementSession(job.element, computed, job.query, {
      emojiText: job.emojiText,
      // The component isolates the text in a bdi with the ellipsis first, and
      // a cut that keeps the end; the probe draws the same structure.
      isolate: (cut) => job.startEllipsis || (cut !== undefined && cut.prefixEnd === 0 && cut.suffixStart < job.text.length),
      lang: style.lang,
      matchRanges,
      needsDOM,
      originalText: job.text,
      sharedCanvasMeasure,
      style,
    });

    const commit = (result: TruncationResult) => {
      job.completedWidth = width;
      setTruncation(job, { source: job.text, text: result.text, cut: result.cut, measured: true });
    };

    // The DOM probe draws a query's highlight from the candidate's cut, so a
    // DOM width belongs to the cut. Canvas ignores markup: its widths stay
    // keyed by the string. Verified widths are always drawn in the DOM.
    const highlighted = !!job.query?.trim();
    const primaryByCut = highlighted && needsDOM;

    const measureText = (value: string, cut?: TruncationCut) => {
      const key = widthCacheKey(value, cut, primaryByCut);
      const cached = job.widths.entries.get(key);
      if (cached !== undefined) return cached;
      if (flushWidthMap) {
        const flushHit = flushWidthMap.get(value);
        if (flushHit !== undefined) {
          setCachedWidth(job.widths, key, value.length, flushHit);
          return flushHit;
        }
      }
      const measured = session.measureText(value, cut);
      if (flushWidthMap && value.length <= MAX_CACHED_CODE_UNITS) {
        flushWidthMap.set(value, measured);
      }
      // Component-local, bounded by both entries and retained text size.
      // Evict between measurements; no global strings survive unmount.
      setCachedWidth(job.widths, key, value.length, measured);
      return measured;
    };

    const getIndexed = () => (job.indexedText ??= indexTextGraphemes(job.text));

    try {
      if (!session.verifyText) {
        const next = truncatePrepared({ text: job.text, maxWidth: width, mode: side, measureText }, getIndexed);
        commit(next);
        continue;
      }

      const select = (budget: number, measure: (value: string, cut?: TruncationCut) => number = measureText) =>
        truncatePrepared({ text: job.text, maxWidth: budget, mode: side, measureText: measure }, getIndexed);
      const verify = ({ text: value, cut }: TruncationResult) => {
        const key = widthCacheKey(value, cut ?? undefined, highlighted);
        const cached = job.verifiedWidths.entries.get(key);
        if (cached !== undefined) return cached;
        const actual = session.verifyText?.(value, cut ?? undefined);
        if (actual === undefined) return undefined;
        setCachedWidth(job.verifiedWidths, key, value.length, actual);
        return actual;
      };

      let next = select(width);
      // Text that fits by a clear margin needs no DOM verification: a
      // highlight span can paint up to about a pixel wider than Canvas measured
      // (WebKit), emoji widths can differ more.
      if (next.cut === null && !job.emojiText && measureText(job.text) <= width - FIT_MARGIN - (session.matchCount ?? 0)) {
        commit(next);
        continue;
      }
      let budget = width;
      for (let refinement = 0; ; refinement++) {
        const actual = verify(next);
        if (next.text === TRUNCATION_MARKER || actual === undefined || actual <= width) break;
        if (refinement >= 2) {
          next = select(width, session.measureExact!);
          verify(next);
          break;
        }
        budget = Math.min(budget, width - (actual - measureText(next.text, next.cut ?? undefined)));
        if (budget <= 0) {
          next = select(width, session.measureExact!);
          verify(next);
          break;
        }
        next = select(budget);
      }
      commit(next);
    } finally {
      session.dispose();
    }
  }
}

export function scheduleJob(job: MeasureJob, forceReschedule = false) {
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

export function cancelJob(job: MeasureJob) {
  pendingJobs.delete(job);
  if (pendingJobs.size === 0 && batchScheduled) {
    batchScheduled = false;
    scheduledCancelFn?.call(window, batchRafId);
    batchRafId = 0;
    scheduledRafFn = null;
    scheduledCancelFn = null;
  }
}
