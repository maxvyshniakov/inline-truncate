import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { TextTruncate } from "./index";
import { indexTextGraphemes } from "./graphemes";
import { truncatePrepared } from "./truncation";

// Ten units per UTF-16 code unit, as index.test.tsx measures.
function measuredLayout(width: number) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "", measureText: (value: string) => ({ width: value.length * 10 }),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { width: (this.textContent?.length ?? 0) * 10, height: 16 } as DOMRect;
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
  return { getContext };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const fileName = "Quarterly-design-review.pdf";
const root = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-truncate]")!;
const visible = (node: HTMLElement) => (node.querySelector("[data-truncate-visible]") ?? node).textContent;
const highlights = (node: HTMLElement) =>
  [...(node.querySelector("[data-truncate-visible]") ?? node).querySelectorAll('[data-slot="highlighted-match"]')].map((match) =>
    match.hasAttribute("data-truncate-marker") ? `{${match.textContent}}` : match.textContent);

// inline-truncate#8: the browser's own ellipsis is no node, so it cannot take
// the highlight; under "auto", end mode measures whenever the query matches.
describe("strategy auto in end mode", () => {
  it("measures when the query matches, so the marker takes a hidden match's highlight", () => {
    measuredLayout(100);
    const { container } = render(<TextTruncate mode="end" text={fileName} query="review" />);
    expect(root(container)).toHaveAttribute("data-truncate-strategy", "measure");
    expect(visible(root(container))).toBe("Quarter...");
    expect(highlights(root(container))).toEqual(["{...}"]);
  });

  it("highlights the visible part and the marker for a match the cut splits", () => {
    measuredLayout(100);
    const { container } = render(<TextTruncate mode="end" text={fileName} query="terly" />);
    expect(visible(root(container))).toBe("Quarter...");
    expect(highlights(root(container))).toEqual(["ter", "{...}"]);
  });

  it("keeps CSS, measuring nothing, without a query, with a blank one or with one that does not match", () => {
    const { getContext } = measuredLayout(100);
    const { container } = render(
      <>
        <TextTruncate mode="end" text={fileName} />
        <TextTruncate mode="end" text={fileName} query="  " />
        <TextTruncate mode="end" text={fileName} query="invoice" />
      </>,
    );
    for (const node of container.querySelectorAll<HTMLElement>("[data-truncate]")) {
      expect(node).toHaveAttribute("data-truncate-strategy", "css");
      expect(node).toHaveClass("truncate");
    }
    expect(getContext).not.toHaveBeenCalled();
  });

  it("draws a matching text that fits as the CSS strategy does: whole, uncut, the match highlighted", () => {
    measuredLayout(400);
    const { container } = render(<TextTruncate mode="end" text={fileName} query="review" />);
    expect(root(container)).toHaveAttribute("data-truncate-strategy", "measure");
    expect(root(container)).not.toHaveAttribute("data-truncate-state");
    expect(root(container).textContent).toBe(fileName);
    expect(highlights(root(container))).toEqual(["review"]);
  });

  it("follows the query: a match starts measuring, losing it returns to CSS without the old cut", () => {
    measuredLayout(100);
    const { container, rerender } = render(<TextTruncate mode="end" text={fileName} query="inv" />);
    expect(root(container)).toHaveAttribute("data-truncate-strategy", "css");
    rerender(<TextTruncate mode="end" text={fileName} query="review" />);
    expect(root(container)).toHaveAttribute("data-truncate-strategy", "measure");
    expect(root(container)).toHaveAttribute("data-truncate-state", "truncated");
    rerender(<TextTruncate mode="end" text={fileName} query="revie-w" />);
    expect(root(container)).toHaveAttribute("data-truncate-strategy", "css");
    expect(root(container)).not.toHaveAttribute("data-truncate-state");
    expect(root(container).textContent).toBe(fileName);
  });

  it("leaves strategy css alone with a matching query", () => {
    const { getContext } = measuredLayout(100);
    const { container } = render(<TextTruncate mode="end" strategy="css" text={fileName} query="review" />);
    expect(root(container)).toHaveAttribute("data-truncate-strategy", "css");
    expect(getContext).not.toHaveBeenCalled();
  });
});

describe("ellipsis start, measured", () => {
  it("keeps the end of the text and highlights the marker for a match it hides", () => {
    measuredLayout(100);
    const { container } = render(<TextTruncate mode="end" ellipsis="start" text={fileName} query="design" />);
    const node = root(container);
    expect(node).toHaveAttribute("data-truncate-strategy", "measure");
    expect(visible(node)).toBe("...iew.pdf");
    expect(highlights(node)).toEqual(["{...}"]);
    // Aligned to the end, as the CSS start ellipsis is, with the text isolated.
    expect(node).toHaveClass("[direction:rtl]");
    expect(node).toHaveAttribute("data-tip-align", "end");
    expect(node.querySelector("[data-truncate-visible] > bdi")).not.toBeNull();
    expect(node.querySelector("[data-truncate-full-text]")).toHaveTextContent(fileName);
  });

  it("isolates measured text that fits", () => {
    measuredLayout(400);
    const { container } = render(<TextTruncate mode="end" ellipsis="start" text={fileName} query="pdf" />);
    const bdi = root(container).querySelector(":scope > bdi");
    expect(bdi).toHaveTextContent(fileName);
    expect(highlights(root(container))).toEqual(["pdf"]);
  });

  it("applies under strategy measure too", () => {
    measuredLayout(100);
    const { container } = render(<TextTruncate mode="end" ellipsis="start" strategy="measure" text={fileName} />);
    expect(visible(root(container))).toBe("...iew.pdf");
  });

  it("cuts at the start on whole graphemes", () => {
    const measureText = (value: string) => value.length;
    const text = "ab👍🏽cd";
    const cut = truncatePrepared({ text, maxWidth: 6, measureText, mode: "start" }, () => indexTextGraphemes(text));
    expect(cut).toEqual({ text: "...cd", truncated: true, cut: { prefixEnd: 0, suffixStart: text.length - 2 } });
    // 7 units would hold "..." + the skin-tone modifier alone + "cd".
    const wider = truncatePrepared({ text, maxWidth: 7, measureText, mode: "start" }, () => indexTextGraphemes(text));
    expect(wider.text).toBe("...cd");
  });
});
