// bun run check:a11y: scripts/a11y/check.mjs and pointer.mjs in Chromium,
// Firefox and WebKit, one at a time, each stopped with its whole process group
// after the same limit verify.browser gives a step (package-kit.config.mjs).
// pointer.mjs once hung for 2,699 s.
import { spawn } from "node:child_process";

// A11Y_TIMEOUT_MS overrides it, to prove the limit stops a run.
const TIMEOUT_MS = Number(process.env.A11Y_TIMEOUT_MS ?? 4 * 60_000);

function run(script, engine) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, `--browser=${engine}`], { stdio: "inherit", detached: true });
    const timer = setTimeout(() => {
      console.error(`${script} --browser=${engine}: timed out after ${TIMEOUT_MS / 1000}s; stopping its processes`);
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
    }, TIMEOUT_MS);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve(code === 0 && !signal);
    });
  });
}

for (const engine of ["chromium", "firefox", "webkit"]) {
  for (const script of ["scripts/a11y/check.mjs", "scripts/a11y/pointer.mjs"]) {
    if (!(await run(script, engine))) {
      process.exitCode = 1;
      process.exit();
    }
  }
}
