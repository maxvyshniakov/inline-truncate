import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { HighlightedMatchText, TextTruncate, truncateText } from "./index";

const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
const originalRO = globalThis.ResizeObserver;
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const originalGetContext = HTMLCanvasElement.prototype.getContext;

function stubResizeObserver() {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

function stubDocumentFonts(status: "loaded" | "loading", readySpy: () => void) {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      status,
      get ready() {
        readySpy();
        return Promise.resolve();
      },
    },
  });
}

afterEach(() => {
  cleanup();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else delete (document as unknown as { fonts?: unknown }).fonts;
  globalThis.ResizeObserver = originalRO;
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
  else Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  vi.restoreAllMocks();
});

const CHARACTER_WIDTH = 10;

// Deterministic layout for the measure strategy: every root is `width` pixels
// wide, Inline Measure's canvas gives every UTF-16 unit CHARACTER_WIDTH pixels,
// and animation frames run at once.
function stubMeasuredLayout(width: number) {
  stubResizeObserver();
  stubDocumentFonts("loaded", () => {});
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });
  const getContext = vi.fn(() => ({
    font: "",
    measureText: (value: string) => ({ width: value.length * CHARACTER_WIDTH }),
  }));
  HTMLCanvasElement.prototype.getContext = getContext as unknown as typeof HTMLCanvasElement.prototype.getContext;
  const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  return { getContext, requestAnimationFrame };
}

function truncateRoot(container: HTMLElement) {
  const root = container.querySelector<HTMLElement>("[data-truncate]");
  if (!root) throw new Error("TextTruncate root not rendered");
  return root;
}

describe("truncateText", () => {
  // One unit per UTF-16 code unit: a code-point cut could keep "👍" and drop its
  // skin-tone modifier, which a grapheme cut must not do.
  const measureText = (value: string) => value.length;

  it("returns text that fits untouched", () => {
    expect(truncateText({ text: "report.pdf", maxWidth: 10, measureText, mode: "end" })).toEqual({
      text: "report.pdf",
      truncated: false,
    });
    expect(truncateText({ text: "report.pdf", maxWidth: 0, measureText, mode: "middle" })).toEqual({
      text: "report.pdf",
      truncated: false,
    });
  });

  it("keeps the start of the text in end mode", () => {
    expect(truncateText({ text: "abcdefghij", maxWidth: 6, measureText, mode: "end" })).toEqual({
      text: "abc...",
      truncated: true,
    });
  });

  it("keeps both ends of the text, balanced, in middle mode", () => {
    expect(truncateText({ text: "abcdefghij", maxWidth: 7, measureText, mode: "middle" })).toEqual({
      text: "ab...ij",
      truncated: true,
    });
  });

  it("returns the marker alone when the width cannot fit more than the marker", () => {
    for (const mode of ["end", "middle"] as const) {
      expect(truncateText({ text: "abcdefghij", maxWidth: 2, measureText, mode })).toEqual({
        text: "...",
        truncated: true,
      });
    }
  });

  it("keeps whole grapheme clusters before the end marker", () => {
    expect(truncateText({ text: "a👍🏽bc", maxWidth: 6, measureText, mode: "end" })).toEqual({
      text: "a...",
      truncated: true,
    });
  });

  it("keeps whole grapheme clusters on both sides of the middle marker", () => {
    expect(truncateText({ text: "a👍🏽bc👍🏽d", maxWidth: 8, measureText, mode: "middle" })).toEqual({
      text: "a...d",
      truncated: true,
    });
  });
});

describe("HighlightedMatchText", () => {
  it("wraps every matching occurrence in a named match span", () => {
    render(<HighlightedMatchText text="photo-photo.jpg" query="photo" />);

    const matches = screen.getAllByText("photo");
    expect(matches).toHaveLength(2);
    for (const match of matches) {
      expect(match.getAttribute("data-slot")).toBe("highlighted-match");
      expect(match.tagName).toBe("SPAN");
    }
  });

  it("keeps text plain when query is empty", () => {
    const { container } = render(<HighlightedMatchText text="photo.jpg" query="" />);

    expect(container.textContent).toBe("photo.jpg");
    expect(container.querySelector("[data-slot='highlighted-match']")).toBeNull();
  });
});

describe("TextTruncate font-readiness cost", () => {
  it("does not touch the expensive document.fonts.ready getter once fonts are loaded", () => {
    stubResizeObserver();
    const readySpy = vi.fn();
    stubDocumentFonts("loaded", readySpy);

    render(<TextTruncate mode="middle" text="a-very-long-filename-that-truncates.webp" />);

    expect(readySpy).not.toHaveBeenCalled();
  });

  it("accesses document.fonts.ready at most once across many rows while fonts are still loading", () => {
    stubResizeObserver();
    const readySpy = vi.fn();
    stubDocumentFonts("loading", readySpy);

    render(
      <>
        {Array.from({ length: 20 }, (_, i) => (
          <TextTruncate key={i} mode="middle" text={`row-${i}-long-filename.webp`} />
        ))}
      </>,
    );

    expect(readySpy.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe("TextTruncate", () => {
  const fileName = "Quarterly-design-review.pdf";

  it("truncates with CSS and measures nothing when strategy is css", () => {
    const { getContext, requestAnimationFrame } = stubMeasuredLayout(100);

    const { container } = render(
      <TextTruncate mode="middle" strategy="css" text={fileName} className="text-sm" />,
    );

    const root = truncateRoot(container);
    expect(root).toHaveTextContent(fileName);
    expect(root).toHaveAttribute("data-truncate-strategy", "css");
    expect(root).not.toHaveAttribute("data-truncate-state");
    expect(root).toHaveClass("truncate", "text-sm");
    expect(getContext).not.toHaveBeenCalled();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("renders the measured truncation and keeps the original text when strategy is measure", () => {
    stubMeasuredLayout(100);

    const { container } = render(<TextTruncate mode="end" strategy="measure" text={fileName} />);

    const root = truncateRoot(container);
    expect(root.textContent).toBe("Quarter...");
    expect(root).toHaveAttribute("data-truncate-strategy", "measure");
    expect(root).toHaveAttribute("data-truncate-state", "truncated");
    expect(root).toHaveAttribute("data-truncate-original", fileName);
  });

  it("leaves measured text that fits whole and unmarked", () => {
    stubMeasuredLayout(400);

    const { container } = render(<TextTruncate mode="middle" strategy="measure" text={fileName} />);

    const root = truncateRoot(container);
    expect(root.textContent).toBe(fileName);
    expect(root).not.toHaveAttribute("data-truncate-state");
  });

  it("measures middle mode and uses CSS for end mode when strategy is auto", () => {
    stubMeasuredLayout(100);

    const { container } = render(
      <>
        <TextTruncate mode="middle" text={fileName} />
        <TextTruncate mode="end" text={fileName} />
      </>,
    );

    const [middle, end] = container.querySelectorAll<HTMLElement>("[data-truncate]");
    expect(middle).toHaveAttribute("data-truncate-strategy", "measure");
    expect(middle.textContent).toBe("Qua....pdf");
    expect(end).toHaveAttribute("data-truncate-strategy", "css");
    expect(end.textContent).toBe(fileName);
  });

  it("puts the ellipsis first with CSS, isolating the text, when ellipsis is start", () => {
    stubMeasuredLayout(100);

    const { container } = render(<TextTruncate mode="end" ellipsis="start" text={fileName} />);

    const root = truncateRoot(container);
    expect(root).toHaveClass("truncate", "[direction:rtl]");
    expect(root).toHaveAttribute("data-tip-align", "end");
    expect(root).toHaveAttribute("data-truncate-overflow-target", ":scope > bdi");
    const bdi = root.querySelector(":scope > bdi");
    expect(bdi).not.toBeNull();
    expect(bdi).toHaveTextContent(fileName);
  });

  it("ignores ellipsis start under the measure strategy", () => {
    stubMeasuredLayout(100);

    const { container } = render(<TextTruncate mode="middle" ellipsis="start" text={fileName} />);

    const root = truncateRoot(container);
    expect(root.textContent).toBe("Qua....pdf");
    expect(root).not.toHaveClass("[direction:rtl]");
    expect(root).not.toHaveAttribute("data-tip-align");
    expect(root.querySelector("bdi")).toBeNull();
  });

  it("highlights query matches in the visible part of the truncated text", () => {
    stubMeasuredLayout(100);

    const { container } = render(<TextTruncate mode="middle" text={fileName} query="PDF" />);

    const root = truncateRoot(container);
    expect(root.textContent).toBe("Qua....pdf");
    const matches = root.querySelectorAll("[data-slot='highlighted-match']");
    expect(Array.from(matches, (match) => match.textContent)).toEqual(["pdf"]);
  });

  it("does not highlight a query match that truncation hid", () => {
    stubMeasuredLayout(100);

    const { container } = render(<TextTruncate mode="middle" text={fileName} query="design" />);

    const root = truncateRoot(container);
    expect(root.textContent).toBe("Qua....pdf");
    expect(root.querySelector("[data-slot='highlighted-match']")).toBeNull();
  });

  it("publishes measureExtra for host measurement without changing its own truncation", () => {
    stubMeasuredLayout(100);

    const { container } = render(
      <>
        <TextTruncate mode="middle" text={fileName} measureExtra={24} />
        <TextTruncate mode="middle" text={fileName} />
      </>,
    );

    const [withExtra, without] = container.querySelectorAll<HTMLElement>("[data-truncate]");
    expect(withExtra).toHaveAttribute("data-truncate-measure-extra", "24");
    expect(without).not.toHaveAttribute("data-truncate-measure-extra");
    expect(withExtra.textContent).toBe(without.textContent);
  });
});
