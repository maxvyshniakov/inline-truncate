// Points Git at the repository's tracked hooks (.githooks). Runs from the root
// `prepare` script on `bun install`; safe to run again. Leaves a hooksPath that
// someone set deliberately to something else, and does nothing outside a Git
// checkout or in CI.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();

if (!process.env.CI) {
  let inside = false;
  try {
    inside = git("rev-parse", "--is-inside-work-tree") === "true";
  } catch {
    // Not a Git checkout (for example an extracted archive).
  }
  if (inside) {
    let current = "";
    try {
      current = git("config", "--local", "--get", "core.hooksPath");
    } catch {
      // Unset.
    }
    if (!current) {
      git("config", "--local", "core.hooksPath", ".githooks");
      console.log("Git hooks: core.hooksPath set to .githooks (pre-push runs bun run verify).");
    } else if (current !== ".githooks") {
      console.warn(`Git hooks: core.hooksPath is ${current}; not replacing it. The pre-push gate lives in .githooks.`);
    }
  }
}
