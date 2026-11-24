import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { TextTruncate, type TextTruncateProps } from "../../src/index";

// width "fit": the cell takes the text's own width, as Data Grid's fitted column does.
export interface Case extends TextTruncateProps { id: string; width: number | "fit" }

const root = createRoot(document.querySelector("#fixture")!);
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function show(cases: Case[]) {
  await document.fonts.load('16px "Harness"');
  flushSync(() => root.render(<>{cases.map(({ id, width, ...props }) => (
    <div key={id} className="cell" data-case={id} style={{ width: width === "fit" ? "max-content" : width }}><TextTruncate {...props} /></div>
  ))}</>));
  for (let i = 0; i < 4; i++) await frame();
  return cases.map(({ id }) => {
    const cell = document.querySelector<HTMLElement>(`[data-case="${CSS.escape(id)}"]`)!;
    const element = cell.querySelector<HTMLElement>("[data-truncate]")!;
    const box = (node: Element) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    const style = getComputedStyle(element);
    const rootBox = box(element);
    const visible = element.querySelector(":scope > [data-truncate-visible]") ?? element;
    return {
      id,
      root: rootBox,
      // The clipping content box: what the text is cut to.
      content: { left: rootBox.left + parseFloat(style.paddingLeft), right: rootBox.right - parseFloat(style.paddingRight) },
      cell: box(cell),
      strategy: element.dataset.truncateStrategy,
      state: element.dataset.truncateState ?? null,
      visible: visible.textContent,
      overflows: element.scrollWidth > element.clientWidth,
      clientWidth: element.clientWidth,
      matches: [...visible.querySelectorAll('[data-slot="highlighted-match"]')].map((node) => ({
        ...box(node), marker: node.hasAttribute("data-truncate-marker"), text: node.textContent, color: getComputedStyle(node).color,
      })),
    };
  });
}

Object.assign(window, { highlightHarness: { show } });
