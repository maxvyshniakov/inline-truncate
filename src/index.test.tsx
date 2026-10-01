import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { HighlightedMatchText, TextTruncate, truncateText } from "./index";

const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
const originalRO = globalThis.ResizeObserver;

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
  vi.restoreAllMocks();
});

describe("truncateText", () => {
  // One unit per UTF-16 code unit: a code-point cut could keep "👍" and drop its
  // skin-tone modifier, which a grapheme cut must not do.
  const measureText = (value: string) => value.length;

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
