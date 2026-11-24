import React from "react";
import { createRoot } from "react-dom/client";
import { TextTruncate, type TextTruncateProps } from "../../src/index";

const LONG = "Quarterly revenue report for the northern region, final draft v3.pdf";

// expectMarker: the query matches only the cut part, so the marker carries the highlight.
export const cases: { id: string; expectTruncated: boolean; expectMarker?: boolean; props: TextTruncateProps }[] = [
  { id: "middle", expectTruncated: true, props: { mode: "middle", text: LONG } },
  { id: "end-measure", expectTruncated: true, props: { mode: "end", strategy: "measure", text: LONG } },
  { id: "end-css", expectTruncated: false, props: { mode: "end", text: LONG } },
  { id: "middle-highlight", expectTruncated: true, props: { mode: "middle", text: LONG, query: "draft" } },
  { id: "middle-cut-match", expectTruncated: true, expectMarker: true, props: { mode: "middle", text: LONG, query: "northern" } },
  { id: "middle-short", expectTruncated: false, props: { mode: "middle", text: "Short.pdf" } },
  { id: "middle-regrow", expectTruncated: true, props: { mode: "middle", text: LONG } },
  // The ellipsis first, measured: the end kept, the text in a bdi in a right-to-left line.
  { id: "end-start-measure", expectTruncated: true, props: { mode: "end", ellipsis: "start", strategy: "measure", text: LONG } },
  { id: "end-start-cut-match", expectTruncated: true, expectMarker: true, props: { mode: "end", ellipsis: "start", text: LONG, query: "revenue" } },
];

function Page() {
  return (
    <>
      {cases.map(({ id, props }) => (
        // A header row makes it a data table; Chromium exposes a lone cell as a layout table.
        <table key={id} aria-label={id}>
          <thead>
            <tr>
              <th>Name</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-case={id}>
                <TextTruncate {...props} />
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </>
  );
}

createRoot(document.querySelector("#fixture")!).render(<Page />);
Object.assign(window, { a11yCases: cases.map(({ id, expectTruncated, expectMarker, props }) => ({ id, expectTruncated, expectMarker: expectMarker ?? false, text: props.text })) });
