import React from "react";
import { createRoot } from "react-dom/client";
import { TextTruncate } from "../../src/index";

// Truncated cells in a positioned scroll container, as a data grid lays them out:
// pointer, selection, overflow and focus must see the visible string only.
export const rows = [
  ["Quarterly revenue report for the northern region, final draft v3.pdf", "Board minutes, annual general meeting, approved.docx"],
  ["Customer interviews, southern district, raw transcripts.txt", "Engineering roadmap with hiring plan and budget.xlsx"],
  ["release...notes...final.txt with periods on both sides.md", "Marketing campaign assets, spring launch, approved.zip"],
];

// Scroll sizes before the first truncation, read in the parent's layout effect:
// it runs after the cells render the full text and before their frame measures.
function sizes() {
  const scroller = document.querySelector<HTMLElement>("#scroller")!;
  return {
    scroller: [scroller.scrollWidth, scroller.scrollHeight],
    cells: [...scroller.querySelectorAll<HTMLElement>("td")].map((cell) => [cell.scrollWidth, cell.scrollHeight]),
  };
}

function Page() {
  React.useLayoutEffect(() => {
    Object.assign(window, { sizesBefore: sizes() });
  }, []);
  return (
    <div id="scroller">
      <table aria-label="files">
        <thead>
          <tr>
            <th>Name</th>
            <th>Other</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((text, c) => (
                <td key={c} data-cell={`${r}-${c}`}>
                  <TextTruncate mode={c === 0 ? "middle" : "end"} strategy="measure" text={text} query={r === 0 ? "draft" : undefined} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

createRoot(document.querySelector("#fixture")!).render(<Page />);
Object.assign(window, { pointerRows: rows, readSizes: sizes });
