// In 7-bit ASCII (0x00..0x7F), only CRLF (\r\n) forms a multi-code-unit
// grapheme cluster under UAX #29; all other ASCII characters are 1:1 graphemes.
export const NON_ASCII = /[\u0080-\uffff]/;
export const NON_ASCII_OR_CR = /[\r\u0080-\uffff]/;

let cachedSegmenterCtor: typeof Intl.Segmenter | undefined;
let cachedSegmenter: Intl.Segmenter | undefined;

function getGraphemeSegmenter(): Intl.Segmenter | null {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") return null;
  if (cachedSegmenterCtor !== Intl.Segmenter || !cachedSegmenter) {
    cachedSegmenterCtor = Intl.Segmenter;
    cachedSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  }
  return cachedSegmenter;
}

export function splitTextGraphemes(text: string): string[] {
  if (!text) return [];
  if (!NON_ASCII_OR_CR.test(text)) return text.split("");
  const segmenter = getGraphemeSegmenter();
  if (segmenter) {
    const result: string[] = [];
    for (const segment of segmenter.segment(text)) {
      result.push(segment.segment);
    }
    return result;
  }
  return Array.from(text);
}

export interface IndexedText {
  readonly length: number;
  readonly offsets: number[] | null;
  readonly text: string;
}

export function indexTextGraphemes(text: string): IndexedText {
  if (!NON_ASCII_OR_CR.test(text)) {
    return { text, length: text.length, offsets: null };
  }
  const offsets: number[] = [];
  const segmenter = getGraphemeSegmenter();
  if (segmenter) {
    for (const segment of segmenter.segment(text)) {
      offsets.push(segment.index);
    }
  } else {
    let i = 0;
    while (i < text.length) {
      offsets.push(i);
      const code = text.codePointAt(i)!;
      i += code > 0xffff ? 2 : 1;
    }
  }
  offsets.push(text.length);
  return { text, length: offsets.length - 1, offsets };
}

export function slicePrefix(indexed: IndexedText, count: number): string {
  if (count <= 0) return "";
  if (count >= indexed.length) return indexed.text;
  return indexed.text.slice(0, indexed.offsets ? indexed.offsets[count] : count);
}

export function sliceSuffix(indexed: IndexedText, count: number): string {
  if (count <= 0) return "";
  if (count >= indexed.length) return indexed.text;
  return indexed.text.slice(indexed.offsets ? indexed.offsets[indexed.length - count] : indexed.length - count);
}

/** UTF-16 offset where `slicePrefix(indexed, count)` ends. */
export function prefixEndOffset(indexed: IndexedText, count: number): number {
  if (count <= 0) return 0;
  if (count >= indexed.length) return indexed.text.length;
  return indexed.offsets ? indexed.offsets[count] : count;
}

/** UTF-16 offset where `sliceSuffix(indexed, count)` starts. */
export function suffixStartOffset(indexed: IndexedText, count: number): number {
  if (count <= 0) return indexed.text.length;
  if (count >= indexed.length) return 0;
  return indexed.offsets ? indexed.offsets[indexed.length - count] : indexed.length - count;
}
