// Git pre-push hook (installed by scripts/install-git-hooks.mjs on
// `bun install`). Runs `bun run verify` on each commit being pushed, in a
// clean temporary worktree, so uncommitted files cannot make it pass. A push to
// main runs `verify --release`. Skip once with `git push --no-verify`.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ZERO = /^0+$/;
const RELEASE_REF = "refs/heads/main";

/** Git passes "<local ref> <local sha> <remote ref> <remote sha>" per line. */
export function commitsToVerify(stdin) {
  const commits = new Map();
  for (const line of stdin.split("\n")) {
    const [localRef, localSha, remoteRef] = line.trim().split(/\s+/);
    if (!localSha || ZERO.test(localSha)) continue; // deleting a ref
    if (localRef.startsWith("refs/tags/") || remoteRef?.startsWith("refs/tags/")) continue;
    const release = remoteRef === RELEASE_REF;
    commits.set(localSha, (commits.get(localSha) ?? false) || release);
  }
  return [...commits].map(([sha, release]) => ({ sha, release }));
}

// Hooks run with GIT_DIR and friends pointing at this checkout; commands in
// the temporary worktree must resolve their own.
function cleanEnvironment() {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|PREFIX|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|QUARANTINE_PATH)$/.test(name)) {
      delete env[name];
    }
  }
  return env;
}

function verifiedRecord(gitDir) {
  return path.join(gitDir, "verified-commits");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = cleanEnvironment();
  const git = (...args) => execFileSync("git", args, { encoding: "utf8", env }).trim();
  const commits = commitsToVerify(fs.readFileSync(0, "utf8"));
  const gitDir = git("rev-parse", "--git-common-dir");
  const record = verifiedRecord(path.resolve(gitDir));
  const verified = new Set(fs.existsSync(record) ? fs.readFileSync(record, "utf8").split("\n") : []);

  for (const { sha, release } of commits) {
    const key = `${sha}${release ? " release" : ""}`;
    if (verified.has(key)) {
      console.log(`pre-push: ${sha.slice(0, 10)} already passed bun run verify${release ? " --release" : ""}`);
      continue;
    }
    const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "pre-push-"));
    console.log(`pre-push: bun run verify${release ? " -- --release" : ""} on ${sha.slice(0, 10)} in ${worktree}`);
    console.log("pre-push: skip once with git push --no-verify");
    let passed = false;
    try {
      git("worktree", "add", "--detach", worktree, sha);
      if (!fs.existsSync(path.join(worktree, "scripts/verify.mjs"))) {
        console.log(`pre-push: ${sha.slice(0, 10)} predates scripts/verify.mjs; nothing to run`);
        passed = true;
      } else {
        const run = (command, args) => spawnSync(command, args, { cwd: worktree, stdio: "inherit", env }).status === 0;
        passed = run("bun", ["install", "--frozen-lockfile"])
          && run("node", ["scripts/verify.mjs", ...(release ? ["--release"] : [])]);
      }
    } finally {
      spawnSync("git", ["worktree", "remove", "--force", worktree], { env, stdio: "ignore" });
      fs.rmSync(worktree, { recursive: true, force: true });
    }
    if (!passed) {
      console.error(`\npre-push: bun run verify failed on ${sha.slice(0, 10)}; nothing was pushed.`);
      process.exit(1);
    }
    fs.appendFileSync(record, `${key}\n`);
  }
}
