import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, cleanup, screen } from "@testing-library/react";
import { HighlightedMatchText, TextTruncate, splitTextGraphemes, truncateText, type TextTruncateProps } from "./index";

const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
const originalRO = globalThis.ResizeObserver;
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const originalGetContext = HTMLCanvasElement.prototype.getContext;

// A ResizeObserver that reports nothing by itself: `deliverResize` hands an
// observation to every live observer watching the target, as a browser would
// after the element's box changed.
const liveResizeObservers = new Set<FakeResizeObserver>();

class FakeResizeObserver {
  private readonly targets = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {
    liveResizeObservers.add(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
    liveResizeObservers.delete(this);
  }

  deliver(target: Element) {
    if (!this.targets.has(target)) return;
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}

function stubResizeObserver() {
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
}

function deliverResize(target: Element) {
  act(() => {
    for (const observer of liveResizeObservers) observer.deliver(target);
  });
}

function stubDocumentFonts(
  status: "loaded" | "loading",
  readySpy: () => void,
  ready: () => Promise<unknown> = () => Promise.resolve(),
) {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      status,
      get ready() {
        readySpy();
        return ready();
      },
    },
  });
}

afterEach(() => {
  cleanup();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else delete (document as unknown as { fonts?: unknown }).fonts;
  globalThis.ResizeObserver = originalRO;
  liveResizeObservers.clear();
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
  else Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  vi.restoreAllMocks();
});

const CHARACTER_WIDTH = 10;

// Deterministic layout for the measure strategy: every root is `width` pixels
// wide, Inline Measure's canvas gives every UTF-16 unit CHARACTER_WIDTH pixels,
// and animation frames run at once. `setWidth` and `setCharacterWidth` change
// the layout without telling the component, as a resize or a font swap would.
function stubMeasuredLayout(width: number) {
  let currentWidth = width;
  let characterWidth = CHARACTER_WIDTH;
  stubResizeObserver();
  stubDocumentFonts("loaded", () => {});
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => currentWidth,
  });
  const getContext = vi.fn(() => ({
    font: "",
    measureText: (value: string) => ({ width: value.length * characterWidth }),
  }));
  HTMLCanvasElement.prototype.getContext = getContext as unknown as typeof HTMLCanvasElement.prototype.getContext;
  const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  return {
    getContext,
    requestAnimationFrame,
    setWidth: (next: number) => {
      currentWidth = next;
    },
    setCharacterWidth: (next: number) => {
      characterWidth = next;
    },
  };
}

// What a sighted reader sees: the text without the visually hidden full-text copy.
function visibleText(node: Element) {
  const copy = node.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll("[data-truncate-full-text]")) hidden.remove();
  return copy.textContent;
}

function truncateRoot(container: HTMLElement) {
  const root = container.querySelector<HTMLElement>("[data-truncate]");
  if (!root) throw new Error("TextTruncate root not rendered");
  return root;
}

describe("splitTextGraphemes", () => {
  it("splits text into user-perceived characters", () => {
    // Skin-tone emoji, a letter plus a combining acute accent, a flag made of two
    // regional indicators, and a family joined with zero-width joiners.
    expect(splitTextGraphemes("a👍🏽e\u0301🇺🇦👨‍👩‍👧")).toEqual(["a", "👍🏽", "e\u0301", "🇺🇦", "👨‍👩‍👧"]);
    expect(splitTextGraphemes("abc")).toEqual(["a", "b", "c"]);
    expect(splitTextGraphemes("a\r\nb")).toEqual(["a", "\r\n", "b"]);
    expect(splitTextGraphemes("")).toEqual([]);
  });

  it("falls back to whole code points when Intl.Segmenter is unavailable", () => {
    const segmenter = Object.getOwnPropertyDescriptor(Intl, "Segmenter");
    Reflect.deleteProperty(Intl, "Segmenter");
    try {
      expect(splitTextGraphemes("a👍🏽")).toEqual(["a", "👍", "🏽"]);
    } finally {
      if (segmenter) Object.defineProperty(Intl, "Segmenter", segmenter);
    }
  });
});

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

    expect(visibleText(container)).toBe("photo.jpg");
    expect(container.querySelector("[data-slot='highlighted-match']")).toBeNull();
  });

  it("matches a trimmed query case-insensitively and keeps the text's own casing", () => {
    const { container } = render(<HighlightedMatchText text="Photo-PHOTO.jpg" query="  photo " />);

    const matches = container.querySelectorAll("[data-slot='highlighted-match']");
    expect(Array.from(matches, (match) => match.textContent)).toEqual(["Photo", "PHOTO"]);
    expect(visibleText(container)).toBe("Photo-PHOTO.jpg");
  });

  it("keeps text plain when nothing matches", () => {
    const { container } = render(<HighlightedMatchText text="photo.jpg" query="video" />);

    expect(visibleText(container)).toBe("photo.jpg");
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
    expect(visibleText(root)).toBe("Quarter...");
    expect(root).toHaveAttribute("data-truncate-strategy", "measure");
    expect(root).toHaveAttribute("data-truncate-state", "truncated");
    expect(root).toHaveAttribute("data-truncate-original", fileName);
  });

  it("leaves measured text that fits whole and unmarked", () => {
    stubMeasuredLayout(400);

    const { container } = render(<TextTruncate mode="middle" strategy="measure" text={fileName} />);

    const root = truncateRoot(container);
    expect(visibleText(root)).toBe(fileName);
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
    expect(visibleText(middle)).toBe("Qua....pdf");
    expect(end).toHaveAttribute("data-truncate-strategy", "css");
    expect(visibleText(end)).toBe(fileName);
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
    expect(visibleText(root)).toBe("Qua....pdf");
    expect(root).not.toHaveClass("[direction:rtl]");
    expect(root).not.toHaveAttribute("data-tip-align");
    expect(root.querySelector("bdi")).toBeNull();
  });

  it("highlights query matches in the visible part of the truncated text", () => {
    stubMeasuredLayout(100);

    const { container } = render(<TextTruncate mode="middle" text={fileName} query="PDF" />);

    const root = truncateRoot(container);
    expect(visibleText(root)).toBe("Qua....pdf");
    const matches = root.querySelectorAll("[data-slot='highlighted-match']");
    expect(Array.from(matches, (match) => match.textContent)).toEqual(["pdf"]);
  });

  it("does not highlight a query match that truncation hid", () => {
    stubMeasuredLayout(100);

    const { container } = render(<TextTruncate mode="middle" text={fileName} query="design" />);

    const root = truncateRoot(container);
    expect(visibleText(root)).toBe("Qua....pdf");
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
    expect(visibleText(withExtra)).toBe(visibleText(without));
  });

  it("measures again when its container is resized", () => {
    const { setWidth } = stubMeasuredLayout(100);

    const { container } = render(<TextTruncate mode="middle" text={fileName} />);
    const root = truncateRoot(container);
    expect(visibleText(root)).toBe("Qua....pdf");

    setWidth(150);
    expect(visibleText(root)).toBe("Qua....pdf");
    deliverResize(root);
    expect(visibleText(root)).toBe("Quarte...ew.pdf");

    setWidth(400);
    deliverResize(root);
    expect(visibleText(root)).toBe(fileName);
    expect(root).not.toHaveAttribute("data-truncate-state");
  });

  it("measures again once loading fonts are ready", async () => {
    const { setCharacterWidth } = stubMeasuredLayout(100);
    let resolveFonts = () => {};
    const fontsReady = new Promise<void>((resolve) => {
      resolveFonts = resolve;
    });
    stubDocumentFonts("loading", () => {}, () => fontsReady);

    const { container } = render(<TextTruncate mode="middle" text={fileName} />);
    const root = truncateRoot(container);
    expect(visibleText(root)).toBe("Qua....pdf");

    // The web font is narrower than the fallback the first measurement used.
    setCharacterWidth(5);
    expect(visibleText(root)).toBe("Qua....pdf");
    await act(async () => {
      resolveFonts();
      await fontsReady;
    });
    expect(visibleText(root)).toBe("Quarterl...eview.pdf");
  });

  it("measures the new text when the text prop changes", () => {
    stubMeasuredLayout(100);

    const { container, rerender } = render(<TextTruncate mode="middle" text={fileName} />);
    const root = truncateRoot(container);
    expect(visibleText(root)).toBe("Qua....pdf");

    rerender(<TextTruncate mode="middle" text="Annual-budget-forecast-2027.xlsx" />);
    expect(visibleText(root)).toBe("Ann...xlsx");
    expect(root).toHaveAttribute("data-truncate-original", "Annual-budget-forecast-2027.xlsx");

    rerender(<TextTruncate mode="middle" text="notes.txt" />);
    expect(visibleText(root)).toBe("notes.txt");
    expect(root).not.toHaveAttribute("data-truncate-state");
  });
});

describe("TextTruncate accessible full text", () => {
  const fileName = "Quarterly-design-review.pdf";

  function cell(props: TextTruncateProps) {
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <td>
              <TextTruncate {...props} />
            </td>
          </tr>
        </tbody>
      </table>,
    );
    return { cell: screen.getByRole("cell"), root: truncateRoot(container) };
  }

  function parts(root: HTMLElement) {
    const visible = root.querySelector<HTMLElement>(":scope > [data-truncate-visible]");
    const full = root.querySelector<HTMLElement>(":scope > [data-truncate-full-text]");
    return { visible, full };
  }

  it.each([
    ["middle", { mode: "middle" as const }, "Qua....pdf"],
    ["end", { mode: "end" as const, strategy: "measure" as const }, "Quarter..."],
  ])("hides the cut %s text from assistive technology and exposes the full text beside it", (_, props, cut) => {
    stubMeasuredLayout(100);

    const { cell: tableCell, root } = cell({ ...props, text: fileName });

    expect(tableCell).toHaveAccessibleName(fileName);
    const { visible, full } = parts(root);
    expect(root.children).toHaveLength(2);
    expect(visible).toHaveAttribute("aria-hidden", "true");
    expect(visible!.textContent).toBe(cut);
    expect(full).not.toHaveAttribute("aria-hidden");
    expect(full!.textContent).toBe(fileName);
    expect(full!.style.position).toBe("absolute");
    expect(full!.style.clipPath).toBe("inset(50%)");
    expect(full!.style.userSelect).toBe("none");
  });

  it("adds nothing when the measured text fits", () => {
    stubMeasuredLayout(400);

    const { cell: tableCell, root } = cell({ mode: "middle", text: fileName });

    expect(tableCell).toHaveAccessibleName(fileName);
    expect(root.childNodes).toHaveLength(1);
    expect(root.firstChild!.nodeType).toBe(Node.TEXT_NODE);
    expect(root.querySelector("[aria-hidden]")).toBeNull();
  });

  it("adds nothing under the CSS strategy, whose DOM already holds the full text", () => {
    stubMeasuredLayout(100);

    const { cell: tableCell, root } = cell({ mode: "end", text: fileName });

    expect(tableCell).toHaveAccessibleName(fileName);
    expect(root.childNodes).toHaveLength(1);
    expect(root.querySelector("[aria-hidden]")).toBeNull();
  });

  it("adds the copy when a resize cuts the text and removes it when the text fits again", () => {
    const { setWidth } = stubMeasuredLayout(400);
    const { cell: tableCell, root } = cell({ mode: "middle", text: fileName });
    expect(parts(root).full).toBeNull();

    setWidth(100);
    deliverResize(root);
    expect(tableCell).toHaveAccessibleName(fileName);
    expect(parts(root).full!.textContent).toBe(fileName);

    setWidth(400);
    deliverResize(root);
    expect(tableCell).toHaveAccessibleName(fileName);
    expect(parts(root).full).toBeNull();
    expect(root.querySelector("[aria-hidden]")).toBeNull();
    expect(root.textContent).toBe(fileName);
  });

  it("keeps highlighted matches in the visible text only", () => {
    stubMeasuredLayout(100);

    const { cell: tableCell, root } = cell({ mode: "middle", text: fileName, query: "pdf" });

    expect(tableCell).toHaveAccessibleName(fileName);
    const { visible, full } = parts(root);
    expect(Array.from(visible!.querySelectorAll("[data-slot='highlighted-match']"), (m) => m.textContent)).toEqual(["pdf"]);
    expect(full!.querySelector("[data-slot='highlighted-match']")).toBeNull();
  });

  it("follows a text change with the new full text", () => {
    stubMeasuredLayout(100);
    const { container, rerender } = render(<TextTruncate mode="middle" text={fileName} />);

    rerender(<TextTruncate mode="middle" text="Annual-budget-forecast.xlsx" />);

    const { full } = parts(truncateRoot(container));
    expect(full!.textContent).toBe("Annual-budget-forecast.xlsx");
  });
});

describe("truncateText measurement work", () => {
  it("does not measure every hidden prefix and suffix of a long middle-truncated string", () => {
    const measureText = vi.fn((value: string) => value.length);
    expect(truncateText({text: "a".repeat(10_000), maxWidth:30, mode:"middle", measureText}).text)
      .toBe("aaaaaaaaaaaaa...aaaaaaaaaaaaaa");
    expect(measureText.mock.calls.length).toBeLessThan(80);
  });
});

describe("truncateText marker shaping", () => {
  it.each(["middle", "end"] as const)("fits the whole %s result when the marker changes shaping", mode => {
    const measureText = (value: string) => value.length + (value.includes("...") && value !== "..." ? 2 : 0);
    const result = truncateText({text:"abcdefghij", maxWidth:5, mode, measureText});
    expect(result).toEqual({text:"...", truncated:true});
    expect(measureText(result.text)).toBeLessThanOrEqual(5);
  });
});


describe("TextTruncate deferred updates", () => {
  it("does not schedule another frame when fonts finish after unmount", async () => {
    stubResizeObserver();
    let finish!: () => void;
    Object.defineProperty(document, "fonts", {configurable:true, value:{status:"loading",ready:new Promise<void>(resolve => {finish=resolve;})}});
    const raf = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    const {unmount} = render(<TextTruncate mode="middle" text="long-file-name.pdf" />);
    expect(raf).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => { finish(); await Promise.resolve(); });
    expect(raf).toHaveBeenCalledTimes(1);
  });
});

describe("TextTruncate repeated measurement", () => {
  it("invalidates cached widths when optical sizing changes on a resize update", () => {
    let notify!: () => void;
    globalThis.ResizeObserver = class { constructor(callback: () => void) { notify = callback; } observe() {} disconnect() {} } as unknown as typeof ResizeObserver;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.push(callback); return frames.length; });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(12);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ font: "", measureText: (value: string) => ({ width: value.length }) } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { width: (this.textContent?.length ?? 0) * (this.style.fontOpticalSizing === "none" ? 2 : 1) } as DOMRect;
    });
    const { container } = render(<TextTruncate mode="middle" text="abcdefghijkl" />);
    const element = truncateRoot(container);
    element.style.fontOpticalSizing = "none";
    act(() => { frames.shift()!(0); });
    expect(visibleText(element)).not.toBe("abcdefghijkl");
    element.style.fontOpticalSizing = "auto";
    act(() => { notify(); frames.shift()!(0); });
    expect(visibleText(element)).toBe("abcdefghijkl");
  });

  it("reuses text widths on resize and invalidates them when its class changes", () => {
    let notify!: () => void;
    globalThis.ResizeObserver = class { constructor(callback: () => void) {notify=callback;} observe() {} disconnect() {} } as unknown as typeof ResizeObserver;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window,"requestAnimationFrame").mockImplementation(callback => {frames.push(callback);return frames.length;});
    vi.spyOn(HTMLElement.prototype,"clientWidth","get").mockReturnValue(12);
    const measureText = vi.fn((value: string) => ({width:value.length}));
    vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({font:"",measureText} as unknown as CanvasRenderingContext2D);
    const {rerender} = render(<TextTruncate mode="middle" text="a-long-filename.pdf" className="small" />);
    act(() => {frames.shift()!(0);});
    expect(screen.getByText("a-lo...e.pdf")).toBeTruthy();
    const calls = measureText.mock.calls.length;
    act(() => {notify(); frames.shift()!(0);});
    expect(measureText.mock.calls.length).toBe(calls);
    rerender(<TextTruncate mode="middle" text="a-long-filename.pdf" className="large" />);
    expect(frames).toHaveLength(1);
    act(() => {frames.shift()!(0);});
    expect(measureText.mock.calls.length).toBeGreaterThan(calls);
  });
});

describe("truncateText boundary contract", () => {
  it.each([
    {text:"",maxWidth:20,expected:"",truncated:false},
    {text:"abc",maxWidth:0,expected:"abc",truncated:false},
    {text:"abc",maxWidth:3,expected:"abc",truncated:false},
    {text:"abcdef",maxWidth:2,expected:"...",truncated:true},
    {text:"abcdef",maxWidth:3,expected:"...",truncated:true},
  ])("preserves the documented result at width $maxWidth for '$text'", ({text,maxWidth,expected,truncated}) => {
    expect(truncateText({text,maxWidth,mode:"end",measureText:value=>value.length})).toEqual({text:expected,truncated});
  });
});

describe("TextTruncate later font cycles", () => {
  it("waits for a later loading cycle even when the browser only emits loading", async () => {
    stubResizeObserver();
    let finish!: () => void;
    const fonts = Object.assign(new EventTarget(), {status:"loaded",ready:new Promise<void>(resolve=>{finish=resolve;})});
    Object.defineProperty(document,"fonts",{configurable:true,value:fonts});
    const raf=vi.spyOn(window,"requestAnimationFrame").mockReturnValue(1);
    render(<TextTruncate mode="middle" text="a-long-filename.pdf" />);
    expect(raf).toHaveBeenCalledTimes(1);
    fonts.status="loading"; fonts.dispatchEvent(new Event("loading"));
    await act(async()=>{fonts.status="loaded";finish();await Promise.resolve();});
    expect(raf).toHaveBeenCalledTimes(2);
  });
});

describe("TextTruncate decorated node lifetime", () => {
  function measurementFrames() {
    stubResizeObserver();
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window,"requestAnimationFrame").mockImplementation(callback=>{frames.push(callback);return frames.length;});
    vi.spyOn(HTMLElement.prototype,"clientWidth","get").mockReturnValue(12);
    vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({font:"",measureText:(value:string)=>({width:value.length})} as unknown as CanvasRenderingContext2D);
    return () => act(()=>{frames.shift()!(0);});
  }
  it("recreates highlighted spans when a cut or query changes", () => {
    const nextFrame=measurementFrames();
    const {rerender}=render(<TextTruncate mode="middle" query="abc" text="abc-long-filename.pdf" />);
    const original=screen.getByText("abc");
    nextFrame();
    const cut=screen.getByText("abc");
    expect(cut).not.toBe(original);
    rerender(<TextTruncate mode="middle" query="ABC" text="abc-long-filename.pdf" />);
    expect(screen.getByText("abc")).not.toBe(cut);
    nextFrame();
  });
  it("retains the ordinary text node from one cut to the next when no query decorates it", () => {
    const { setWidth } = stubMeasuredLayout(100);
    const { container } = render(<TextTruncate mode="middle" text="Quarterly-design-review.pdf" />);
    const root = truncateRoot(container);
    const visible = root.querySelector("[data-truncate-visible]")!;
    const original = visible.firstChild;
    expect(visibleText(root)).toBe("Qua....pdf");
    setWidth(150);
    deliverResize(root);
    expect(visibleText(root)).toBe("Quarte...ew.pdf");
    expect(root.querySelector("[data-truncate-visible]")).toBe(visible);
    expect(visible.firstChild).toBe(original);
  });
});

describe("TextTruncate emoji verification work", () => {
  it("verifies the final cut once, reuses native widths, and invalidates them after a font cycle", () => {
    let notify!: () => void;
    globalThis.ResizeObserver = class {constructor(callback:()=>void){notify=callback;}observe(){}disconnect(){}} as unknown as typeof ResizeObserver;
    const fonts=Object.assign(new EventTarget(),{status:"loaded"});
    Object.defineProperty(document,"fonts",{configurable:true,value:fonts});
    const frames: FrameRequestCallback[]=[];
    vi.spyOn(window,"requestAnimationFrame").mockImplementation(callback=>{frames.push(callback);return frames.length;});
    vi.spyOn(HTMLElement.prototype,"clientWidth","get").mockReturnValue(12);
    vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({font:"",measureText:(value:string)=>({width:value.length})} as unknown as CanvasRenderingContext2D);
    const native=vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this:HTMLElement){return {width:this.textContent?.length ?? 0,height:16} as DOMRect;});
    const {container}=render(<TextTruncate mode="middle" text="abc-🪑-long-filename.pdf" />);
    act(()=>{frames.shift()!(0);});
    expect(visibleText(container)).toBe("abc-...e.pdf");
    expect(native).toHaveBeenCalledTimes(1);
    act(()=>{notify();frames.shift()!(0);});
    expect(native).toHaveBeenCalledTimes(1);
    act(()=>{fonts.dispatchEvent(new Event("loadingdone"));frames.shift()!(0);});
    expect(native).toHaveBeenCalledTimes(2);
  });
});

describe("TextTruncate native verification boundaries", () => {
  function scene(width:number,canvas:(text:string)=>number,native:(text:string)=>number) {
    stubResizeObserver();
    const frames:FrameRequestCallback[]=[];
    vi.spyOn(window,"requestAnimationFrame").mockImplementation(callback=>{frames.push(callback);return frames.length;});
    const widthRead=vi.spyOn(HTMLElement.prototype,"clientWidth","get").mockReturnValue(width);
    vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({font:"",measureText:(value:string)=>({width:canvas(value)})} as unknown as CanvasRenderingContext2D);
    const reads=vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this:HTMLElement){return {width:native(this.textContent ?? ""),height:16} as DOMRect;});
    return {reads,widthRead,next:()=>act(()=>{frames.shift()!(0);})};
  }
  it("validates styles once but skips the measurement session for unchanged-width RO", () => {
    const {next,reads}=scene(12,value=>value.length,value=>value.length);
    const {container}=render(<TextTruncate mode="middle" text="abc-🪑-long-filename.pdf" />);
    next();
    const output=visibleText(container);
    const styles=vi.spyOn(window,"getComputedStyle");
    const element=container.querySelector("[data-truncate]")!;
    for(let repeat=0;repeat<3;repeat++) {
      styles.mockClear();reads.mockClear();
      deliverResize(element);next();
      expect(visibleText(container)).toBe(output);
      expect(reads).not.toHaveBeenCalled();
      expect(styles).toHaveBeenCalledTimes(1);
    }
  });
  it("remeasures the same positive width after a hidden interval", () => {
    const {next,widthRead,reads}=scene(12,value=>value.length,value=>value.length);
    const text="abc-🪑-long-filename.pdf";
    const {container}=render(<TextTruncate mode="middle" text={text} />);
    next();const cut=visibleText(container);
    const element=container.querySelector("[data-truncate]")!;
    let hidden=true;
    reads.mockImplementation(function(this:HTMLElement){return {width:hidden && this === element ? 0 : (this.textContent ?? "").length,height:16} as DOMRect;});
    widthRead.mockReturnValue(0);
    deliverResize(element);next();expect(visibleText(container)).toBe(text);
    widthRead.mockReturnValue(12);
    hidden=false;
    deliverResize(element);next();expect(visibleText(container)).toBe(cut);
  });
  it("remeasures unchanged box widths after live typography or padding changes", () => {
    let scale=1;
    const {next}=scene(20,value=>value.length*scale,value=>value.length*scale);
    const text="abcdefghij-file.pdf";
    const {container}=render(<TextTruncate mode="middle" text={text} />);
    next();expect(visibleText(container)).toBe(text);
    const element=container.querySelector<HTMLElement>("[data-truncate]")!;
    element.style.fontSize="24px";scale=2;
    deliverResize(element);next();
    expect(visibleText(container)).not.toBe(text);
    expect(visibleText(container)!.length*scale).toBeLessThanOrEqual(20);
    element.style.paddingLeft="10px";
    deliverResize(element);next();
    expect(visibleText(container)!.length*scale).toBeLessThanOrEqual(10);
  });
  it("uses exact selection when the measured discrepancy exhausts the Canvas budget", () => {
    const {next}=scene(30,value=>value.includes("🪑") ? 0 : value.length*2,value=>value.length*2);
    const {container}=render(<TextTruncate mode="middle" text="abc-🪑-long-file.pdf" />);
    next();
    expect(visibleText(container)).toBe("abc-🪑...le.pdf");
  });
  it("measures a marker-only final result while preserving unavoidable clipping", () => {
    const {next,reads}=scene(1,value=>value.length,value=>value.length);
    const {container}=render(<TextTruncate mode="middle" text="abc-🪑-long-file.pdf" />);
    next();
    expect(visibleText(container)).toBe("...");
    expect(reads).toHaveBeenCalledTimes(1);
  });
  it("remeasures on DPR-only changes, rebinds the resolution query and cleans it up", () => {
    const {next,reads}=scene(12,value=>value.length,value=>value.length);
    const ratio=vi.spyOn(window,"devicePixelRatio","get").mockReturnValue(1);
    const queries:{media:string;listeners:Set<()=>void>}[]=[];
    const match=vi.spyOn(window,"matchMedia").mockImplementation(media=>{
      const query={media,listeners:new Set<()=>void>()};queries.push(query);
      return {media,matches:true,addEventListener:(_type:string,listener:()=>void)=>query.listeners.add(listener),removeEventListener:(_type:string,listener:()=>void)=>query.listeners.delete(listener)} as unknown as MediaQueryList;
    });
    const {unmount}=render(<TextTruncate mode="middle" text="abc-🪑-long-file.pdf" />);
    next();
    expect(queries).toHaveLength(1);
    expect(queries[0].media).toContain("1dppx");
    ratio.mockReturnValue(2);
    act(()=>{for(const listener of queries[0].listeners)listener();});
    next();
    expect(reads).toHaveBeenCalledTimes(2);
    expect(queries).toHaveLength(2);
    expect(queries[1].media).toContain("2dppx");
    expect(queries[0].listeners.size).toBe(0);
    unmount();expect(queries[1].listeners.size).toBe(0);
    match.mockClear();
    render(<TextTruncate mode="middle" text="plain-long-file.pdf" />);
    next();expect(match).not.toHaveBeenCalled();
  });
});

describe("truncateText Wave A algorithmic invariants", () => {
  it("converges in logarithmic calls for long middle and end truncations", () => {
    const middleMeasure = vi.fn((value: string) => value.length);
    expect(truncateText({ text: "a".repeat(10_000), maxWidth: 30, mode: "middle", measureText: middleMeasure }).text)
      .toBe("aaaaaaaaaaaaa...aaaaaaaaaaaaaa");
    expect(middleMeasure.mock.calls.length).toBeLessThan(20);

    const endMeasure = vi.fn((value: string) => value.length);
    expect(truncateText({ text: "a".repeat(10_000), maxWidth: 30, mode: "end", measureText: endMeasure }).text)
      .toBe(`${"a".repeat(27)}...`);
    expect(endMeasure.mock.calls.length).toBeLessThan(10);
  });

  it("handles non-uniform proportional character widths without overflowing", () => {
    const widthOf = (value: string) => {
      let total = 0;
      for (const ch of value) total += ch === "W" ? 16 : ch === "i" ? 4 : 8;
      return total;
    };
    const texts = [
      `${"i".repeat(40)}${"W".repeat(40)}`,
      `${"W".repeat(40)}${"i".repeat(40)}`,
      "a\r\nbc\r\ndefghij",
      "👨‍👩‍👧‍👦",
    ];
    for (const text of texts) {
      for (const mode of ["middle", "end"] as const) {
        for (const maxWidth of [12, 30, 60, 120, 240, 480]) {
          const result = truncateText({ text, maxWidth, mode, measureText: widthOf });
          if (result.truncated && result.text !== "...") {
            expect(widthOf(result.text)).toBeLessThanOrEqual(maxWidth);
          }
        }
      }
    }
  });
});

describe("TextTruncate shared observers and batched RAF", () => {
  it("shares one ResizeObserver, one RAF batch, and one document.fonts listener pair across instances", () => {
    const roInstances: FakeResizeObserver[] = [];
    class CountingRO extends FakeResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        super(cb);
        roInstances.push(this);
      }
    }
    globalThis.ResizeObserver = CountingRO as unknown as typeof ResizeObserver;
    const fonts = Object.assign(new EventTarget(), { status: "loaded" });
    const addListener = vi.spyOn(fonts, "addEventListener");
    const removeListener = vi.spyOn(fonts, "removeEventListener");
    Object.defineProperty(document, "fonts", { configurable: true, value: fonts });

    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(12);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      font: "",
      measureText: (value: string) => ({ width: value.length }),
    } as unknown as CanvasRenderingContext2D);

    const { rerender, unmount } = render(
      <>
        {Array.from({ length: 10 }, (_, i) => (
          <TextTruncate key={i} mode="middle" text={`item-${i}-long-filename.pdf`} />
        ))}
      </>,
    );

    expect(roInstances).toHaveLength(1);
    expect(raf).toHaveBeenCalledTimes(1);
    expect(addListener).toHaveBeenCalledTimes(2);

    act(() => { frames.shift()!(0); });

    // Prop updates reuse the shared observer without recreating it.
    rerender(
      <>
        {Array.from({ length: 10 }, (_, i) => (
          <TextTruncate key={i} mode="middle" className="text-sm" text={`updated-${i}-long-filename.pdf`} />
        ))}
      </>,
    );
    expect(roInstances).toHaveLength(1);
    expect(raf).toHaveBeenCalledTimes(2);
    act(() => { frames.shift()!(0); });

    unmount();
    expect(removeListener).toHaveBeenCalledTimes(2);
    expect(liveResizeObservers.size).toBe(0);
  });
});
