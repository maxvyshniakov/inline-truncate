import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { TextTruncate } from "./index";
import { resetMeasuredLayoutGlobals, stubMeasuredLayout } from "./__tests__/measured-layout";

afterEach(() => {
  cleanup();
  resetMeasuredLayoutGlobals();
  vi.restoreAllMocks();
});

// Frames run only when the test says, so the render between a prop change
// and the next measurement can be inspected.
const queuedFrames = (width: number) =>
  stubMeasuredLayout(width, { characterWidth: 1, queuedFrames: true, stubFonts: false }).flush;

const highlights = (root: Element) =>
  [...root.querySelectorAll('[data-truncate-visible] [data-slot="highlighted-match"]')].map((node) =>
    node.hasAttribute("data-truncate-marker") ? `{${node.textContent}}` : node.textContent);

describe("the frame between a text change and its measurement", () => {
  const before = "Quarterly-design-review.pdf";
  const after = "Quarterly-design-review-v2.pdf";

  it("does not match text that exists only where the shown ends join", () => {
    const flush = queuedFrames(10);
    const { container, rerender } = render(<TextTruncate mode="middle" text={before} query="a...." />);
    flush();
    expect(highlights(container)).toEqual([]);
    rerender(<TextTruncate mode="middle" text={after} query="a...." />);
    expect(highlights(container)).toEqual([]);
  });

  it("keeps the shown cut's highlighted marker", () => {
    const flush = queuedFrames(10);
    const { container, rerender } = render(<TextTruncate mode="middle" text={before} query="design" />);
    flush();
    expect(highlights(container)).toEqual(["{...}"]);
    rerender(<TextTruncate mode="middle" text={after} query="design" />);
    expect(highlights(container)).toEqual(["{...}"]);
    flush();
    expect(highlights(container)).toEqual(["{...}"]);
  });
});

// Highlighted Canvas text is verified in the DOM, and a DOM width can change
// with the device pixel ratio without a resize, as emoji widths do.
describe("the device pixel ratio", () => {
  function resolution() {
    let ratio = 1;
    vi.spyOn(window, "devicePixelRatio", "get").mockImplementation(() => ratio);
    const queries: { media: string; listeners: Set<() => void> }[] = [];
    const match = vi.spyOn(window, "matchMedia").mockImplementation((media) => {
      const query = { media, listeners: new Set<() => void>() };
      queries.push(query);
      return {
        media, matches: true,
        addEventListener: (_type: string, listener: () => void) => query.listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => query.listeners.delete(listener),
      } as unknown as MediaQueryList;
    });
    const live = () => queries.filter((query) => query.listeners.size > 0);
    return { match, live, change: (next: number) => { ratio = next; act(() => { for (const query of live()) for (const listener of query.listeners) listener(); }); } };
  }

  it("remeasures highlighted plain text when it changes, and stops listening without a match", () => {
    const flush = queuedFrames(16);
    const reads = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { width: this.textContent?.length ?? 0, height: 16 } as DOMRect;
    });
    const dpr = resolution();
    const text = "plain-spring-long-file-name.pdf";
    const { rerender } = render(<TextTruncate mode="middle" text={text} query="spring" />);
    flush();
    expect(dpr.live()).toHaveLength(1);
    reads.mockClear();
    dpr.change(2);
    flush();
    expect(reads).toHaveBeenCalled();
    expect(dpr.live().map((query) => query.media).join()).toContain("2dppx");
    rerender(<TextTruncate mode="middle" text={text} query="walnut" />);
    flush();
    expect(dpr.live()).toHaveLength(0);
  });

  it("starts listening when a new query or a new text brings a match", () => {
    const flush = queuedFrames(16);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { width: this.textContent?.length ?? 0, height: 16 } as DOMRect;
    });
    const dpr = resolution();
    const { rerender } = render(<TextTruncate mode="middle" text="plain-long-file-name.pdf" query="spring" />);
    flush();
    expect(dpr.live()).toHaveLength(0);
    rerender(<TextTruncate mode="middle" text="plain-spring-long-file-name.pdf" query="spring" />);
    flush();
    expect(dpr.live()).toHaveLength(1);
    rerender(<TextTruncate mode="middle" text="plain-spring-long-file-name.pdf" query="walnut" />);
    flush();
    expect(dpr.live()).toHaveLength(0);
    rerender(<TextTruncate mode="middle" text="plain-spring-long-file-name.pdf" query="long" />);
    flush();
    expect(dpr.live()).toHaveLength(1);
  });

  it("remeasures plain text measured in the DOM (a style Canvas cannot express)", () => {
    const flush = queuedFrames(16);
    const reads = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { width: this.textContent?.length ?? 0, height: 16 } as DOMRect;
    });
    const dpr = resolution();
    const { container } = render(<TextTruncate mode="middle" text="plain-long-file-name.pdf" />);
    container.querySelector<HTMLElement>("[data-truncate]")!.style.fontOpticalSizing = "none";
    flush();
    expect(dpr.live()).toHaveLength(1);
    reads.mockClear();
    dpr.change(2);
    flush();
    expect(reads).toHaveBeenCalled();
  });

  it("shares one resolution listener and reuses cached matches across 50 highlighted instances", () => {
    const COUNT = 50;
    const PREFIX = "plain-spring-long-file-name-";
    const flush = queuedFrames(16);
    const dpr = resolution();
    const reads = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { width: (this.textContent?.length ?? 0) * window.devicePixelRatio, height: 16 } as DOMRect;
    });
    const nativeToLowerCase = String.prototype.toLowerCase;
    let textLowercased = 0;
    vi.spyOn(String.prototype, "toLowerCase").mockImplementation(function (this: string) {
      if (String(this).startsWith(PREFIX)) textLowercased += 1;
      return nativeToLowerCase.call(this);
    });
    const items = Array.from({ length: COUNT }, (_, i) => `${PREFIX}${i}.pdf`);

    const { container, rerender, unmount } = render(
      <>
        {items.map((item) => (
          <TextTruncate key={item} mode="middle" text={item} query="spring" />
        ))}
      </>,
    );
    // Before the first flush, only HighlightedMatchText scans each item once (50).
    // syncResolutionNeed must not run a second uncached match scan in useLayoutEffect.
    expect(textLowercased).toBe(COUNT);

    textLowercased = 0;
    flush();
    // First flush scans once per measurement session (50) and once per CutHighlightedText render (50).
    expect(textLowercased).toBe(COUNT * 2);
    // All 50 matching instances share a single matchMedia query and a single listener.
    expect(dpr.match).toHaveBeenCalledTimes(1);
    expect(dpr.live()).toHaveLength(1);
    expect(dpr.live()[0].listeners.size).toBe(1);
    expect(dpr.live()[0].media).toContain("1dppx");

    const visibleLengths = () =>
      [...container.querySelectorAll("[data-truncate-visible]")].map((node) => node.textContent?.length ?? 0);
    const lengthsAt1x = visibleLengths();
    expect(lengthsAt1x).toHaveLength(COUNT);

    // DPR change notifies all 50 instances, rebinds once to 2dppx, shortens every
    // visible cut, and reuses cached match ranges during measurement (only
    // CutHighlightedText re-renders scan the updated cuts: 50 instead of 100).
    reads.mockClear();
    textLowercased = 0;
    dpr.change(2);
    flush();
    expect(reads.mock.calls.length).toBeGreaterThanOrEqual(COUNT);
    const lengthsAt2x = visibleLengths();
    expect(lengthsAt2x).toHaveLength(COUNT);
    for (let i = 0; i < COUNT; i++) {
      expect(lengthsAt2x[i]).toBeLessThan(lengthsAt1x[i]);
    }
    expect(dpr.match).toHaveBeenCalledTimes(2);
    expect(dpr.live()).toHaveLength(1);
    expect(dpr.live()[0].listeners.size).toBe(1);
    expect(dpr.live()[0].media).toContain("2dppx");
    expect(textLowercased).toBe(COUNT);

    // Unmounting 49 of 50 keeps the shared listener alive.
    rerender(<TextTruncate key={items[0]} mode="middle" text={items[0]} query="spring" />);
    expect(dpr.live()).toHaveLength(1);
    expect(dpr.live()[0].listeners.size).toBe(1);

    // Unmounting the last instance removes the shared listener cleanly (0 leaks).
    unmount();
    expect(dpr.live()).toHaveLength(0);
  });

  it("drops the resolution listener when an instance collapses to zero width", () => {
    let width = 16;
    globalThis.ResizeObserver = class { observe() {} disconnect() {} } as unknown as typeof ResizeObserver;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.push(callback); return frames.length; });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      font: "", measureText: (value: string) => ({ width: value.length }),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { width: this.hasAttribute("data-truncate") ? width : (this.textContent?.length ?? 0), height: 16 } as DOMRect;
    });
    const flush = () => act(() => { while (frames.length) frames.shift()!(0); });
    const dpr = resolution();
    const text = "plain-spring-long-file-name.pdf";

    const { rerender } = render(<TextTruncate mode="middle" text={text} query="spring" />);
    flush();
    expect(dpr.live()).toHaveLength(1);

    width = 0;
    rerender(<TextTruncate mode="middle" text={text} query="walnut" />);
    flush();
    expect(dpr.live()).toHaveLength(0);
  });

  it("routes resolution subscription and DPR reads through element.ownerDocument.defaultView", () => {
    const flush = queuedFrames(16);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { width: this.textContent?.length ?? 0, height: 16 } as DOMRect;
    });
    const globalMatch = vi.spyOn(window, "matchMedia");
    const viewQueries: { media: string; listeners: Set<() => void> }[] = [];
    const viewMatch = vi.fn((media: string) => {
      const query = { media, listeners: new Set<() => void>() };
      viewQueries.push(query);
      return {
        media,
        matches: true,
        addEventListener: (_type: string, listener: () => void) => query.listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => query.listeners.delete(listener),
      } as unknown as MediaQueryList;
    });
    const fakeView = Object.create(window, {
      devicePixelRatio: { get: () => 3 },
      matchMedia: { value: viewMatch },
    }) as Window & typeof globalThis;
    vi.spyOn(document, "defaultView", "get").mockReturnValue(fakeView);

    const { unmount } = render(<TextTruncate mode="middle" text="plain-spring-long-file-name.pdf" query="spring" />);
    flush();

    expect(globalMatch).not.toHaveBeenCalled();
    expect(viewMatch).toHaveBeenCalledTimes(1);
    expect(viewQueries[0].media).toBe("(resolution: 3dppx)");

    unmount();
    expect(viewQueries[0].listeners.size).toBe(0);
  });
});

describe("the truncated state", () => {
  for (const [name, measured, css] of [
    ["the CSS strategy", { strategy: "measure" as const, mode: "middle" as const }, { strategy: "css" as const, mode: "middle" as const }],
    ["mode under strategy auto", { mode: "middle" as const }, { mode: "end" as const }],
  ] as const) it(`drops a previous cut when ${name} took over in between`, () => {
    const flush = queuedFrames(40);
    const longer = "a-much-longer-file-name-than-fits-the-cell.pdf";
    const { container, rerender } = render(<TextTruncate {...measured} text={longer} />);
    flush();
    const root = container.querySelector<HTMLElement>("[data-truncate]")!;
    expect(root.dataset.truncateState).toBe("truncated");
    rerender(<TextTruncate {...css} text="short.pdf" />);
    flush();
    rerender(<TextTruncate {...measured} text="short.pdf" />);
    expect(root.dataset.truncateState).toBeUndefined();
    expect(root.querySelector("[data-truncate-full-text]")).toBeNull();
    expect(root.textContent).toBe("short.pdf");
  });

  it("keeps the held cut when resuming measurement for the same text (middle -> end -> middle)", () => {
    const flush = queuedFrames(20);
    const longer = "a-much-longer-file-name-than-fits-the-cell.pdf";
    const { container, rerender } = render(<TextTruncate mode="middle" text={longer} />);
    flush();
    const root = container.querySelector<HTMLElement>("[data-truncate]")!;
    const cutText = root.querySelector("[data-truncate-visible]")!.textContent;
    expect(root.dataset.truncateState).toBe("truncated");
    expect(cutText).toContain("...");

    // Switch to CSS end mode and back to measured middle mode with the same text.
    rerender(<TextTruncate mode="end" text={longer} />);
    expect(root.dataset.truncateStrategy).toBe("css");
    rerender(<TextTruncate mode="middle" text={longer} />);
    // Before the next measurement frame runs, the held cut stays up instead of
    // flashing clipped full text without an ellipsis.
    expect(root.dataset.truncateState).toBe("truncated");
    expect(root.querySelector("[data-truncate-visible]")!.textContent).toBe(cutText);
    flush();
    expect(root.dataset.truncateState).toBe("truncated");
    expect(root.querySelector("[data-truncate-visible]")!.textContent).toBe(cutText);
  });

  it("is not claimed for a result that fit while a new text waits for its measurement", () => {
    const flush = queuedFrames(40);
    const { container, rerender } = render(<TextTruncate mode="middle" text="short.pdf" />);
    flush();
    const root = container.querySelector<HTMLElement>("[data-truncate]")!;
    expect(root.dataset.truncateState).toBeUndefined();
    const longer = "a-much-longer-file-name-than-fits-the-cell.pdf";
    rerender(<TextTruncate mode="middle" text={longer} />);
    expect(root.dataset.truncateState).toBeUndefined();
    expect(root.querySelector("[data-truncate-full-text]")).toBeNull();
    expect(root.textContent).toBe(longer);
    flush();
    expect(root.dataset.truncateState).toBe("truncated");
  });

  it("is not claimed after switching from the CSS strategy to measuring a new text", () => {
    const flush = queuedFrames(40);
    const { container, rerender } = render(<TextTruncate mode="end" strategy="css" text="short.pdf" />);
    flush();
    const longer = "a-much-longer-file-name-than-fits-the-cell.pdf";
    rerender(<TextTruncate mode="end" strategy="measure" text={longer} />);
    const root = container.querySelector<HTMLElement>("[data-truncate]")!;
    expect(root.dataset.truncateState).toBeUndefined();
    expect(root.querySelector("[data-truncate-full-text]")).toBeNull();
    flush();
    expect(root.dataset.truncateState).toBe("truncated");
  });
});

describe("highlight spans of a cut", () => {
  it("are recreated when a same-length text keeps the cut and the visible string", () => {
    // A match starting inside the cut straddles into the suffix: the visible
    // string and the cut are the same, the suffix's highlight is not.
    const flush = queuedFrames(19);
    const { container, rerender } = render(<TextTruncate mode="middle" text="prefix--xxxxababab.pdf" query="abab" />);
    flush();
    const visible = () => container.querySelector("[data-truncate-visible]")!;
    const spans = () => [...visible().querySelectorAll('[data-slot="highlighted-match"]')];
    const before = { text: visible().textContent, spans: spans() };
    expect(before.text).toBe("prefix--...abab.pdf");
    rerender(<TextTruncate mode="middle" text="prefix--ababxxabab.pdf" query="abab" />);
    flush();
    expect(visible().textContent).toBe(before.text);
    expect(spans().length).toBeGreaterThan(0);
    for (const span of spans()) expect(before.spans).not.toContain(span);
  });

  // Positioned inline spans can keep stale shaping when React reuses them, so
  // a different cut or source recreates them even if the visible string is
  // the same.
  it("are recreated when a new text keeps the same visible string", () => {
    const flush = queuedFrames(10);
    const { container, rerender } = render(<TextTruncate mode="middle" text="Quarterly-design-review.pdf" query="design" />);
    flush();
    const shown = () => container.querySelector("[data-truncate-visible]")!.textContent;
    const marker = () => container.querySelector("[data-truncate-marker]");
    const before = { text: shown(), node: marker() };
    expect(before.node).not.toBeNull();
    rerender(<TextTruncate mode="middle" text="Quarterly-design-reviews.pdf" query="design" />);
    flush();
    expect(shown()).toBe(before.text);
    expect(marker()).not.toBeNull();
    expect(marker()).not.toBe(before.node);
  });
});
