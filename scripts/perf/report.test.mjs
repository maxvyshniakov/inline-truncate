import assert from "node:assert/strict";
import test from "node:test";
import {compare, medianInterval,percentile,summarizeScenario} from "./report.mjs";
const report = samples => ({schemaVersion:1,package:"text-truncate",methodHash:"a",workload:"test",browser:"chromium/1",environment:{cpu:"test"},timerResolutionMs:.1,scenarios:[{id:"middle",samplesMs:samples,medianMs:percentile(samples,.5),counters:{measureText:10}}]});
test("compatible captures report a clear slowdown and operation counts", () => {
  const [result]=compare(report([20,20.1,20.2,20,20]),report([10,10.1,10.2,10,10]));
  assert.equal(result.regression,true); assert.equal(result.deltaPercent,100); assert.equal(result.beforeCalls,10);
});
test("timer resolution and sample uncertainty prevent noise becoming a regression",()=>{
  assert.equal(compare(report([10,10,10,10,10]),report([10,10,10,10,10]))[0].regression,false);
  assert.equal(compare(report([10,20,30,40,50]),report([9,19,29,39,49]))[0].regression,false);
  assert.deepEqual(medianInterval([2,2,2]),[2,2]);
});
test("synchronous CPU-only notification batches do not depend on frame calibration",()=>{
  const base={...report([10,10,10]),environment:{cpu:"test",frameIntervalMs:16}};
  base.scenarios[0].id="notifications.same-width.middle.cpu.200";
  const next={...base,environment:{cpu:"test",frameIntervalMs:17}};
  assert.equal(compare(next,base)[0].regression,false);
  base.scenarios[0].id="components.notifications.middle.warm.200";
  assert.throws(()=>compare(next,base),/incompatible/);
});
test("different package, browser, method or scenario cannot produce a comparison",()=>{
  const base=report([1,2,3]);
  for(const changed of [{...base,package:"other"},{...base,browser:"webkit/1"},{...base,methodHash:"b"},{...base,scenarios:[]}]) assert.throws(()=>compare(changed,base),/incompatible/);
});
test("dependency changes require an explicit labelled experiment",()=>{
  const base={...report([10,10,10]),inlineMeasure:{version:"0.3.0",sourceHash:"old",source:"registry"}};
  const changed={...report([5,5,5]),inlineMeasure:{version:"0.3.0",sourceHash:"new",source:"/source"}};
  assert.throws(()=>compare(changed,base),/Inline Measure/);
  assert.equal(compare(changed,base,{allowInlineMeasureChange:true})[0].inlineMeasureChanged,true);
  assert.equal(compare({...base,inlineMeasure:{...base.inlineMeasure,source:"another-path"}},base)[0].inlineMeasureChanged,false);
});
test("component frame-settlement phase differences need a full calibrated frame of evidence",()=>{
  const base={...report([37,37,37]),frameDurationMs:16.7};base.scenarios[0].id="components.change-text.middle.50";
  const within={...report([50,50,50]),frameDurationMs:16.7};within.scenarios[0].id=base.scenarios[0].id;
  const slower={...report([75,75,75]),frameDurationMs:16.7};slower.scenarios[0].id=base.scenarios[0].id;
  assert.equal(compare(within,base)[0].regression,false);
  assert.equal(compare(slower,base)[0].regression,true);
});

test("a failed intermediate counter replay makes the scenario fail",()=>{
  const samples=[{ms:1,correct:true},{ms:2,correct:true},{ms:3,correct:true}];
  assert.equal(summarizeScenario("resize",samples,{calls:0,units:0,domReads:0,reactCommits:0,correct:false}).correctness,false);
});
