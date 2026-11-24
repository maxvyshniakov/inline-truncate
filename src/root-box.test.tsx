import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { TextTruncate } from "./index";

afterEach(cleanup);

const fileName = "Quarterly-design-review.pdf";

// data-grid#148: a highlight decoration that paints past the glyphs (Data
// Grid's 1px box-shadow) keeps that pixel at the root's clipping edge. The
// padding sits inside the clip and the equal negative margin outside, so the
// content box, and the cut measured from it, stay where they were.
describe("the root's paint room", () => {
  it("gives every strategy 1px inside the clip on each inline side, in a content box", () => {
    const { container } = render(
      <>
        <TextTruncate mode="middle" text={fileName} />
        <TextTruncate mode="end" text={fileName} />
        <TextTruncate mode="end" ellipsis="start" text={fileName} />
      </>,
    );
    for (const node of container.querySelectorAll<HTMLElement>("[data-truncate]")) {
      expect(node).toHaveClass("box-content", "px-px", "-mx-px");
    }
  });
});
