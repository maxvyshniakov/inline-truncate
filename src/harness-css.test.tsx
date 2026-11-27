import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { TextTruncate } from "./index";
import { HIGHLIGHT_CLASS_NAME } from "./highlight";
import { resetMeasuredLayoutGlobals, stubMeasuredLayout } from "./__tests__/measured-layout";

afterEach(() => {
  cleanup();
  resetMeasuredLayoutGlobals();
  vi.restoreAllMocks();
});

// The browser harnesses have no Tailwind build: scripts/harness.css writes
// each utility out. A class the component renders without a rule there would
// leave the browser checks testing another box than the one consumers get.
describe("scripts/harness.css", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../scripts/harness.css"), "utf8");
  const selector = (token: string) => `.${token.replace(/[^\w-]/g, (character) => `\\${character}`)}`;

  it("has a rule for every class the root and the highlight render", () => {
    const layout = stubMeasuredLayout(100, { queuedFrames: true, stubRect: true, stubFonts: false });
    const tokens = new Set(HIGHLIGHT_CLASS_NAME.split(" "));
    const collect = (container: HTMLElement) => {
      for (const root of container.querySelectorAll("[data-truncate]")) for (const token of root.classList) tokens.add(token);
    };
    const cases = (
      <>
        <TextTruncate mode="middle" text="Quarterly-design-review.pdf" query="design" />
        <TextTruncate mode="end" text="Quarterly-design-review.pdf" query="design" />
        <TextTruncate mode="end" ellipsis="start" text="Quarterly-design-review.pdf" query="design" />
        <TextTruncate mode="end" ellipsis="start" text="Quarterly-design-review.pdf" />
        <TextTruncate mode="end" text="Quarterly-design-review.pdf" />
      </>
    );
    // Pending, measured and cut, measured and fitting, and the marker alone.
    const { container, rerender } = render(cases);
    collect(container);
    for (const next of [100, 1000, 20]) {
      layout.setWidth(next);
      for (const root of container.querySelectorAll("[data-truncate]")) root.setAttribute("data-width", String(next));
      layout.flush();
      rerender(cases);
      collect(container);
    }
    const missing = [...tokens].filter((token) => !css.includes(`${selector(token)}{`) && !css.includes(`${selector(token)}::before{`));
    expect(missing).toEqual([]);
  });
});
