import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { TextTruncate } from "./index";
import { resetMeasuredLayoutGlobals, stubMeasuredLayout } from "./__tests__/measured-layout";

afterEach(() => {
  cleanup();
  resetMeasuredLayoutGlobals();
  vi.restoreAllMocks();
});

const fileName = "Quarterly-design-review.pdf";

const measuredLayout = (width: number) => stubMeasuredLayout(width, { stubRect: true, stubFonts: false });

const classes = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("[data-truncate]")].map((root) => root.className);

// data-grid#148: the room for a highlight decoration is a paint clip 1px past
// each inline side of a DOM-verified highlighted root, so the root's box, what
// a host measures on it and a consumer className merge stay as on origin/dev:
// the root has no padding, margin or box-sizing of its own. Plain Canvas-only
// roots keep overflow-hidden so subpixel discrepancies never add to an
// ancestor's scroll size. scripts/highlight/check.mjs compares the boxes and
// Inline Measure's widths in the browsers.
describe("the root's classes", () => {
  it("keep overflow-hidden for plain measured roots and use a paint clip for verified highlighted roots", () => {
    measuredLayout(100);
    const { container } = render(
      <>
        <TextTruncate mode="end" text={fileName} />
        <TextTruncate mode="end" ellipsis="start" text={fileName} />
        <TextTruncate mode="middle" text={fileName} />
        <TextTruncate mode="middle" text={fileName} query="design" />
        <TextTruncate mode="end" text={fileName} query="design" />
        <TextTruncate mode="end" ellipsis="start" text={fileName} query="design" />
      </>,
    );
    expect(classes(container)).toEqual([
      "block w-full min-w-0 truncate",
      "block w-full min-w-0 truncate [direction:rtl]",
      "block w-full min-w-0 whitespace-nowrap overflow-hidden",
      "block w-full min-w-0 whitespace-nowrap overflow-visible [clip-path:inset(0_-1px)]",
      "block w-full min-w-0 whitespace-nowrap overflow-visible [clip-path:inset(0_-1px)]",
      "block w-full min-w-0 whitespace-nowrap overflow-visible [clip-path:inset(0_-1px)] [direction:rtl]",
    ]);
  });

  it("clip flush while nothing is cut yet in middle mode, and around the marker alone", () => {
    measuredLayout(20);
    const { container } = render(<TextTruncate mode="middle" text={fileName} query="design" />);
    expect(container.querySelector("[data-truncate]")).toHaveTextContent("...");
    expect(classes(container)).toEqual(["block w-full min-w-0 whitespace-nowrap overflow-hidden"]);
  });

  it("clips flush on a shrink between frames until the narrower width commits", () => {
    const layout = stubMeasuredLayout(120, { queuedFrames: true, stubRect: true, stubFonts: false });
    const { container } = render(<TextTruncate mode="end" text={fileName} query="design" />);
    layout.flush();
    const root = container.querySelector<HTMLElement>("[data-truncate]")!;
    expect(root.className).toContain("overflow-visible");
    expect(root.style.overflow).toBe("");

    // Shrink the container and notify ResizeObserver without running the next RAF yet.
    layout.setWidth(80);
    layout.deliverResize(root);
    expect(root.style.overflow).toBe("hidden");

    // Once the measurement frame commits, the temporary clip is lifted.
    layout.flush();
    expect(root.style.overflow).toBe("");
    expect(root.className).toContain("overflow-visible");
  });

  it("keeps clipping across continuous multi-frame shrinks (200 -> 160 -> 120 -> 80)", () => {
    const layout = stubMeasuredLayout(200, { queuedFrames: true, stubRect: true, stubFonts: false });
    const { container } = render(<TextTruncate mode="end" text={fileName} query="design" />);
    layout.flush();
    const root = container.querySelector<HTMLElement>("[data-truncate]")!;
    expect(root.style.overflow).toBe("");

    for (const next of [160, 120, 80]) {
      layout.setWidth(next);
      layout.deliverResize(root);
      expect(root.style.overflow).toBe("hidden");
      layout.flush();
      expect(root.style.overflow).toBe("");
    }
  });

  it("clears the temporary clip when width bounces back to completedWidth before the frame runs", () => {
    const layout = stubMeasuredLayout(120, { queuedFrames: true, stubRect: true, stubFonts: false });
    const { container } = render(<TextTruncate mode="end" text={fileName} query="design" />);
    layout.flush();
    const root = container.querySelector<HTMLElement>("[data-truncate]")!;
    expect(root.style.overflow).toBe("");

    // Shrink to 80 triggers the temporary clip, then bounce back to 120 before RAF runs.
    layout.setWidth(80);
    layout.deliverResize(root);
    expect(root.style.overflow).toBe("hidden");
    layout.setWidth(120);
    layout.deliverResize(root);
    layout.flush();
    expect(root.style.overflow).toBe("");
  });

  it("detects shrinks smaller than horizontal padding by comparing content width", () => {
    const layout = stubMeasuredLayout(120, { queuedFrames: true, stubRect: true, stubFonts: false });
    const { container } = render(<TextTruncate mode="end" text={fileName} query="design" />);
    const root = container.querySelector<HTMLElement>("[data-truncate]")!;
    root.style.paddingLeft = "8px";
    root.style.paddingRight = "8px";
    layout.flush();
    expect(root.style.overflow).toBe("");

    // Shrink by 8px (less than the 16px total horizontal padding: clientWidth 120 -> 112,
    // content width 104 -> 96). Must still trigger the temporary clip.
    layout.setWidth(112);
    layout.deliverResize(root);
    expect(root.style.overflow).toBe("hidden");
    layout.flush();
    expect(root.style.overflow).toBe("");
  });

  it("clips flush when resuming a held cut after strategy changes and box shrinks in CSS", () => {
    const layout = stubMeasuredLayout(160, { queuedFrames: true, stubRect: true, stubFonts: false });
    const { container, rerender } = render(
      <TextTruncate mode="middle" strategy="measure" text={fileName} query="design" />,
    );
    layout.flush();
    const root = container.querySelector<HTMLElement>("[data-truncate]")!;
    expect(root.className).toContain("overflow-visible");

    // Switch to CSS, shrink the box while CSS is active, then resume measure.
    rerender(<TextTruncate mode="middle" strategy="css" text={fileName} query="design" />);
    layout.setWidth(90);
    rerender(<TextTruncate mode="middle" strategy="measure" text={fileName} query="design" />);
    // Held cut stays visible, but verified is false so it clips flush with overflow-hidden.
    expect(root.dataset.truncateState).toBe("truncated");
    expect(root.className).toContain("overflow-hidden");
    expect(root.className).not.toContain("overflow-visible");

    // After re-verification at 90px, paint-clip returns.
    layout.flush();
    expect(root.className).toContain("overflow-visible");
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
