import fs from 'node:fs';
import {createServer} from '/Users/maxwish/text-truncate/node_modules/vite/dist/node/index.js';
import {chromium,firefox,webkit} from '/Users/maxwish/text-truncate/node_modules/playwright/index.mjs';
const variants=['/Users/maxwish/text-truncate','/private/tmp/text-truncate-native-lazy-box-20261105','/private/tmp/text-truncate-native-pooled-root-20261105-v2'];
const server=await createServer({configFile:false,root:variants[0],server:{host:'127.0.0.1',port:0,hmr:false,watch:null,fs:{allow:['/Users/maxwish/text-truncate','/Users/maxwish/inline-measure','/private/tmp']}},resolve:{alias:{'@maxvyshniakov/inline-measure':'/Users/maxwish/inline-measure/src/index.ts'}}});
const results=[];
try {await server.listen();for(const [name,launcher] of Object.entries({chromium,firefox,webkit})) {
 const browser=await launcher.launch({headless:true,...(name==='firefox'?{channel:'moz-firefox'}:{})});
 try{const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]+'scripts/perf/index.html');await page.waitForFunction(()=>window.truncatePerf);await page.evaluate(()=>window.truncatePerf.ready);
 const result=await page.evaluate(async(paths)=>{
  const modules=await Promise.all(paths.map(p=>import('/@fs'+p+'/src/measurement.ts')));
  const fixture=document.querySelector('#fixture');const source=document.createElement('span');fixture.append(source);
  const original='oak-collection-🧑🏽‍🎨-spring-lookbook-2026-final-print-oak.pdf';source.dataset.truncateOriginal=original;
  const graphemes=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(original)].map(p=>p.segment);
  const candidates=[original,'...',...Array.from({length:20},(_,i)=>graphemes.slice(0,i+1).join('')+'...'+graphemes.slice(-i-1).join(''))];
  const differences=[];let comparisons=0;
  for(const font of ['14px TruncateHarnessInter','16px Arial','italic 16px Georgia']) for(const query of ['', 'oak']) for(const extra of ['', 'font-variant-numeric:tabular-nums','font-feature-settings:"kern" 0','word-spacing:2px']) {
   source.style.cssText='display:block;width:332px;font:'+font+';'+extra;
   const computed=getComputedStyle(source);const sessions=modules.map(m=>m.createMeasurementSession(source,computed,query));
   try{for(const value of candidates) { const widths=sessions.map(s=>(s.verifyText??s.measureText)(value));comparisons+=2;for(let i=1;i<widths.length;i++)if(widths[i]!==widths[0])differences.push({variant:i,font,query,extra,value,widths});}}
   finally{sessions.forEach(s=>s.dispose());}
  }
  await new Promise(resolve=>setTimeout(resolve,0));
  source.style.cssText='display:block;width:332px;font:14px TruncateHarnessInter';
  const operations=[];
  for(const module of modules) {
   let bodyAppends=0,bodyRemoves=0;
   const append=document.body.append,remove=Element.prototype.remove;
   document.body.append=function(...nodes){bodyAppends++;return append.apply(this,nodes);};
   Element.prototype.remove=function(){if(this.parentElement===document.body)bodyRemoves++;return remove.call(this);};
   try{for(let i=0;i<50;i++) {const session=module.createMeasurementSession(source,getComputedStyle(source),'oak');session.verifyText('oak-🪑...oak.pdf');session.dispose();}await new Promise(resolve=>setTimeout(resolve,0));}
   finally{document.body.append=append;Element.prototype.remove=remove;}
   operations.push({bodyAppends,bodyRemoves});
  }
  const make=()=>modules[2].createMeasurementSession(source,getComputedStyle(source),'oak');
  const a=make(),b=make();const value='oak-🪑...oak.pdf';
  const initial=a.verifyText(value);b.verifyText(value);const detachedRoot=document.body.lastElementChild;detachedRoot.remove();
  const c=make();const fresh=c.verifyText(value);c.dispose();const repaired=a.verifyText(value);
  b.dispose();await new Promise(resolve=>setTimeout(resolve,0));
  const afterOldCleanup=a.verifyText(value);const replacement=document.body.lastElementChild;
  replacement.firstElementChild.remove();const repairedProbe=a.verifyText(value);
  a.dispose();c.dispose();await new Promise(resolve=>setTimeout(resolve,0));
  const lifecycle={initial,fresh,repaired,afterOldCleanup,repairedProbe};
  if(!(initial>0)||Object.values(lifecycle).some(width=>width!==initial))differences.push({lifecycle});
  return {comparisons,differences,operations,lifecycle};
 },variants);
 results.push({browser:name,...result}); console.log(JSON.stringify(results.at(-1)));if(result.differences.length)process.exitCode=1;
 }finally{await browser.close();}
}}finally{await server.close();fs.writeFileSync('/tmp/text-truncate-probe-equivalence-20261105-v2.json',JSON.stringify(results,null,2));}
