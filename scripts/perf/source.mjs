import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const isProduction = file => !file.includes(".test.") && !file.includes("/__tests__/") && !file.endsWith("/test-setup.ts");
export function productionSnapshot(root, ref) {
  const files = ref
    ? execFileSync("git",["ls-tree","-rz","--name-only",ref,"src"],{cwd:root}).toString().split("\0").filter(Boolean)
    : fs.readdirSync(path.join(root,"src"),{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile()).map(entry=>path.relative(root,path.join(entry.parentPath,entry.name)));
  return new Map(files.filter(isProduction).sort().map(file=>[file,ref
    ? execFileSync("git",["show",`${ref}:${file}`],{cwd:root})
    : fs.readFileSync(path.join(root,file))]));
}
export function referenceModulePath(id, importer, productionRoot, snapshotRoot) {
  const resolved = id.startsWith(".") && importer ? path.resolve(path.dirname(importer),id) : path.isAbsolute(id) ? id : null;
  return resolved?.startsWith(productionRoot + path.sep) ? path.join(snapshotRoot,path.relative(productionRoot,resolved)) : undefined;
}
