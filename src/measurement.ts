import {
  createCanvasTextMeasurer,
  createInlineMeasurementRoot,
  createInlineTextMeasurementNode,
  parseCssPixelValue,
} from "inline-measure";
import {
  createHighlightNodes,
  cutHighlightRuns,
  findMatchRanges,
  highlightedTextParts,
  type MatchRange,
} from "./highlight.js";
import type { TruncationCut } from "./truncation.js";

const NON_ASCII = /[\u0080-\uffff]/;
const EMOJI_PATTERN = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;

export function hasEmoji(value: string) {
  return NON_ASCII.test(value) && EMOJI_PATTERN.test(value);
}

function nonDefault(value: string, defaultValue = "normal") {
  return !!value && value !== defaultValue;
}

export interface StyleSnapshot {
  font: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
  fontKerning: string;
  fontStretch: string;
  fontVariantCaps: string;
  letterSpacing: string;
  fontFeatureSettings: string;
  fontVariationSettings: string;
  fontVariantNumeric: string;
  fontOpticalSizing: string;
  wordSpacing: string;
  textTransform: string;
  direction: string;
  lang: string;
  dpr: number;
}

export function needsDomMeasurement(style: Pick<
  StyleSnapshot,
  | "fontVariantNumeric"
  | "fontFeatureSettings"
  | "fontVariationSettings"
  | "fontOpticalSizing"
  | "wordSpacing"
  | "textTransform"
>): boolean {
  return nonDefault(style.fontVariantNumeric)
    || nonDefault(style.fontFeatureSettings)
    || nonDefault(style.fontVariationSettings)
    || nonDefault(style.fontOpticalSizing, "auto")
    || (nonDefault(style.wordSpacing) && style.wordSpacing !== "0px")
    || nonDefault(style.textTransform, "none");
}

export function createCanvasMeasurerFromStyle(
  computed: CSSStyleDeclaration,
  style?: Pick<
    StyleSnapshot,
    | "font"
    | "fontStyle"
    | "fontWeight"
    | "fontStretch"
    | "fontSize"
    | "fontFamily"
    | "fontKerning"
    | "fontVariantCaps"
    | "letterSpacing"
  >,
): (value: string) => number {
  const font = style ? style.font : computed.font;
  const fontKerning = style ? style.fontKerning : computed.fontKerning;
  const fontStretch = style ? style.fontStretch : computed.fontStretch;
  const fontVariantCaps = style ? style.fontVariantCaps : computed.fontVariantCaps;
  const letterSpacing = style ? style.letterSpacing : computed.letterSpacing;

  // Passing a font string directly when extra Canvas text properties are at
  // their defaults avoids per-call live CSSStyleDeclaration reads in Inline Measure.
  if (
    font
    && (!fontKerning || fontKerning === "auto")
    && (!fontStretch || fontStretch === "normal" || fontStretch === "100%")
    && (!fontVariantCaps || fontVariantCaps === "normal")
    && (!letterSpacing || letterSpacing === "normal" || letterSpacing === "0px")
  ) {
    return createCanvasTextMeasurer(font);
  }

  if (style) {
    return createCanvasTextMeasurer({
      font,
      fontStyle: style.fontStyle,
      fontVariant: computed.fontVariant,
      fontWeight: style.fontWeight,
      fontStretch,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      fontKerning,
      fontVariantCaps,
      letterSpacing,
    } as CSSStyleDeclaration);
  }

  return createCanvasTextMeasurer(computed);
}

/**
 * Measures a candidate visible string. `cut`, when the candidate holds the
 * marker, is the cut that makes it: highlighted text is drawn from it.
 */
export type CandidateMeasurer = (text: string, cut?: TruncationCut) => number;

export interface MeasurementSession {
  measureText: CandidateMeasurer;
  verifyText?: (text: string, cut?: TruncationCut) => number | undefined;
  measureExact?: CandidateMeasurer;
  /** Highlighted matches in the full text. */
  matchCount?: number;
  dispose: () => void;
}

export interface MeasurementSessionOptions {
  emojiText?: boolean;
  /** Whether the component isolates this candidate in a `bdi`; the probe does too. */
  isolate?: (cut?: TruncationCut) => boolean;
  lang?: string;
  /** Precomputed matches for `originalText` and `query`, reused across frames. */
  matchRanges?: readonly MatchRange[];
  needsDOM?: boolean;
  originalText?: string;
  sharedCanvasMeasure?: (text: string) => number;
  style?: StyleSnapshot;
}

const NOOP = () => {};

// One lazy DOM probe per update for CSS features Canvas cannot express.
// Include the component's own highlight markup when such text is decorated.
export function createMeasurementSession(
  element: HTMLElement,
  computed: CSSStyleDeclaration,
  query?: string,
  options?: MeasurementSessionOptions,
): MeasurementSession {
  const originalText = options?.originalText ?? element.dataset.truncateOriginal ?? "";
  const emojiText = options?.emojiText ?? hasEmoji(originalText);
  const needsDOM = options?.needsDOM ?? needsDomMeasurement(options?.style ?? computed);
  // Matches in the full text, found once per session (or reused from the job cache).
  const fullTextMatches = options?.matchRanges ?? findMatchRanges(originalText, query);
  const hasHighlights = fullTextMatches.length > 0;

  if (!needsDOM && !emojiText && !hasHighlights) {
    return {
      measureText: options?.sharedCanvasMeasure ?? createCanvasMeasurerFromStyle(computed, options?.style),
      matchCount: 0,
      dispose: NOOP,
    };
  }
  let root: HTMLElement | undefined;
  let probe: HTMLElement;
  let box = 0;

  const measureDOM = (value: string, cut?: TruncationCut) => {
    if (!root) {
      // Compute box width lazily from the already-read computed style instead
      // of calling getHorizontalBoxWidth(element), which reads getComputedStyle again.
      box = parseCssPixelValue(computed.paddingLeft)
        + parseCssPixelValue(computed.paddingRight)
        + parseCssPixelValue(computed.borderLeftWidth)
        + parseCssPixelValue(computed.borderRightWidth);
      root = createInlineMeasurementRoot(element.ownerDocument);
      probe = createInlineTextMeasurementNode({ sourceElement: element, text: value });
      probe.style.wordSpacing = options?.style ? options.style.wordSpacing : computed.wordSpacing;
      // Keep this explicit while supporting Inline Measure 0.3.0, whose
      // detached text-node helper does not yet copy optical sizing.
      probe.style.fontOpticalSizing = options?.style ? options.style.fontOpticalSizing : computed.fontOpticalSizing;
      probe.style.direction = options?.style ? options.style.direction : computed.direction;
      probe.lang = options?.lang
        ?? element.closest("[lang]")?.getAttribute("lang")
        ?? element.ownerDocument.documentElement.lang;
      root.append(probe);
      element.ownerDocument.body.append(root);
    }
    // The node the text goes in: the probe, or a bdi in it as the component renders.
    let target: HTMLElement = probe;
    if (options?.isolate?.(cut)) {
      target = element.ownerDocument.createElement("bdi");
      probe.replaceChildren(target);
    }
    if (!hasHighlights) {
      target.textContent = value;
    } else {
      // The runs the component renders: a cut's are drawn from the full text.
      const parts = cut
        ? cutHighlightRuns(originalText, query, cut, fullTextMatches)
        : highlightedTextParts(value, query, value === originalText ? fullTextMatches : undefined);
      target.replaceChildren(...createHighlightNodes(element.ownerDocument, parts));
    }
    const contentWidth = Math.max(0, probe.getBoundingClientRect().width - box);
    if (!hasHighlights) return contentWidth;
    // Inline positioned spans can extend the text range beyond the intrinsic
    // advance width of its containing box. Match the painted range oracle.
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(probe);
    return Math.max(contentWidth, range.getBoundingClientRect().width);
  };

  return {
    measureText: needsDOM
      ? measureDOM
      : (options?.sharedCanvasMeasure ?? createCanvasMeasurerFromStyle(computed, options?.style)),
    // Canvas selects; the DOM verifies what Canvas cannot see: emoji widths,
    // and highlight spans, which can split shaping (WebKit paints them wider).
    verifyText: needsDOM ? undefined : measureDOM,
    measureExact: needsDOM ? undefined : measureDOM,
    matchCount: fullTextMatches.length,
    dispose() {
      root?.remove();
    },
  };
}
