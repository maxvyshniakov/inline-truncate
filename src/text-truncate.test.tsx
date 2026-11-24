import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { TextTruncate } from "./index";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Frames run only when the test says, so the render between a prop change
// and the next measurement can be inspected.
function queuedFrames(width: number) {
  globalThis.ResizeObserver = class { observe() {} disconnect() {} } as unknown as typeof ResizeObserver;
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.push(callback); return frames.length; });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "", measureText: (value: string) => ({ width: value.length }),
  } as unknown as CanvasRenderingContext2D);
  return () => act(() => { while (frames.length) frames.shift()!(0); });
}

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
});

describe("the truncated state", () => {
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
