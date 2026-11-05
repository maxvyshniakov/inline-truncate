import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { TextTruncate, truncateText } from "../../src/index";
import { createCanvasTextMeasurer } from "@maxvyshniakov/inline-measure";

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
let reactCommits = 0;
let profileCommits = false;
const nativeRect = Element.prototype.getBoundingClientRect;
const nativeRangeRect = Range.prototype.getBoundingClientRect;
const clientWidthDescriptor = Object.getOwnPropertyDescriptor(Element.prototype,"clientWidth")!;
const nativeMeasure = CanvasRenderingContext2D.prototype.measureText;
function instrument(enabled: boolean) {
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
    const range = document.createRange(); range.selectNodeContents(el);
    return range.getBoundingClientRect().width <= el.clientWidth + 0.5;
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
  calls = 0; units = 0; domReads = 0; reactCommits = 0; instrument(countWork);
  const start = performance.now();
  if (scenario.kind === "algorithm") {
    const measure = createCanvasTextMeasurer(getComputedStyle(fixture));
    for (let i = 0; i < scenario.count; i += 1) {
      outputs.push(truncateText({text: text(scenario.repeat ? 0 : i, scenario.long), maxWidth: 180, mode: scenario.mode as "middle" | "end", measureText: measure}).text);
    }
  } else if (scenario.kind === "mount") {
    render(scenario.count, scenario.mode,0,"",scenario.query,scenario.emoji); await settle();
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
  const counters = {calls, units,domReads,reactCommits}; instrument(false); profileCommits = false;
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
  for (const width of [...Array.from({length:61},(_,i)=>120+i*4),289,315,332]) {
  fixture.style.cssText = `width:${width}px;font:14px/20px TruncateHarnessInter`;
  flushSync(() => root.render(<TextTruncate mode="middle" query="oak" text="oak-collection-🧑🏽‍🎨-spring-lookbook-2026-final-print-oak.pdf" />));
  await settle();
  if (!componentFits(1)) failures.push(`highlighted-emoji/${width}`);
  }
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
  return {pass: !failures.length, failures};
}
const benchmarkFont = new FontFace("TruncateHarnessInter",'url("/scripts/perf/fonts/InterVariable.woff2")');
document.fonts.add(benchmarkFont);
const ready = benchmarkFont.load().then(()=>document.fonts.ready);
Object.assign(window, {truncatePerf: { cases, sample, correctness, ready }});
