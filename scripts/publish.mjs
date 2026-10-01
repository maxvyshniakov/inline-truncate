// Publishes the released version to the private GitHub Packages registry and
// tags it v<version>. Run on a clean main that matches origin/main, after
// `bun run release` was pushed. GITHUB_TOKEN needs write:packages:
//
//   GITHUB_TOKEN=$(gh auth token) bun run release:publish
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { changelogIssues, rootPackage } from "./check-changelogs.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();

export function publishBlockers({ token, branch, dirty, head, upstream, issues, tagExists, tag }) {
  const blockers = [];
  if (!token) blockers.push("GITHUB_TOKEN is not set; use GITHUB_TOKEN=$(gh auth token) with the write:packages scope");
  if (branch !== "main") blockers.push(`publish from main, not ${branch || "a detached HEAD"}`);
  if (dirty) blockers.push("the working tree has uncommitted changes");
  if (head !== upstream) blockers.push("HEAD is not origin/main; push the release commit first");
  for (const issue of issues) blockers.push(`CHANGELOG.md: ${issue}`);
  if (tagExists) blockers.push(`${tag} already exists; this version was published`);
  return blockers;
}

export function registryUrl(name) {
  return `https://npm.pkg.github.com/${name.replace("/", "%2f")}`;
}

// Tag only what the registry actually serves: a misconfigured `bun publish`
// can exit 0 without publishing anything.
async function registryHasVersion(name, version, token) {
  const response = await fetch(registryUrl(name), { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return false;
  const metadata = await response.json();
  return Boolean(metadata.versions?.[version]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = rootPackage();
  const tag = `v${pkg.version}`;
  git("fetch", "--quiet", "--tags", "origin", "main");
  const blockers = publishBlockers({
    token: process.env.GITHUB_TOKEN,
    branch: git("branch", "--show-current"),
    dirty: Boolean(git("status", "--porcelain")),
    head: git("rev-parse", "HEAD"),
    upstream: git("rev-parse", "origin/main"),
    issues: changelogIssues(pkg, { release: true }),
    tagExists: Boolean(git("tag", "--list", tag)),
    tag,
  });
  if (blockers.length) {
    console.error(`Not publishing ${pkg.name}@${pkg.version}:`);
    for (const blocker of blockers) console.error(`  ${blocker}`);
    process.exit(1);
  }
  // prepack builds dist; bunfig.toml supplies the registry and token.
  execFileSync("bun", ["publish"], { cwd: repositoryRoot, stdio: "inherit" });
  if (!(await registryHasVersion(pkg.name, pkg.version, process.env.GITHUB_TOKEN))) {
    console.error(`bun publish exited cleanly, but ${registryUrl(pkg.name)} does not serve ${pkg.version}; not tagging.`);
    process.exit(1);
  }
  git("tag", "--annotate", tag, "--message", `${pkg.name} ${pkg.version}`);
  git("push", "origin", tag);
  console.log(`Published ${pkg.name}@${pkg.version} and pushed ${tag}.`);
}
