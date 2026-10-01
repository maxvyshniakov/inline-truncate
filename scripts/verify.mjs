// The repository's gate: the one command that decides whether a commit may be
// pushed. CI and the pre-push hook run exactly this.
//
//   bun run verify                  changelog, build, packed consumer, lint, tests and types
//   bun run verify -- --release     also require an empty "## Unreleased" (main)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

export function verifySteps({ release = false } = {}) {
  return [
    ["changelog", ["run", "check:changelogs", ...(release ? ["--", "--release"] : [])]],
    ["build", ["run", "build"]],
    ["packed consumer", ["run", "check:consumer"]],
    ["lint", ["run", "lint"]],
    ["test", ["run", "test"]],
    ["typecheck", ["run", "typecheck"]],
  ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const steps = verifySteps({ release: process.argv.includes("--release") });
  const started = Date.now();
  const results = [];
  for (const [name, command] of steps) {
    const stepStarted = Date.now();
    const { status } = spawnSync("bun", command, { cwd: repositoryRoot, stdio: "inherit" });
    results.push({ name, passed: status === 0, seconds: (Date.now() - stepStarted) / 1000 });
    if (status !== 0) break;
  }
  console.log("\nverify:");
  for (const { name, passed, seconds } of results) console.log(`  ${passed ? "ok  " : "FAIL"} ${name} (${seconds.toFixed(1)}s)`);
  for (const [name] of steps.slice(results.length)) console.log(`  skip ${name}`);
  const passed = results.length === steps.length && results.every(result => result.passed);
  console.log(`${passed ? "Passed" : "Failed"} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  process.exit(passed ? 0 : 1);
}
