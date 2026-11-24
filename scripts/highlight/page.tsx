import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { measureInlineTextWidth } from "inline-measure";
import { TextTruncate, type TextTruncateProps } from "../../src/index";

// width "fit": the cell takes the text's own width, as Data Grid's fitted column does.
// reference: a consumer className; the case also renders the root's box on
// origin/dev (`block w-full min-w-0 truncate` plus that class) in a cell beside it.
export interface Case extends TextTruncateProps { id: string; width: number | "fit"; reference?: string }

const root = createRoot(document.querySelector("#fixture")!);
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// Settled: three frames in a row without a DOM change (measuring commits in a frame).
async function settle(target: Node) {
  let changed = true;
  const observer = new MutationObserver(() => { changed = true; });
  observer.observe(target, { subtree: true, childList: true, attributes: true, characterData: true });
  try {
    for (let quiet = 0, frames = 0; quiet < 3; frames++) {
      if (frames > 120) throw new Error("the fixture did not settle in 120 frames");
      changed = false;
      await frame();
      quiet = changed ? 0 : quiet + 1;
    }
  } finally {
    observer.disconnect();
  }
}

const box = (node: Element | Range) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };

// Whether the first and the last character of the text are drawn inside the root.
function shownEnds(element: HTMLElement) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => node.parentElement?.closest("[data-truncate-full-text]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if ((node as Text).data) nodes.push(node as Text);
  const outer = element.getBoundingClientRect();
  const inside = (node: Text, offset: number) => {
    const range = document.createRange();
    range.setStart(node, offset); range.setEnd(node, offset + 1);
    const r = range.getBoundingClientRect();
    const center = (r.left + r.right) / 2;
    return r.width > 0 && center > outer.left && center < outer.right;
  };
  const first = nodes[0], last = nodes.at(-1)!;
  return { first: first.data[0], firstShown: inside(first, 0), last: last.data.at(-1), lastShown: inside(last, last.data.length - 1) };
}

// Where the cut's dots are drawn: the first "..." in the visible string.
function dots(visible: Element) {
  const walker = document.createTreeWalker(visible, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const at = node.data.indexOf("...");
    if (at < 0) continue;
    const range = document.createRange();
    range.setStart(node, at); range.setEnd(node, at + 3);
    return box(range);
  }
  return null;
}

async function show(cases: Case[]) {
  await document.fonts.load('16px "Harness"');
  flushSync(() => root.render(<>{cases.map(({ id, width, reference, ...props }) => (
    <React.Fragment key={id}>
      <div className="cell" data-case={id} style={{ width: width === "fit" ? "max-content" : width }}><TextTruncate {...props} className={reference} /></div>
      {reference !== undefined && (
        <div className="cell" data-reference={id} style={{ width: width === "fit" ? "max-content" : width }}>
          <span className={`block w-full min-w-0 truncate ${reference}`}>{props.text}</span>
        </div>
      )}
    </React.Fragment>
  ))}</>));
  await settle(document.querySelector("#fixture")!);
  return cases.map(({ id, text }) => {
    const cell = document.querySelector<HTMLElement>(`[data-case="${CSS.escape(id)}"]`)!;
    const element = cell.querySelector<HTMLElement>("[data-truncate]")!;
    const style = getComputedStyle(element);
    const rootBox = box(element);
    const visible = element.querySelector(":scope > [data-truncate-visible]") ?? element;
    const referenceCell = document.querySelector<HTMLElement>(`[data-reference="${CSS.escape(id)}"]`);
    const reference = referenceCell?.firstElementChild as HTMLElement | undefined;
    return {
      id,
      root: rootBox,
      // The box the text is laid out in.
      content: { left: rootBox.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft), right: rootBox.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight) },
      cell: box(cell),
      direction: style.direction,
      strategy: element.dataset.truncateStrategy,
      state: element.dataset.truncateState ?? null,
      visible: visible.textContent,
      ends: shownEnds(element),
      overflows: element.scrollWidth > element.clientWidth,
      clientWidth: element.clientWidth,
      // What a host measuring the root with Inline Measure gets (Data Grid's auto-fit).
      inlineWidth: measureInlineTextWidth({ sourceElement: element, text }),
      reference: reference ? {
        root: box(reference),
        cell: box(referenceCell!),
        inlineWidth: measureInlineTextWidth({ sourceElement: reference, text }),
      } : null,
      dots: element.dataset.truncateState === "truncated" ? dots(visible) : null,
      matches: [...visible.querySelectorAll('[data-slot="highlighted-match"]')].map((node) => ({
        ...box(node), marker: node.hasAttribute("data-truncate-marker"), text: node.textContent, color: getComputedStyle(node).color,
      })),
    };
  });
}

Object.assign(window, { highlightHarness: { show } });
