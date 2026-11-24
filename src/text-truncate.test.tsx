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
