// bun run check:a11y: scripts/a11y/check.mjs and pointer.mjs in Chromium,
// Firefox and WebKit, one at a time, each stopped with its whole process group
// after the same limit verify.browser gives a step (package-kit.config.mjs).
// pointer.mjs once hung for 2,699 s.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BROWSER_SCRIPT_TIMEOUT, ENGINES } from "../../package-kit.config.mjs";

// A11Y_TIMEOUT_MS overrides it, to prove the limit stops a run.
const TIMEOUT_MS = Number(process.env.A11Y_TIMEOUT_MS ?? BROWSER_SCRIPT_TIMEOUT * 60_000);
export const A11Y_SCRIPTS = ["scripts/a11y/check.mjs", "scripts/a11y/pointer.mjs"];

function killProcessGroup(pid, signal) {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // already exited
  }
}

export function runScript(
  file,
  args,
  { timeoutMs = TIMEOUT_MS, label = [file, ...args].join(" "), onChild } = {},
) {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      onChild?.(null);
      resolve(ok);
    };
    const child = spawn(file, args, { stdio: "inherit", detached: true });
    onChild?.(child);
    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`${label}: timed out after ${timeoutMs / 1000}s; stopping its processes`);
      killProcessGroup(child.pid, "SIGKILL");
    }, timeoutMs);
    child.on("error", (error) => {
      console.error(`${label}: failed to start: ${error.message}`);
      finish(false);
    });
    child.on("exit", (code, signal) => {
      finish(!timedOut && code === 0 && !signal);
    });
  });
}

export async function runAll({
  engines = ENGINES,
  scripts = A11Y_SCRIPTS,
  timeoutMs = TIMEOUT_MS,
  execPath = process.execPath,
} = {}) {
  let activeChild = null;
  let interrupted = false;
  const onSignal = (signal) => {
    interrupted = true;
    killProcessGroup(activeChild?.pid, signal);
    process.exit(128 + (os.constants.signals[signal] ?? 1));
  };
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
  for (const signal of signals) process.on(signal, onSignal);
  try {
    for (const engine of engines) {
      for (const script of scripts) {
        if (interrupted) return false;
        const ok = await runScript(execPath, [script, `--browser=${engine}`], {
          timeoutMs,
          label: `${script} --browser=${engine}`,
          onChild: (child) => {
            activeChild = child;
          },
        });
        if (!ok) return false;
      }
    }
    return true;
  } finally {
    for (const signal of signals) process.off(signal, onSignal);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ok = await runAll();
  if (!ok) process.exitCode = 1;
}
