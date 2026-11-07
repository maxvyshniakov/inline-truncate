import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import { chromium, firefox, webkit } from "playwright";
import { compare, environment, markdown, summarizeScenario } from "./report.mjs";
import {validateCaptureOptions} from "./options.mjs";
import {productionSnapshot,referenceModulePath} from "./source.mjs";
const args = process.argv.slice(2);
validateCaptureOptions(args);
const option = (name, fallback) => args.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3) ?? fallback;
const browserName = option("browser", "chromium");
const checkOnly = args.includes("--check");
const runs = Number(option("runs", "9"));
if (!Number.isInteger(runs) || runs < 3) throw new Error("--runs must be an integer >=3");
const output = path.resolve(option("output", `artifacts/perf/${browserName}.json`));
const inlineSource = process.env.INLINE_MEASURE_SOURCE;
const reference = option("ref");
const production = productionSnapshot(process.cwd(),reference);
let referenceDirectory;
if (reference) {
  fs.mkdirSync(".cache/perf",{recursive:true});
  referenceDirectory=fs.mkdtempSync(path.resolve(".cache/perf/reference-"));
  for (const [file,content] of production) {
    const destination=path.join(referenceDirectory,file);
    fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,content);
  }
}
const digest = value => createHash("sha256").update(value).digest("hex");
const methodHash = digest(["scripts/perf/page.tsx","scripts/perf/index.html","scripts/perf/run.mjs","scripts/perf/report.mjs","scripts/perf/source.mjs","scripts/perf/options.mjs","scripts/perf/fonts/InterVariable.woff2"].map(file=>file+digest(fs.readFileSync(file))).join("\n"));
const inlineDirectory = inlineSource ? path.resolve(inlineSource,"src") : path.dirname(fileURLToPath(import.meta.resolve("@maxvyshniakov/inline-measure")));
const inlinePackage = JSON.parse(fs.readFileSync(path.resolve(inlineDirectory,"../package.json"),"utf8"));
const inlineMeasure = {version:inlinePackage.version,source:inlineSource ?? "registry",sourceHash:digest(fs.readdirSync(inlineDirectory).filter(file=>/\.(js|ts)$/.test(file) && !file.includes(".test.") && !file.endsWith(".d.ts")).sort().map(file=>file+digest(fs.readFileSync(path.join(inlineDirectory,file)))).join("\n"))};
const sourceHash = digest([...production].map(([file,content])=>file+digest(content)).join("\n"));
const server = await createServer({ configFile:false, root:process.cwd(), server:{port:0,host:"127.0.0.1",hmr:false,watch:null,fs:{allow:[process.cwd(),fs.realpathSync("node_modules"),...(inlineSource ? [path.resolve(inlineSource),fs.realpathSync(path.resolve(inlineSource,"node_modules"))] : [])]}}, plugins:[{name:"deferred-font-fixture",configureServer(server){server.middlewares.use((request,_response,next)=>{if(request.url?.includes("late=1"))setTimeout(next,150);else next();});}},...(reference ? [{name:"reference-source",enforce:"pre",async resolveId(id,importer){
  const target=referenceModulePath(id,importer,path.resolve("src"),path.join(referenceDirectory,"src"));
  if (target) return this.resolve(target,importer,{skipSelf:true});
}}] : [])], resolve: inlineSource ? {alias:{"@maxvyshniakov/inline-measure":path.resolve(inlineSource,"src/index.ts")}} : undefined });
let browser;
try {
  await server.listen();
  const launcher = {chromium,firefox,webkit}[browserName];
  if (!launcher) throw new Error(`Unsupported browser ${browserName}`);
  browser = await launcher.launch({headless:true,...(browserName === "firefox" ? {channel:"moz-firefox"} : {})});
  const page = await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
  const errors=[]; page.on("pageerror", error=>errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}scripts/perf/index.html`);
  await page.waitForFunction(()=>window.truncatePerf);
  await page.evaluate(()=>window.truncatePerf.ready);
  const scenarioFilter = option("scenario");
  const cases = (await page.evaluate(()=>window.truncatePerf.cases)).filter(s => !scenarioFilter || s.id.includes(scenarioFilter));
  if (!cases.length) throw new Error("No matching scenarios");
  const timerResolutionMs = await page.evaluate(() => {let prior=performance.now(), resolution=Infinity;for(let i=0;i<10_000;i++){const now=performance.now();if(now>prior)resolution=Math.min(resolution,now-prior);prior=now;}return Number.isFinite(resolution)?resolution:1;});
  const frameDurationMs = await page.evaluate(async()=>{const timestamps=[];for(let i=0;i<9;i++)timestamps.push(await new Promise(resolve=>requestAnimationFrame(resolve)));const intervals=timestamps.slice(1).map((value,index)=>value-timestamps[index]).sort((a,b)=>a-b);return intervals[Math.floor(intervals.length/2)];});
  const report = {schemaVersion:1,package:"@maxvyshniakov/text-truncate",workload:"text-truncate-v3",methodHash,implementation:{reference:reference ?? "working-tree",sourceHash},timerResolutionMs,frameDurationMs,revision:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),inlineMeasure,browser:`${browserName}/${browser.version()}`,environment:{...environment(),frameIntervalMs:Math.round(frameDurationMs)},scenarios:[],correctness:null};
  for (const scenario of checkOnly ? [] : cases) {
    await page.evaluate(s=>window.truncatePerf.sample(s),scenario);
    const samples=[];
    for(let i=0;i<runs;i++) samples.push(await page.evaluate(s=>window.truncatePerf.sample(s),scenario));
    const counterSample=await page.evaluate(s=>window.truncatePerf.sample(s,true),scenario);
    report.scenarios.push(summarizeScenario(scenario.id,samples,counterSample));
  }
  report.correctness=await page.evaluate(()=>window.truncatePerf.correctness());
  report.correctness.failures.push(...errors);
  report.correctness.pass &&= !errors.length;
  const baseline=option("baseline");
  if(baseline) report.comparison=compare(report,JSON.parse(fs.readFileSync(baseline,"utf8")),{allowInlineMeasureChange:args.includes("--allow-inline-measure-change")});
  fs.mkdirSync(path.dirname(output),{recursive:true});
  await page.screenshot({path:output.replace(/\.json$/,"")+".png"});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");
  fs.writeFileSync(output.replace(/\.json$/,"")+".md",markdown(report));
  console.log(markdown(report));
  if(!report.correctness.pass || report.scenarios.some(s=>!s.correctness) || (args.includes("--strict") && report.comparison?.some(s=>s.regression))) process.exitCode=1;
} finally { await browser?.close(); await server.close(); if(referenceDirectory)fs.rmSync(referenceDirectory,{recursive:true,force:true}); }
