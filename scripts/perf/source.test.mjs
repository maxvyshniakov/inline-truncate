import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {productionSnapshot} from "./source.mjs";
test("a reference capture uses its whole production tree, including historical helpers",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"truncate-ref-"));
  const git=(...args)=>execFileSync("git",args,{cwd:root,stdio:"pipe"});
  try {
    fs.mkdirSync(path.join(root,"src/nested"),{recursive:true});
    fs.writeFileSync(path.join(root,"src/index.tsx"),'import {width} from "./nested/measure.js"; export {width};');
    fs.writeFileSync(path.join(root,"src/nested/measure.ts"),"export const width=17;");
    fs.writeFileSync(path.join(root,"src/index.test.tsx"),"excluded test");
    git("init","--quiet");git("config","user.name","Fixture");git("config","user.email","fixture@example.invalid");git("add","src");git("-c","core.hooksPath=/dev/null","commit","-qm","baseline");
    fs.rmSync(path.join(root,"src/nested/measure.ts"));
    fs.writeFileSync(path.join(root,"src/index.tsx"),"export const width=99;");
    const historical=productionSnapshot(root,"HEAD");
    assert.equal(historical.get("src/nested/measure.ts")?.toString(),"export const width=17;");
    assert.equal(historical.has("src/index.test.tsx"),false);
    assert.match(historical.get("src/index.tsx").toString(),/nested\/measure\.js/);
    assert.equal(productionSnapshot(root).get("src/index.tsx").toString(),"export const width=99;");
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
