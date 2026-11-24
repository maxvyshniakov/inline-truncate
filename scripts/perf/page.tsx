import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { TextTruncate, truncateText } from "../../src/index";
import { createCanvasTextMeasurer } from "inline-measure";

const fixture = document.querySelector<HTMLDivElement>("#fixture")!;
const root = createRoot(fixture);
const resizeNotifications = new Set<() => void>();
const NativeResizeObserver = window.ResizeObserver;
window.ResizeObserver = class extends NativeResizeObserver {
  readonly notify: () => void;
  constructor(callback: ResizeObserverCallback) {
    super(callback);
    this.notify=()=>callback([],this);
    resizeNotifications.add(this.notify);
  }
  override disconnect() {resizeNotifications.delete(this.notify);super.disconnect();}
};
let calls = 0;
let units = 0;
let domReads = 0;
let styleReads = 0;
let reactCommits = 0;
let profileCommits = false;
const nativeRect = Element.prototype.getBoundingClientRect;
const nativeRangeRect = Range.prototype.getBoundingClientRect;
const clientWidthDescriptor = Object.getOwnPropertyDescriptor(Element.prototype,"clientWidth")!;
const nativeMeasure = CanvasRenderingContext2D.prototype.measureText;
const nativeComputedStyle = window.getComputedStyle;
function instrument(enabled: boolean) {
  window.getComputedStyle = enabled ? function (...args) { styleReads += 1; return nativeComputedStyle.apply(window,args); } : nativeComputedStyle;
  Range.prototype.getBoundingClientRect = enabled ? function () { domReads += 1; return nativeRangeRect.call(this); } : nativeRangeRect;
  Element.prototype.getBoundingClientRect = enabled ? function () { domReads += 1; return nativeRect.call(this); } : nativeRect;
  Object.defineProperty(Element.prototype,"clientWidth",enabled ? {...clientWidthDescriptor,get(){domReads += 1;return clientWidthDescriptor.get!.call(this);}} : clientWidthDescriptor);
  CanvasRenderingContext2D.prototype.measureText = enabled ? function (text) {
    calls += 1; units += text.length;
    return nativeMeasure.call(this, text);
  } : nativeMeasure;
}
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const settle = async () => { await frame(); await frame(); await frame(); };
const text = (index: number, long = false) => long
  ? `collections/${"final-production-materials/".repeat(30)}${index}-approved.glb`
  : `Halden walnut lounge chair / collection-2026 / revision-${index}-final.glb`;
interface Scenario {id:string;kind:string;count:number;mode:string;long?:boolean;repeat?:boolean;query?:string;emoji?:boolean}
const cases: Scenario[] = [
  ...[50, 200].flatMap(count => ["middle", "end"].map(mode => ({ id: `algorithm.${mode}.${count}`, kind: "algorithm", count, mode }))),
  { id: "algorithm.repeated-labels.middle.200", kind:"algorithm",count:200,mode:"middle",repeat:true },
  { id: "algorithm.middle.long.50", kind: "algorithm", count: 50, mode: "middle", long: true },
  ...["middle", "measured-end", "css-end", "css-start"].map(mode => ({ id: `components.mount.${mode}.cold.200`, kind: "mount", count: 200, mode })),
  { id:"components.mount.middle.cold.50",kind:"mount",count:50,mode:"middle" },
  { id:"components.mount.highlight-middle.cold.50",kind:"mount",count:50,mode:"middle",query:"walnut" },
  { id:"components.mount.emoji-middle.cold.50",kind:"mount",count:50,mode:"middle",emoji:true },
  { id:"components.notifications.middle.warm.200",kind:"notifications",count:200,mode:"middle" },
  ...[false,true].map(emoji=>({id:`notifications.same-width.${emoji ? "emoji-" : ""}middle.cpu.200`,kind:"same-width",count:200,mode:"middle",emoji})),
  { id: "components.resize.middle.warm.200", kind: "resize", count: 200, mode: "middle" },
  { id: "components.change-text.middle.50", kind: "change", count: 50, mode: "middle" },
  { id: "components.change-style.middle.50", kind: "style", count: 50, mode: "middle" },
];
function render(count: number, mode: string, revision = 0, className = "",query = "",emoji = false) {
  const content = <>{Array.from({ length: count }, (_, i) => <TextTruncate key={i} className={className} query={query} mode={mode === "middle" ? "middle" : "end"} strategy={mode.startsWith("css") ? "css" : "measure"} ellipsis={mode === "css-start" ? "start" : "end"} text={`${revision ? "Updated " : ""}${emoji ? `catalog/collections/🧑🏽‍🎨/final-${i}-approved-materials.pdf` : text(i)}`} />)}</>;
  flushSync(() => root.render(profileCommits
    ? <React.Profiler id="truncate-fixture" onRender={()=>{reactCommits += 1;}}>{content}</React.Profiler>
    : content));
}
function componentFits(expected: number, total = expected) {
  if (fixture.querySelectorAll("[data-truncate]").length !== total) return false;
  for (const element of fixture.querySelectorAll<HTMLElement>('[data-truncate-strategy="css"]')) {
    const computed = getComputedStyle(element);
    if (computed.textOverflow !== "ellipsis" || computed.whiteSpace !== "nowrap") return false;
    if (element.dataset.truncateOverflowTarget && (!element.querySelector("bdi") || computed.direction !== "rtl")) return false;
  }
  const nodes = [...fixture.querySelectorAll<HTMLElement>('[data-truncate-strategy="measure"]')];
  return nodes.length === expected && nodes.every(el => {
    // Measure what a user sees: the visible string. A cut root also holds the
    // full text for assistive technology, clipped to a 1px box; a range over
    // the root would add that copy's unclipped text run to the width.
    const visible = el.querySelector<HTMLElement>(":scope > [data-truncate-visible]") ?? el;
    const range = document.createRange(); range.selectNodeContents(visible);
    const style=getComputedStyle(el);
    const contentWidth=el.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0);
    if (range.getBoundingClientRect().width > contentWidth + 0.5) return false;
    // The copy must take no room: its box stays inside the root's.
    const copy = el.querySelector<HTMLElement>(":scope > [data-truncate-full-text]");
    if (!copy) return true;
    const box = copy.getBoundingClientRect(), outer = el.getBoundingClientRect();
    return box.width <= 1 && box.height <= 1 && box.left >= outer.left - 1 && box.right <= outer.right + 0.5
      && box.top >= outer.top - 1 && box.bottom <= outer.bottom + 0.5;
  });
}
function domFits(value: string, maxWidth: number, font?: string) {
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;white-space:pre;width:max-content";
  if (font) probe.style.font = font;
  probe.textContent = value; fixture.append(probe);
  const fits = probe.getBoundingClientRect().width <= maxWidth + 0.5;
  probe.remove(); return fits;
}
async function sample(scenario: typeof cases[number], countWork = false) {
  instrument(false); profileCommits = countWork;
  flushSync(() => root.render(null)); fixture.style.width = "240px"; fixture.className = "";
  if (scenario.kind !== "algorithm" && scenario.kind !== "mount") { render(scenario.count, scenario.mode,0,"",scenario.query,scenario.emoji); await settle(); }
  const outputs: string[] = [];
  let intermediateCorrect = true;
  calls = 0; units = 0; domReads = 0; styleReads = 0; reactCommits = 0; instrument(countWork);
  const start = performance.now();
  if (scenario.kind === "algorithm") {
    const measure = createCanvasTextMeasurer(getComputedStyle(fixture));
    for (let i = 0; i < scenario.count; i += 1) {
      outputs.push(truncateText({text: text(scenario.repeat ? 0 : i, scenario.long), maxWidth: 180, mode: scenario.mode as "middle" | "end", measureText: measure}).text);
    }
  } else if (scenario.kind === "mount") {
    render(scenario.count, scenario.mode,0,"",scenario.query,scenario.emoji); await settle();
  } else if (scenario.kind === "same-width") {
    // CPU throughput, not frame latency: deliver the existing RO callbacks and
    // synchronously drain their actual RAF work against live native geometry.
    const raf=window.requestAnimationFrame, cancel=window.cancelAnimationFrame;
    const pending=new Map<number,FrameRequestCallback>();let nextId=0;
    window.requestAnimationFrame=callback=>{pending.set(++nextId,callback);return nextId;};
    window.cancelAnimationFrame=id=>{pending.delete(id);};
    try {
      for(let repeat=0;repeat<20;repeat++) {
        for(const notify of resizeNotifications)notify();
        const callbacks=[...pending.values()];pending.clear();
        for(const callback of callbacks)callback(performance.now());
      }
    } finally {window.requestAnimationFrame=raf;window.cancelAnimationFrame=cancel;}
  } else if (scenario.kind === "notifications") {
    for (let repeat=0;repeat<5;repeat++) {
      for (const notify of resizeNotifications) notify();
      await settle();
      if (countWork) {instrument(false);intermediateCorrect &&= componentFits(scenario.count);instrument(true);}
    }
  } else if (scenario.kind === "resize") {
    for (const width of [160, 320, 120, 280, 200]) {
      fixture.style.width = `${width}px`; await settle();
      if (countWork) { instrument(false); intermediateCorrect &&= componentFits(scenario.count); instrument(true); }
    }
  } else {
    render(scenario.count, scenario.mode, scenario.kind === "change" ? 1 : 0, scenario.kind === "style" ? "large" : ""); await settle();
  }
  const ms = performance.now() - start;
  const counters = {calls, units,domReads,styleReads,reactCommits}; instrument(false); profileCommits = false;
  const correct = scenario.kind === "algorithm"
    ? outputs.length === scenario.count && outputs.every(value => domFits(value,180))
    : intermediateCorrect && componentFits(scenario.mode.startsWith("css") ? 0 : scenario.count,scenario.count);
  return {ms, ...counters, correct};
}
async function correctness() {
  const failures: string[] = [];
  for (const font of ["16px Arial", "italic 16px Georgia", "16px sans-serif"]) {
    const measureText = createCanvasTextMeasurer(font);
    for (const value of ["office affine AVATAR file-final.pdf", "a👍🏽bc👨‍👩‍👧‍👦.glb", "Матеріали/колекція/затверджено.pdf", "مرحبا بالعالم ملف نهائي طويل.pdf", "1 234 567,89 € / approved"]) {
      for (const mode of ["middle", "end"] as const) for (const maxWidth of [30, 80, 120, 180]) {
        const result = truncateText({text:value,maxWidth,mode,measureText});
        if (!domFits(result.text, maxWidth, font)) failures.push(`${font}/${mode}/${maxWidth}/${value}`);
      }
    }
  }
  const inter = new FontFace("TruncateHarnessInter", 'url("/scripts/perf/fonts/InterVariable.woff2")');
  document.fonts.add(inter); await inter.load();
  for (const variant of ["tabular-nums", "normal"]) {
    fixture.style.cssText = "width:120px;font:16px TruncateHarnessInter";
    fixture.style.fontVariantNumeric = variant;
    flushSync(() => root.render(<>{Array.from({length:10}, (_,i)=><TextTruncate key={i} mode="middle" text={`${i}1111 / 23456789 / approved.pdf`} />)}</>));
    await settle();
    if (!componentFits(10)) failures.push(`Inter/${variant}`);
  }
  for (const mode of ["middle", "end"] as const) for (const width of [160, 220]) {
    fixture.style.cssText = `width:${width}px;font:32px TruncateHarnessInter;font-optical-sizing:none`;
    flushSync(() => root.render(<TextTruncate key={`${mode}-${width}`} mode={mode} strategy="measure" text="In progress / approved / final-materials.pdf" />));
    await settle();
    if (!componentFits(1)) failures.push(`optical-none/${mode}/${width}`);
  }
  for (const width of [...Array.from({length:61},(_,i)=>120+i*4),289,295,315,332]) {
  fixture.style.cssText = `width:${width}px;font:14px/20px TruncateHarnessInter`;
  flushSync(() => root.render(<TextTruncate mode="middle" query="oak" text="oak-collection-🧑🏽‍🎨-spring-lookbook-2026-final-print-oak.pdf" />));
  await settle();
  if (!componentFits(1)) failures.push(`highlighted-emoji/${width}`);
  }
  // Matches found in the full text: "lookbook" sits in the cut part, so the
  // marker is highlighted; "spring" straddles the cut at some widths.
  for (const query of ["lookbook", "spring"]) for (const width of [...Array.from({length:61},(_,i)=>120+i*4),295]) {
    fixture.style.cssText = `width:${width}px;font:14px/20px TruncateHarnessInter`;
    flushSync(() => root.render(<TextTruncate mode="middle" query={query} text="oak-collection-🧑🏽‍🎨-spring-lookbook-2026-final-print-oak.pdf" />));
    await settle();
    if (!componentFits(1)) failures.push(`highlighted-cut/${query}/${width}`);
  }
  // A query change where the cut is measured in the DOM (a style canvas cannot
  // express): the new query's highlight must be measured, not the old one's.
  for (const width of [...Array.from({length:61},(_,i)=>120+i*4),295]) {
    fixture.style.cssText = `width:${width}px;font:14px/20px TruncateHarnessInter;font-optical-sizing:none`;
    flushSync(() => root.render(<TextTruncate key={`dom-query-${width}`} mode="middle" query="walnut" text="oak-collection-spring-lookbook-2026-final-print-oak.pdf" />));
    await settle();
    flushSync(() => root.render(<TextTruncate key={`dom-query-${width}`} mode="middle" query="spring" text="oak-collection-spring-lookbook-2026-final-print-oak.pdf" />));
    await settle();
    if (!componentFits(1)) failures.push(`dom-query-change/${width}`);
  }
  fixture.style.cssText = "width:295px;font:14px/20px TruncateHarnessInter";
  flushSync(() => root.render(<TextTruncate mode="middle" query="final" text="oak-collection-🧑🏽‍🎨-spring-lookbook-2026-final-print-oak.pdf" />));
  await settle();
  if (!componentFits(1)) failures.push("highlight-query-change");
  fixture.style.cssText = "width:240px";
  document.fonts.delete(inter);
  render(10,"middle"); await settle();
  for (const width of [320,120,240]) {
    fixture.style.width = `${width}px`; await settle();
    if (!componentFits(10)) failures.push(`resize/${width}`);
  }
  render(10,"middle",0,"large"); await settle();
  if (!componentFits(10)) failures.push("style-only-change");
  render(10,"middle",0,"large late"); await settle();
  const face = new FontFace("TruncateHarnessLate", 'url("/scripts/perf/fonts/InterVariable.woff2?late=1")');
  document.fonts.add(face);
  await document.fonts.load('20px "TruncateHarnessLate"',text(0));
  await document.fonts.ready; await settle();
  if (!componentFits(10)) failures.push("late-font-load");
  fixture.style.cssText="width:240px;font:14px TruncateHarnessInter";
  render(1,"middle",0,"","",true);await settle();
  const stable=fixture.textContent;
  for(const notify of resizeNotifications)notify();await settle();
  if(fixture.textContent !== stable)failures.push("same-width-output");
  fixture.style.width="0px";await settle();
  fixture.style.width="240px";await settle();
  if(fixture.textContent !== stable || !componentFits(1))failures.push("hidden-restore");
  fixture.style.fontSize="24px";
  for(const notify of resizeNotifications)notify();await settle();
  if(!componentFits(1))failures.push("same-width-live-font-style");
  const padded=fixture.querySelector<HTMLElement>("[data-truncate]")!;
  padded.style.boxSizing="border-box";padded.style.paddingLeft="40px";
  for(const notify of resizeNotifications)notify();await settle();
  if(!componentFits(1))failures.push("same-width-padding");
  return {pass: !failures.length, failures};
}
const benchmarkFont = new FontFace("TruncateHarnessInter",'url("/scripts/perf/fonts/InterVariable.woff2")');
document.fonts.add(benchmarkFont);
const ready = benchmarkFont.load().then(()=>document.fonts.ready);
Object.assign(window, {truncatePerf: { cases, sample, correctness, ready }});
