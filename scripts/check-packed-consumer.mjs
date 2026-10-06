// Packs this package, installs the archive into a throwaway project outside the
// repository and checks that such a consumer can (a) import every JavaScript
// entrypoint in plain Node and (b) type-check against the shipped declarations
// under module/moduleResolution "nodenext" with skipLibCheck disabled.
//
// Usage: bun run build && node scripts/check-packed-consumer.mjs [--keep]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const keep = process.argv.includes("--keep");
const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));
const failures = [];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  return result;
}

function runtimeTarget(value) {
  if (typeof value === "string") return value;
  return value?.import ?? value?.default ?? null;
}

function exportTargets(value) {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(exportTargets);
  return [];
}

// Consumer tooling and peers use the exact versions this repository pins.
function pinned(name) {
  const version = manifest.devDependencies?.[name];
  if (!version) throw new Error(`${name} is not pinned in devDependencies`);
  return version;
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "packed-consumer-"));
try {
  if (!fs.existsSync(path.join(repositoryRoot, "dist"))) throw new Error("No dist; run `bun run build` first.");
  const packed = run("bun", ["pm", "pack", "--ignore-scripts", "--quiet", "--destination", workDir], { cwd: repositoryRoot });
  if (packed.status !== 0) throw new Error(`bun pm pack failed:\n${packed.stderr}`);
  const tarball = packed.stdout.trim().split("\n").at(-1);
  const files = new Set(run("tar", ["-tzf", tarball]).stdout.split("\n").filter(Boolean).map(entry => entry.replace(/^package\//, "")));
  console.log(`Packed ${path.basename(tarball)} (${files.size} files)`);

  for (const [subpath, value] of Object.entries(manifest.exports ?? {})) {
    for (const target of exportTargets(value)) {
      if (!files.has(target.replace(/^\.\//, ""))) failures.push(`export "${subpath}" points at ${target}, which is not in the tarball`);
    }
  }
  const testFiles = [...files].filter(file => /(^|\/)__tests__\/|\.(test|spec|stories)\.[cm]?[jt]sx?$/.test(file));
  if (testFiles.length) failures.push(`the tarball ships test files: ${testFiles.slice(0, 5).join(", ")}`);
  const packedManifest = JSON.parse(run("tar", ["-xzOf", tarball, "package/package.json"]).stdout);
  for (const field of ["dependencies", "peerDependencies"]) {
    for (const [name, range] of Object.entries(packedManifest[field] ?? {})) {
      if (String(range).startsWith("workspace:")) failures.push(`${field}.${name} is ${range} in the tarball`);
    }
  }
  if (packedManifest.private) failures.push("the packed manifest is private and cannot be published");
  if (!failures.length) console.log("  ok every export target is packed, no test files ship, the manifest is publishable");

  const consumerDir = path.join(workDir, "consumer");
  fs.mkdirSync(consumerDir);
  const peers = Object.keys(manifest.peerDependencies ?? {});
  const typePackages = ["typescript", ...peers.map(peer => `@types/${peer}`)].filter(name => manifest.devDependencies?.[name]);
  fs.writeFileSync(path.join(consumerDir, "package.json"), `${JSON.stringify({
    name: "packed-consumer",
    private: true,
    type: "module",
    dependencies: { [manifest.name]: `file:${tarball}`, ...Object.fromEntries(peers.map(peer => [peer, pinned(peer)])) },
    devDependencies: Object.fromEntries(typePackages.map(name => [name, pinned(name)])),
  }, null, 2)}\n`);
  // Dependencies on other @maxvyshniakov packages come from the private registry.
  if (fs.existsSync(path.join(repositoryRoot, "bunfig.toml"))) {
    fs.copyFileSync(path.join(repositoryRoot, "bunfig.toml"), path.join(consumerDir, "bunfig.toml"));
  }
  const install = run("bun", ["install", "--no-progress"], { cwd: consumerDir });
  if (install.status !== 0) throw new Error(`bun install failed in the consumer:\n${install.stdout}\n${install.stderr}`);
  console.log("  ok installed the archive");

  const specifiers = Object.entries(manifest.exports ?? {}).flatMap(([subpath, value]) => {
    const target = runtimeTarget(value);
    if (!target || /\.(css|json)$/.test(target)) return [];
    return [subpath === "." ? manifest.name : `${manifest.name}/${subpath.slice(2)}`];
  });
  for (const specifier of specifiers) {
    const result = run("node", ["--input-type=module", "-e", `const m = await import(${JSON.stringify(specifier)}); if (!Object.keys(m).length) throw new Error("no exports");`], { cwd: consumerDir });
    if (result.status === 0) console.log(`  ok import("${specifier}") in plain Node`);
    else failures.push(`import("${specifier}"): ${result.stderr.trim().split("\n").filter(Boolean).at(-1)}`);
  }

  fs.writeFileSync(path.join(consumerDir, "index.ts"), `${specifiers.map((specifier, index) => `import * as entry${index} from ${JSON.stringify(specifier)};`).join("\n")}\nexport const entries = [${specifiers.map((_, index) => `entry${index}`).join(", ")}];\n`);
  fs.writeFileSync(path.join(consumerDir, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: { module: "nodenext", moduleResolution: "nodenext", target: "ES2022", strict: true, noEmit: true, skipLibCheck: false, lib: ["ES2023", "DOM", "DOM.Iterable"], types: [] },
    files: ["index.ts"],
  }, null, 2)}\n`);
  const typecheck = run(path.join(consumerDir, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], { cwd: consumerDir });
  if (typecheck.status === 0) console.log('  ok declarations type-check under "nodenext" without skipLibCheck');
  else failures.push(`tsc (nodenext):\n${typecheck.stdout}${typecheck.stderr}`);
} finally {
  if (keep) console.log(`Kept ${workDir}`);
  else fs.rmSync(workDir, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\nPacked consumer check failed (${failures.length}):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log("\nPacked consumer check passed.");
