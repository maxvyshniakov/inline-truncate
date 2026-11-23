import React from "react";
import { createRoot } from "react-dom/client";
import { TextTruncate, type TextTruncateProps } from "../../src/index";

const LONG = "Quarterly revenue report for the northern region, final draft v3.pdf";

export const cases: { id: string; expectTruncated: boolean; props: TextTruncateProps }[] = [
  { id: "middle", expectTruncated: true, props: { mode: "middle", text: LONG } },
  { id: "end-measure", expectTruncated: true, props: { mode: "end", strategy: "measure", text: LONG } },
  { id: "end-css", expectTruncated: false, props: { mode: "end", text: LONG } },
  { id: "middle-highlight", expectTruncated: true, props: { mode: "middle", text: LONG, query: "draft" } },
  { id: "middle-short", expectTruncated: false, props: { mode: "middle", text: "Short.pdf" } },
  { id: "middle-regrow", expectTruncated: true, props: { mode: "middle", text: LONG } },
];

function Page() {
  return (
    <>
      {cases.map(({ id, props }) => (
        <table key={id} aria-label={id}>
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
Object.assign(window, { a11yCases: cases.map(({ id, expectTruncated, props }) => ({ id, expectTruncated, text: props.text })) });
