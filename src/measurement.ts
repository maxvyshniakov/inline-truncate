import {
  createCanvasTextMeasurer,
  createInlineMeasurementRoot,
  createInlineTextMeasurementNode,
  getHorizontalBoxWidth,
} from "@maxvyshniakov/inline-measure";
import {highlightedTextParts,HIGHLIGHT_CLASS_NAME} from "./highlight.js";

export function hasEmoji(value:string) {
  return /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u.test(value);
}

function nonDefault(value: string, defaultValue = "normal") {
  return !!value && value !== defaultValue;
}

interface MeasurementSession {
  measureText: (text:string) => number;
  verifyText?: (text:string) => number | undefined;
  measureExact?: (text:string) => number;
  dispose: () => void;
}

// One lazy DOM probe per update for CSS features Canvas cannot express.
// Include the component's own highlight markup when such text is decorated.
export function createMeasurementSession(element: HTMLElement, computed: CSSStyleDeclaration, query?: string): MeasurementSession {
  const emojiText = hasEmoji(element.dataset.truncateOriginal ?? "");
  const needsDOM = nonDefault(computed.fontVariantNumeric)
    || nonDefault(computed.fontFeatureSettings)
    || nonDefault(computed.fontVariationSettings)
    || (nonDefault(computed.wordSpacing) && computed.wordSpacing !== "0px")
    || nonDefault(computed.textTransform, "none");
  if (!needsDOM && !emojiText) return {measureText:createCanvasTextMeasurer(computed),dispose:()=>{}};
  const hasHighlights = !!query?.trim() && highlightedTextParts(element.dataset.truncateOriginal ?? "",query).some(part=>part.matched);
  let root: HTMLElement | undefined;
  let probe: HTMLElement;
  const box = getHorizontalBoxWidth(element);
  const measureDOM = (value: string) => {
    if (!root) {
      root = createInlineMeasurementRoot(element.ownerDocument);
      probe = createInlineTextMeasurementNode({sourceElement:element,text:value});
      probe.style.wordSpacing = computed.wordSpacing;
      probe.style.direction = computed.direction;
      probe.lang = element.closest("[lang]")?.getAttribute("lang") ?? element.ownerDocument.documentElement.lang;
      root.append(probe); element.ownerDocument.body.append(root);
    }
    if (!hasHighlights) { probe.textContent=value; }
    else probe.replaceChildren(...highlightedTextParts(value,query).map(part=>{
      if (!part.matched) return element.ownerDocument.createTextNode(part.text);
      const span=element.ownerDocument.createElement("span");
      span.dataset.slot="highlighted-match";span.className=HIGHLIGHT_CLASS_NAME;span.textContent=part.text;
      return span;
    }));
    const contentWidth = Math.max(0,probe.getBoundingClientRect().width - box);
    if (!hasHighlights) return contentWidth;
    // Inline positioned spans can extend the text range beyond the intrinsic
    // advance width of its containing box. Match the painted range oracle.
    const range=element.ownerDocument.createRange();range.selectNodeContents(probe);
    return Math.max(contentWidth,range.getBoundingClientRect().width);
  };
  return {
    measureText:needsDOM ? measureDOM : createCanvasTextMeasurer(computed),
    verifyText:!needsDOM && emojiText ? measureDOM : undefined,
    measureExact:!needsDOM && emojiText ? measureDOM : undefined,
    dispose() {root?.remove();},
  };
}
