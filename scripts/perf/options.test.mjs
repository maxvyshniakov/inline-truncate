import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {validateCaptureOptions} from "./options.mjs";
test("strict capture requires a comparison baseline",()=>{
  assert.throws(()=>validateCaptureOptions(["--strict"]),/--strict requires --baseline/);
  assert.throws(()=>validateCaptureOptions(["--strict","--baseline="]),/--strict requires --baseline/);
  assert.doesNotThrow(()=>validateCaptureOptions(["--strict","--baseline=before.json"]));
});
test("CLI rejects strict capture before a browser or server starts",()=>{
  const child=spawnSync(process.execPath,["scripts/perf/run.mjs","--strict"],{encoding:"utf8",timeout:3000});
  assert.notEqual(child.status,0);assert.match(child.stderr,/--strict requires --baseline/);
});
test("max-call-ratio requires a finite number >= 1",()=>{
  assert.throws(()=>validateCaptureOptions(["--max-call-ratio=0.9"]),/--max-call-ratio/);
  assert.throws(()=>validateCaptureOptions(["--max-call-ratio=abc"]),/--max-call-ratio/);
  assert.doesNotThrow(()=>validateCaptureOptions(["--max-call-ratio=1.05"]));
});
