import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runScript } from "./all.mjs";

const ALL_MODULE_URL = new URL("./all.mjs", import.meta.url).href;

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function waitForFile(file, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, "utf8").trim();
      if (content) return content;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${file}`);
}

async function waitUntilDead(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Process ${pid} still alive after ${timeoutMs}ms`);
}

test("runScript resolves false when spawn emits an error", async () => {
  const ok = await runScript("/nonexistent/binary/for-a11y-all-test", [], { timeoutMs: 2000 });
  assert.equal(ok, false);
});

test("runScript kills the detached process group on timeout", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a11y-timeout-"));
  const pidFile = path.join(tmpDir, "pids.txt");
  const childScript = path.join(tmpDir, "hang.mjs");
  fs.writeFileSync(
    childScript,
    `
import { spawn } from "node:child_process";
import fs from "node:fs";
const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
fs.writeFileSync(${JSON.stringify(pidFile)}, process.pid + " " + grandchild.pid);
setInterval(() => {}, 1000);
`,
  );
  try {
    const ok = await runScript(process.execPath, [childScript], { timeoutMs: 250 });
    assert.equal(ok, false);
    const [childPid, grandchildPid] = (await waitForFile(pidFile)).split(" ").map(Number);
    await waitUntilDead(childPid);
    await waitUntilDead(grandchildPid);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("runAll forwards SIGTERM to the detached child process group and exits", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a11y-signal-"));
  const pidFile = path.join(tmpDir, "pids.txt");
  const childScript = path.join(tmpDir, "hang.mjs");
  const runnerScript = path.join(tmpDir, "runner.mjs");
  fs.writeFileSync(
    childScript,
    `
import { spawn } from "node:child_process";
import fs from "node:fs";
const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
fs.writeFileSync(${JSON.stringify(pidFile)}, process.pid + " " + grandchild.pid);
setInterval(() => {}, 1000);
`,
  );
  fs.writeFileSync(
    runnerScript,
    `
import { runAll } from ${JSON.stringify(ALL_MODULE_URL)};
await runAll({ engines: ["chromium"], scripts: [${JSON.stringify(childScript)}], timeoutMs: 30_000 });
`,
  );
  try {
    const runner = spawn(process.execPath, [runnerScript], {
      cwd: path.dirname(fileURLToPath(import.meta.url)),
      stdio: "ignore",
    });
    const exitPromise = new Promise((resolve) => {
      runner.on("exit", (code, signal) => resolve({ code, signal }));
    });
    const [childPid, grandchildPid] = (await waitForFile(pidFile)).split(" ").map(Number);
    assert.equal(isAlive(childPid), true);
    assert.equal(isAlive(grandchildPid), true);

    runner.kill("SIGTERM");
    const result = await exitPromise;
    assert.equal(result.code, 128 + os.constants.signals.SIGTERM);
    await waitUntilDead(childPid);
    await waitUntilDead(grandchildPid);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
