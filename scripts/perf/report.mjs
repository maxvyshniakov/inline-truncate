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
export function compare(current, baseline, {allowInlineMeasureChange = false} = {}) {
  const inlineMeasureChanged = current.inlineMeasure?.version !== baseline.inlineMeasure?.version
    || current.inlineMeasure?.sourceHash !== baseline.inlineMeasure?.sourceHash;
  if (inlineMeasureChanged && !allowInlineMeasureChange) throw new Error("Inline Measure changed; use --allow-inline-measure-change for an explicitly combined experiment");
  if (JSON.stringify(current.environment) !== JSON.stringify(baseline.environment) || current.browser !== baseline.browser || current.schemaVersion !== baseline.schemaVersion || current.package !== baseline.package || current.methodHash !== baseline.methodHash || current.workload !== baseline.workload || current.scenarios.map(s => s.id).join() !== baseline.scenarios.map(s=>s.id).join()) throw new Error("Baseline has incompatible browser, workload or environment");
  return current.scenarios.map((scenario, index) => {
    const old = baseline.scenarios[index];
    const before = medianInterval(old.samplesMs), after = medianInterval(scenario.samplesMs);
    const timingFloorMs = Math.max(current.timerResolutionMs,baseline.timerResolutionMs,
      scenario.id.startsWith("components.") ? Math.max(current.frameDurationMs ?? 0,baseline.frameDurationMs ?? 0) : 0);
    return { id:scenario.id, inlineMeasureChanged,timingFloorMs, beforeMs:old.medianMs, afterMs:scenario.medianMs, deltaPercent:100*(scenario.medianMs/old.medianMs-1), regression:after[0] > before[1] + timingFloorMs, beforeInterval:before, afterInterval:after, beforeCalls:old.counters.measureText, afterCalls:scenario.counters.measureText };
  });
}
export function markdown(report) {
  const lines = [`# Text Truncate performance`, ``, `Browser: ${report.browser}. Workload: ${report.workload}.`, ``, `Timing is wall time; component journeys include animation-frame settlement. Counts come from a separate untimed replay.`, ``, `| Scenario | Median ms | p95 ms | Canvas calls | DOM reads | Correct |`, `| --- | ---: | ---: | ---: | ---: | --- |`, ...report.scenarios.map(s=>`| ${s.id} | ${s.medianMs.toFixed(3)} | ${s.p95Ms.toFixed(3)} | ${s.counters.measureText} | ${s.counters.domReads} | ${s.correctness} |`)];
  if (report.comparison?.some(s=>s.inlineMeasureChanged)) lines.push("", "Combined experiment: Inline Measure changed as explicitly allowed by --allow-inline-measure-change. These timings cannot isolate Text Truncate alone.");
  if (report.comparison) lines.push(``, `| Scenario | Before ms | After ms | Change | Calls before → after |`, `| --- | ---: | ---: | ---: | ---: |`, ...report.comparison.map(s=>`| ${s.id} | ${s.beforeMs.toFixed(3)} | ${s.afterMs.toFixed(3)} | ${s.deltaPercent.toFixed(1)}% | ${s.beforeCalls} → ${s.afterCalls} |`));
  lines.push(``, `Correctness failures: ${report.correctness.failures.length}.`, `Strict timing regressions require non-overlapping bootstrap 95% median intervals and separation exceeding the coarser measured timer resolution (or one calibrated frame for component journeys). This measures evidence on this host, not a universal UX budget.`);
  return lines.join("\n")+"\n";
}

export function summarizeScenario(id,samples,counterSample) {
  const samplesMs=samples.map(sample=>sample.ms);
  return {id,samplesMs,medianMs:percentile(samplesMs,.5),p95Ms:percentile(samplesMs,.95),counters:{measureText:counterSample.calls,measuredCodeUnits:counterSample.units,domReads:counterSample.domReads,reactCommits:counterSample.reactCommits},correctness:samples.every(sample=>sample.correct) && counterSample.correct};
}
