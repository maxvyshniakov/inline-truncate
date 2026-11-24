import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { TextTruncate } from "./index";
import { widthCacheKey } from "./scheduler";

// Cached widths are reused across frames, so every input a width depends on
// must drop what it changes. Here the DOM probe draws highlights 4px wider per
// highlighted run, as WebKit does when a span splits shaping. Every case asks
// whether the visible string still fits under that same rule.
const HIGHLIGHT_EXTRA = 4;
const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");

afterEach(() => {
  cleanup();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else delete (document as unknown as { fonts?: unknown }).fonts;
  vi.restoreAllMocks();
});

let highlightExtra = HIGHLIGHT_EXTRA;
function drawnWidth(node: Element) {
  return (node.textContent?.length ?? 0) + highlightExtra * node.querySelectorAll('[data-slot="highlighted-match"]').length;
}

function scene(initialWidth: number, extra = HIGHLIGHT_EXTRA) {
  highlightExtra = extra;
  let width = initialWidth;
  let notify: () => void = () => {};
  globalThis.ResizeObserver = class {
    constructor(callback: () => void) { notify = callback; }
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  const fonts = Object.assign(new EventTarget(), { status: "loaded" });
  Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.push(callback); return frames.length; });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "", measureText: (value: string) => ({ width: value.length }),
  } as unknown as CanvasRenderingContext2D);
  let scale = 1;
  const reads = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { width: drawnWidth(this) * scale, height: 16 } as DOMRect;
  });
  const flush = () => act(() => { while (frames.length) frames.shift()!(0); });
  return {
    reads,
    flush,
    resize: (next: number) => { width = next; act(() => notify()); flush(); },
    fontsChanged: (nextScale: number) => { scale = nextScale; act(() => { fonts.dispatchEvent(new Event("loadingdone")); }); flush(); },
    get width() { return width; },
  };
}

// Measured in the DOM: optical sizing off is a style canvas cannot express.
function domMeasured(container: HTMLElement) {
  const root = container.querySelector<HTMLElement>("[data-truncate]")!;
  root.style.fontOpticalSizing = "none";
  return root;
}

function visible(root: HTMLElement) {
  return root.querySelector(":scope > [data-truncate-visible]") ?? root;
}

const TEXT = "oak-collection-spring-lookbook.pdf"; // 34 units

describe("cached widths are dropped for every input they depend on", () => {
  it("query: a new query's highlight is measured, not the previous query's", () => {
    const view = scene(24);
    const { container, rerender } = render(<TextTruncate mode="middle" text={TEXT} query="walnut" />);
    const root = domMeasured(container);
    view.flush();
    expect(drawnWidth(visible(root))).toBeLessThanOrEqual(view.width);
    // "spring" straddles the cut or sits in it: the marker or a run is highlighted.
    rerender(<TextTruncate mode="middle" text={TEXT} query="spring" />);
    view.flush();
    expect(visible(root).querySelector('[data-slot="highlighted-match"]')).not.toBeNull();
    expect(drawnWidth(visible(root))).toBeLessThanOrEqual(view.width);
  });

  it("query: text that fits plain is cut once its highlight no longer fits, and fits again without it", () => {
    const view = scene(TEXT.length + 1);
    const { container, rerender } = render(<TextTruncate mode="middle" text={TEXT} />);
    const root = domMeasured(container);
    view.flush();
    expect(visible(root).textContent).toBe(TEXT);
    rerender(<TextTruncate mode="middle" text={TEXT} query="lookbook" />);
    view.flush();
    expect(root.dataset.truncateState).toBe("truncated");
    expect(drawnWidth(visible(root))).toBeLessThanOrEqual(view.width);
    rerender(<TextTruncate mode="middle" text={TEXT} query="" />);
    view.flush();
    expect(visible(root).textContent).toBe(TEXT);
  });

  it("text: a new text is measured, not the previous text's candidates", () => {
    const view = scene(24);
    const { container, rerender } = render(<TextTruncate mode="middle" text={TEXT} query="spring" />);
    const root = domMeasured(container);
    view.flush();
    const next = "spring-oak-collection-lookbook.pdf";
    rerender(<TextTruncate mode="middle" text={next} query="spring" />);
    view.flush();
    expect(root.dataset.truncateOriginal).toBe(next);
    expect(drawnWidth(visible(root))).toBeLessThanOrEqual(view.width);
    expect(visible(root).textContent!.startsWith("spring")).toBe(true);
  });

  it("font: a font change remeasures instead of reusing widths drawn in the old font", () => {
    const view = scene(24);
    const { container } = render(<TextTruncate mode="middle" text={TEXT} query="spring" />);
    const root = domMeasured(container);
    view.flush();
    const before = visible(root).textContent!;
    view.fontsChanged(2);
    expect(visible(root).textContent!.length).toBeLessThan(before.length);
    expect(drawnWidth(visible(root)) * 2).toBeLessThanOrEqual(view.width);
  });

  it("style: a class change remeasures instead of reusing widths drawn in the old style", () => {
    const view = scene(24);
    const { container, rerender } = render(<TextTruncate mode="middle" text={TEXT} query="spring" className="a" />);
    const root = domMeasured(container);
    view.flush();
    view.reads.mockClear();
    rerender(<TextTruncate mode="middle" text={TEXT} query="spring" className="b" />);
    domMeasured(container);
    view.flush();
    expect(view.reads).toHaveBeenCalled();
    expect(drawnWidth(visible(root))).toBeLessThanOrEqual(view.width);
  });

  it("width: a new width reuses the cache and still fits", () => {
    const view = scene(24);
    const { container } = render(<TextTruncate mode="middle" text={TEXT} query="spring" />);
    const root = domMeasured(container);
    view.flush();
    for (const next of [30, 16, 24]) {
      view.resize(next);
      expect(drawnWidth(visible(root))).toBeLessThanOrEqual(next);
    }
  });
});

// Two candidates must never share a cached width: a cut candidate and an uncut
// string (the full text, an edge), or two cuts that make the same string.
describe("cached widths are keyed so no two candidates share one", () => {
  // One unit per UTF-16 unit everywhere, so only a shared cache entry can
  // make the result differ from the plain search.
  for (const path of ["canvas", "dom", "emoji"] as const) {
    const text = path === "emoji" ? "0:7:...🪑" : "0:7:...";
    it(`${path}: a string that reads like a cut key keeps its own width`, () => {
      const view = scene(text.length - 1, 0);
      for (const mode of ["end", "middle"] as const) {
        const { container, unmount } = render(<TextTruncate mode={mode} strategy="measure" text={text} query="0" />);
        const root = path === "dom" ? domMeasured(container) : container.querySelector<HTMLElement>("[data-truncate]")!;
        view.flush();
        const shown = visible(root).textContent!;
        expect(shown).not.toBe("...");
        expect(shown.length).toBe(text.length - 1);
        unmount();
      }
    });
  }

  it("two cuts that make one visible string get two keys, and no uncut string gets a cut's key", () => {
    const text = "a...MIDDLE...z";
    const left = { prefixEnd: 4, suffixStart: 13 }; // "a..." + "..." + "z"
    const right = { prefixEnd: 1, suffixStart: 10 }; // "a" + "..." + "...z"
    const shown = (cut: { prefixEnd: number; suffixStart: number }) => text.slice(0, cut.prefixEnd) + "..." + text.slice(cut.suffixStart);
    expect(shown(left)).toBe(shown(right));
    expect(widthCacheKey(shown(left), left, true)).not.toBe(widthCacheKey(shown(right), right, true));
    expect(widthCacheKey("0:7:...", undefined, true)).not.toBe(widthCacheKey("...", { prefixEnd: 0, suffixStart: 7 }, true));
    // Without cut-drawn markup a width belongs to the string alone.
    expect(widthCacheKey(shown(left), left, false)).toBe(widthCacheKey(shown(right), right, false));
  });
});

// Canvas measures the plain string; a highlight span can paint wider (WebKit
// splits shaping at it). So with a match, the final string is verified in the
// DOM, as emoji text is.
describe("highlighted text on the Canvas path", () => {
  for (const [name, query] of [["a visible match", "oak"], ["a match in the cut", "lookbook"], ["a straddling match", "spring"]] as const) {
    for (const mode of ["middle", "end"] as const) it(`fits as drawn with ${name} (${mode})`, () => {
      const view = scene(24);
      const { container } = render(<TextTruncate mode={mode} strategy="measure" text={TEXT} query={query} />);
      view.flush();
      const root = container.querySelector<HTMLElement>("[data-truncate]")!;
      expect(drawnWidth(visible(root))).toBeLessThanOrEqual(view.width);
    });
  }

  it("fits as drawn when the whole text fits on Canvas but not with its highlight", () => {
    const view = scene(TEXT.length + 1);
    const { container } = render(<TextTruncate mode="middle" text={TEXT} query="lookbook" />);
    view.flush();
    const root = container.querySelector<HTMLElement>("[data-truncate]")!;
    expect(drawnWidth(visible(root))).toBeLessThanOrEqual(view.width);
  });

  it("measures nothing in the DOM without a match", () => {
    const view = scene(24);
    render(<TextTruncate mode="middle" text={TEXT} query="walnut" />);
    view.flush();
    expect(view.reads).not.toHaveBeenCalled();
  });
});
