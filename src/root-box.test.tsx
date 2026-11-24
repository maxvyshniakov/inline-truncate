import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { TextTruncate } from "./index";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const fileName = "Quarterly-design-review.pdf";

function measuredLayout(width: number) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "", measureText: (value: string) => ({ width: value.length * 10 }),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { width: (this.textContent?.length ?? 0) * 10, height: 16 } as DOMRect;
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
}

const classes = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("[data-truncate]")].map((root) => root.className);

// data-grid#148: the room for a highlight decoration is a paint clip 1px past
// each inline side of a measured root, so the root's box, what a host measures
// on it and a consumer className merge stay as on origin/dev: the root has no
// padding, margin or box-sizing of its own. scripts/highlight/check.mjs
// compares the boxes and Inline Measure's widths in the browsers.
describe("the root's classes", () => {
  it("are origin/dev's under CSS, and swap the measured root's overflow:hidden for a paint clip", () => {
    measuredLayout(100);
    const { container } = render(
      <>
        <TextTruncate mode="end" text={fileName} />
        <TextTruncate mode="end" ellipsis="start" text={fileName} />
        <TextTruncate mode="middle" text={fileName} />
        <TextTruncate mode="end" text={fileName} query="design" />
        <TextTruncate mode="end" ellipsis="start" text={fileName} query="design" />
      </>,
    );
    expect(classes(container)).toEqual([
      "block w-full min-w-0 truncate",
      "block w-full min-w-0 truncate [direction:rtl]",
      "block w-full min-w-0 whitespace-nowrap overflow-visible [clip-path:inset(0_-1px)]",
      "block w-full min-w-0 whitespace-nowrap overflow-visible [clip-path:inset(0_-1px)]",
      "block w-full min-w-0 whitespace-nowrap overflow-visible [clip-path:inset(0_-1px)] [direction:rtl]",
    ]);
  });

  it("clip flush while nothing is cut yet in middle mode, and around the marker alone", () => {
    measuredLayout(20);
    const { container } = render(<TextTruncate mode="middle" text={fileName} />);
    expect(container.querySelector("[data-truncate]")).toHaveTextContent("...");
    expect(classes(container)).toEqual(["block w-full min-w-0 whitespace-nowrap overflow-hidden"]);
  });

  for (const utility of ["px-2", "mx-2", "border", "box-border"]) {
    it(`merge a consumer's ${utility} as on origin/dev, with no box classes of their own`, () => {
      measuredLayout(100);
      const { container } = render(
        <>
          <TextTruncate mode="end" text={fileName} className={utility} />
          <TextTruncate mode="end" text={fileName} query="design" className={utility} />
          <TextTruncate mode="middle" text={fileName} className={utility} />
        </>,
      );
      for (const className of classes(container)) {
        const tokens = className.split(" ");
        expect(tokens).toContain(utility);
        expect(tokens.filter((token) => /^-?(?:p|m)[xytrblse]?-|^box-|^border/.test(token))).toEqual([utility]);
      }
    });
  }
});
