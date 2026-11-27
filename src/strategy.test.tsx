import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { TextTruncate } from "./index";
import { indexTextGraphemes } from "./graphemes";
import { contentDirection, endModeSide, needsBdiIsolation, truncatePrepared } from "./truncation";
import { resetMeasuredLayoutGlobals, stubMeasuredLayout } from "./__tests__/measured-layout";

// Ten units per UTF-16 code unit, as index.test.tsx measures.
const measuredLayout = (width: number) => stubMeasuredLayout(width, { stubRect: true, stubFonts: false });

afterEach(() => {
  cleanup();
  resetMeasuredLayoutGlobals();
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

// Frames run only when the test says, so the render before the first
// measurement can be inspected (a synchronous requestAnimationFrame hides it).
const queuedFrames = (width: number) =>
  stubMeasuredLayout(width, { queuedFrames: true, stubRect: true, stubFonts: false }).flush;

// Until measured end mode has cut, it looks as CSS draws it: dots, not a hard clip.
describe("measured end mode before its first measurement", () => {
  it("renders the CSS ellipsis in the server's HTML", () => {
    const html = renderToString(
      <>
        <TextTruncate mode="end" text={fileName} query="review" />
        <TextTruncate mode="end" ellipsis="start" text={fileName} query="review" />
      </>,
    );
    expect(html).toContain('class="block w-full min-w-0 truncate"');
    expect(html).toContain('class="block w-full min-w-0 truncate [direction:rtl]"');
    expect(html).toContain('data-truncate-overflow-target=":scope &gt; bdi"');
  });

  it("keeps the CSS ellipsis on mount and after the query starts matching, until the frame measures", () => {
    const flush = queuedFrames(100);
    const { container, rerender } = render(<TextTruncate mode="end" text={fileName} query="review" />);
    expect(root(container)).toHaveAttribute("data-truncate-strategy", "measure");
    expect(root(container)).toHaveClass("truncate");
    expect(root(container)).not.toHaveAttribute("data-truncate-state");
    flush();
    expect(root(container)).not.toHaveClass("truncate");
    expect(visible(root(container))).toBe("Quarter...");

    rerender(<TextTruncate mode="end" text={fileName} query="inv" />);
    expect(root(container)).toHaveAttribute("data-truncate-strategy", "css");
    rerender(<TextTruncate mode="end" text={fileName} query="design" />);
    expect(root(container)).toHaveClass("truncate");
    expect(root(container).textContent).toBe(fileName);
    flush();
    expect(root(container)).not.toHaveClass("truncate");
    expect(highlights(root(container))).toEqual(["{...}"]);
  });

  it("keeps the CSS ellipsis for a new text until it is measured", () => {
    const flush = queuedFrames(400);
    const { container, rerender } = render(<TextTruncate mode="end" text="design.pdf" query="design" />);
    flush();
    expect(root(container)).not.toHaveClass("truncate");
    rerender(<TextTruncate mode="end" text={`${fileName}-${fileName}`} query="design" />);
    expect(root(container)).toHaveClass("truncate");
    flush();
    expect(root(container)).not.toHaveClass("truncate");
  });
});

// inline-truncate#8 review F5: "auto" measures matching end-mode text even when
// it fits; Canvas decides that, and the DOM verification is only for a close call.
describe("matching end-mode text that fits", () => {
  const cells = (count: number) => Array.from({ length: count }, (_, i) => (
    <TextTruncate key={i} mode="end" text={`${fileName}-${i % 10}`} query="design" />
  ));

  it("skips the DOM verification when Canvas puts it clearly inside the box", () => {
    measuredLayout(400);
    const reads = vi.mocked(HTMLElement.prototype.getBoundingClientRect);
    reads.mockClear();
    const { container } = render(<>{cells(50)}</>);
    expect(container.querySelectorAll("[data-truncate-state]")).toHaveLength(0);
    expect(reads).not.toHaveBeenCalled();
  });

  it("verifies it in the DOM when Canvas puts it within a few pixels of the edge", () => {
    // 29 characters, 290 Canvas units: inside 292, but within the margin.
    measuredLayout(292);
    const reads = vi.mocked(HTMLElement.prototype.getBoundingClientRect);
    reads.mockClear();
    const { container } = render(<>{cells(50)}</>);
    expect(container.querySelectorAll("[data-truncate-state]")).toHaveLength(0);
    expect(reads).toHaveBeenCalledTimes(50);
  });
});

// Review F3: measured end mode keeps the end of the text CSS keeps, and puts
// the dots on CSS's side: the line keeps its start edge and cuts at its end.
describe("the side end mode cuts", () => {
  const arabic = "مرحبا بالعالم ملف نهائي طويل";

  it("reads the text's direction from its first letter, as dir=auto does", () => {
    expect(contentDirection("Lomboc boat")).toBe("ltr");
    expect(contentDirection(arabic)).toBe("rtl");
    expect(contentDirection("2026 שנה")).toBe("rtl");
    expect(contentDirection("1,234.56")).toBe("ltr");
    expect(endModeSide("Lomboc boat", "ltr")).toBe("end");
    expect(endModeSide("Lomboc boat", "rtl")).toBe("start");
    expect(endModeSide(arabic, "ltr")).toBe("start");
    expect(endModeSide(arabic, "rtl")).toBe("end");
  });

  it("keeps the start of right-to-left text with the ellipsis first, the dots after it in a bdi", () => {
    measuredLayout(100);
    const { container } = render(<TextTruncate mode="end" ellipsis="start" text={arabic} query="ملف" />);
    expect(visible(root(container))).toBe("مرحبا ب...");
    expect(root(container).querySelector("[data-truncate-visible] > bdi")).not.toBeNull();
    expect(highlights(root(container))).toEqual(["{...}"]);
  });

  it("keeps the end of right-to-left text in a left-to-right line, the dots leading it in a bdi", () => {
    measuredLayout(100);
    const { container } = render(<TextTruncate mode="end" text={arabic} query="ملف" />);
    expect(visible(root(container))).toBe("...ئي طويل");
    expect(root(container).querySelector("[data-truncate-visible] > bdi")).not.toBeNull();
    expect(root(container)).not.toHaveClass("[direction:rtl]");
  });

  it("leaves left-to-right text in a left-to-right line as it was: start kept, no bdi", () => {
    measuredLayout(100);
    const { container } = render(<TextTruncate mode="end" text={fileName} query="review" />);
    expect(visible(root(container))).toBe("Quarter...");
    expect(root(container).querySelector("bdi")).toBeNull();
  });

  it("does not isolate a middle-mode cut even when prefixEnd is 0", () => {
    expect(needsBdiIsolation({
      mode: "middle",
      startEllipsis: false,
      cut: { prefixEnd: 0, suffixStart: 10 },
      sourceLength: 20,
    })).toBe(false);
    expect(needsBdiIsolation({
      mode: "end",
      startEllipsis: false,
      cut: { prefixEnd: 0, suffixStart: 10 },
      sourceLength: 20,
    })).toBe(true);
    expect(needsBdiIsolation({
      mode: "end",
      startEllipsis: true,
      cut: null,
      sourceLength: 20,
    })).toBe(true);
  });

  it("keeps the held cut's own mode for bdi isolation between a mode switch and the next frame", () => {
    const flush = queuedFrames(100);
    const { container, rerender } = render(<TextTruncate mode="end" text={arabic} query="ملف" />);
    flush();
    expect(root(container).querySelector("[data-truncate-visible] > bdi")).not.toBeNull();

    // Switch to middle mode: before the next RAF measures a middle cut, the
    // held end-mode cut (prefixEnd === 0) keeps its bdi isolation.
    rerender(<TextTruncate mode="middle" text={arabic} query="ملف" />);
    expect(root(container).querySelector("[data-truncate-visible] > bdi")).not.toBeNull();
    flush();
    expect(root(container).querySelector("[data-truncate-visible] > bdi")).toBeNull();
  });
});
