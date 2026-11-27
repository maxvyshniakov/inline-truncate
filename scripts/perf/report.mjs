import os from "node:os";

export function percentile(values, fraction) {
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}
export function medianInterval(values) {
  let seed = 9173;
  const medians = Array.from({ length: 1000 }, () => percentile(Array.from({length:values.length}, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return values[seed % values.length];
  }), 0.5));
  return [percentile(medians, .025), percentile(medians, .975)];
}
export function environment() {
  return { host:os.hostname(), osRelease:os.release(), platform:os.platform(), arch:os.arch(), cpu:os.cpus()[0]?.model, viewport:{width:1280,height:800},dpr:1 };
}
export const DEFAULT_MAX_CALL_RATIO = 1.05;

export function compare(current, baseline, {allowInlineMeasureChange = false, maxCallRatio = DEFAULT_MAX_CALL_RATIO} = {}) {
  if (typeof maxCallRatio !== "number" || !Number.isFinite(maxCallRatio) || maxCallRatio < 1) {
    throw new Error("maxCallRatio must be a finite number >= 1");
  }
  const cpuOnly=[current,baseline].every(report=>report.scenarios.length > 0 && report.scenarios.every(s=>/^notifications\.same-width\..*\.cpu\.\d+$/.test(s.id)));
  // These batches drain callbacks synchronously and never wait for a frame.
  // Preserve raw calibration; it remains part of every frame-based comparison.
  const comparableEnvironment=report=>cpuOnly
    ? Object.fromEntries(Object.entries(report.environment).filter(([key])=>key !== "frameIntervalMs"))
    : report.environment;
  const inlineMeasureChanged = current.inlineMeasure?.version !== baseline.inlineMeasure?.version
    || current.inlineMeasure?.sourceHash !== baseline.inlineMeasure?.sourceHash;
  if (inlineMeasureChanged && !allowInlineMeasureChange) throw new Error("Inline Measure changed; use --allow-inline-measure-change for an explicitly combined experiment");
  if (JSON.stringify(comparableEnvironment(current)) !== JSON.stringify(comparableEnvironment(baseline)) || current.browser !== baseline.browser || current.schemaVersion !== baseline.schemaVersion || current.package !== baseline.package || current.methodHash !== baseline.methodHash || current.workload !== baseline.workload || current.scenarios.map(s => s.id).join() !== baseline.scenarios.map(s=>s.id).join()) throw new Error("Baseline has incompatible browser, workload or environment");
  return current.scenarios.map((scenario, index) => {
    const old = baseline.scenarios[index];
    const before = medianInterval(old.samplesMs), after = medianInterval(scenario.samplesMs);
    const timingFloorMs = Math.max(current.timerResolutionMs,baseline.timerResolutionMs,
      scenario.id.startsWith("components.") ? Math.max(current.frameDurationMs ?? 0,baseline.frameDurationMs ?? 0) : 0);
    const beforeCalls = old.counters.measureText;
    const afterCalls = scenario.counters.measureText;
    const callRatio = beforeCalls > 0 ? afterCalls / beforeCalls : (afterCalls === 0 ? 1 : Infinity);
    const callDeltaPercent = beforeCalls > 0 ? 100 * (callRatio - 1) : (afterCalls === 0 ? 0 : Infinity);
    const timingRegression = after[0] > before[1] + timingFloorMs;
    const callRegression = beforeCalls === 0 ? afterCalls > 0 : callRatio > maxCallRatio;
    return { id:scenario.id, inlineMeasureChanged,timingKind:cpuOnly ? "synchronous-cpu" : "wall-time",timingFloorMs, beforeMs:old.medianMs, afterMs:scenario.medianMs, deltaPercent:100*(scenario.medianMs/old.medianMs-1), timingRegression, callRegression, regression:timingRegression || callRegression, beforeInterval:before, afterInterval:after, beforeCalls, afterCalls, callRatio, callDeltaPercent, maxCallRatio };
  });
}
export function markdown(report) {
  const lines = [`# Text Truncate performance`, ``, `Browser: ${report.browser}. Workload: ${report.workload}.`, ``, `Timing is wall time; component journeys include animation-frame settlement. Counts come from a separate untimed replay.`, ``, `| Scenario | Median ms | p95 ms | Canvas calls | DOM reads | Correct |`, `| --- | ---: | ---: | ---: | ---: | --- |`, ...report.scenarios.map(s=>`| ${s.id} | ${s.medianMs.toFixed(3)} | ${s.p95Ms.toFixed(3)} | ${s.counters.measureText} | ${s.counters.domReads} | ${s.correctness} |`)];
  if (report.comparison?.some(s=>s.inlineMeasureChanged)) lines.push("", "Combined experiment: Inline Measure changed as explicitly allowed by --allow-inline-measure-change. These timings cannot isolate Text Truncate alone.");
  if (report.comparison) lines.push(``, `| Scenario | Before ms | After ms | Time change | Calls before → after | Call change |`, `| --- | ---: | ---: | ---: | ---: | ---: |`, ...report.comparison.map(s=>`| ${s.id} | ${s.beforeMs.toFixed(3)} | ${s.afterMs.toFixed(3)} | ${s.deltaPercent.toFixed(1)}% | ${s.beforeCalls} → ${s.afterCalls} | ${Number.isFinite(s.callDeltaPercent) ? `${s.callDeltaPercent.toFixed(1)}%` : "+∞"} |`));
  const maxCallRatio = report.comparison?.[0]?.maxCallRatio ?? DEFAULT_MAX_CALL_RATIO;
  lines.push(``, `Correctness failures: ${report.correctness.failures.length}.`, `Strict timing regressions require non-overlapping bootstrap 95% median intervals and separation exceeding the coarser measured timer resolution (or one calibrated frame for component journeys). Measurement-call regressions trigger when \`afterCalls / beforeCalls > ${maxCallRatio}\` (or any call > 0 when baseline was 0). This measures evidence on this host, not a universal UX budget.`);
  return lines.join("\n")+"\n";
}

export function summarizeScenario(id,samples,counterSample) {
  const samplesMs=samples.map(sample=>sample.ms);
  return {id,samplesMs,medianMs:percentile(samplesMs,.5),p95Ms:percentile(samplesMs,.95),counters:{measureText:counterSample.calls,measuredCodeUnits:counterSample.units,domReads:counterSample.domReads,computedStyle:counterSample.styleReads ?? 0,reactCommits:counterSample.reactCommits},correctness:samples.every(sample=>sample.correct) && counterSample.correct};
}
