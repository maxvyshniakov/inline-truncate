import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { CutHighlightedText } from "./highlight.js";
import { createMeasurementSession } from "./measurement";
import { TRUNCATION_MARKER, type TruncationCut } from "./truncation.js";

afterEach(() => vi.restoreAllMocks());

it("measures disabled optical sizing with a native probe that preserves it", () => {
  const source = document.createElement("span");
  source.style.fontOpticalSizing = "none";
  source.dataset.truncateOriginal = "Draft";
  document.body.append(source);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "", measureText: (text: string) => ({ width: text.length }),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { width: (this.textContent?.length ?? 0) * (this.style.fontOpticalSizing === "none" ? 2 : 1) } as DOMRect;
  });
  const session = createMeasurementSession(source, getComputedStyle(source));
  try {
    expect(session.measureText("Draft")).toBe(10);
  } finally {
    session.dispose();
    source.remove();
  }
});

it("avoids an extra getComputedStyle read when creating an emoji session", () => {
  const source = document.createElement("span");
  source.dataset.truncateOriginal = "abc-🪑-file.pdf";
  document.body.append(source);
  const computed = getComputedStyle(source);
  const styleSpy = vi.spyOn(window, "getComputedStyle");
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "",
    measureText: (text: string) => ({ width: text.length }),
  } as unknown as CanvasRenderingContext2D);
  const session = createMeasurementSession(source, computed);
  try {
    expect(styleSpy).not.toHaveBeenCalled();
    expect(session.measureText("abc")).toBe(3);
    expect(styleSpy).not.toHaveBeenCalled();
  } finally {
    session.dispose();
    source.remove();
  }
});

// Engines shape each text node apart (WebKit visibly), so the probe must hold
// the very nodes the component renders for a cut, or the cut it picks can
// paint wider than it measured.
describe("the DOM probe for a cut", () => {
  const text = "oak-collection-🧑🏽‍🎨-spring-lookbook-2026-final-print-oak.pdf";
  const shape = (parent: Node) => [...parent.childNodes].map((node) => node.nodeType === Node.TEXT_NODE
    ? `text:${node.textContent}`
    : `${(node as HTMLElement).dataset.slot}${(node as HTMLElement).hasAttribute("data-truncate-marker") ? "+marker" : ""}:${node.textContent}`);
  const cases: Array<[string, string, TruncationCut]> = [
    ["a match before the cut", "oak", { prefixEnd: text.indexOf("-spring"), suffixStart: text.indexOf("26-final") }],
    ["a match inside the cut", "lookbook", { prefixEnd: text.indexOf("ing-"), suffixStart: text.indexOf("26-final") }],
    ["a match across the cut", "spring", { prefixEnd: text.indexOf("ing-"), suffixStart: text.indexOf("26-final") }],
    ["no match at all", "walnut", { prefixEnd: text.indexOf("ing-"), suffixStart: text.indexOf("26-final") }],
  ];
  for (const [name, query, cut] of cases) for (const path of ["emoji", "style"] as const) it(`measures the rendered nodes with ${name} (${path} probe)`, () => {
    const source = document.createElement("span");
    document.body.append(source);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      font: "", measureText: (value: string) => ({ width: value.length }),
    } as unknown as CanvasRenderingContext2D);
    const measured: string[][] = [];
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.parentElement && !this.parentElement.closest("[data-rendered]")) measured.push(shape(this));
      return { width: this.textContent?.length ?? 0 } as DOMRect;
    });
    const rendered = document.createElement("span");
    rendered.dataset.rendered = "";
    document.body.append(rendered);
    const root = createRoot(rendered);
    flushSync(() => root.render(<CutHighlightedText text={text} cut={cut} query={query} />));
    const session = createMeasurementSession(source, getComputedStyle(source), query, path === "emoji" ? { originalText: text, emojiText: true, needsDOM: false } : { originalText: text, emojiText: false, needsDOM: true });
    const measureDOM = path === "emoji" ? session.verifyText! : session.measureText;
    try {
      measureDOM(text.slice(0, cut.prefixEnd) + TRUNCATION_MARKER + text.slice(cut.suffixStart), cut);
      expect(measured.at(-1)).toEqual(shape(rendered));
      // Adjacent plain text is one node, as the probe has it without a cut.
      expect(shape(rendered).filter((part, index, all) => part.startsWith("text:") && all[index + 1]?.startsWith("text:"))).toEqual([]);
    } finally {
      session.dispose();
      flushSync(() => root.unmount());
      rendered.remove();
      source.remove();
    }
  });
});
