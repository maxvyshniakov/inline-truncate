// Checks CHANGELOG.md against docs/VERSIONING.md.
//
//   bun run check:changelogs              format, and package.json version = newest release
//   bun run check:changelogs -- --release also require an empty "## Unreleased"
//
// CI runs the --release form: a change reaches main only after its entries
// were cut into a version with `bun run release`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseChangelog } from "./lib/changelog.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

export function changelogIssues({ name, version, changelog }, { release = false } = {}) {
  if (changelog === undefined) return ["missing CHANGELOG.md"];
  const parsed = parseChangelog(changelog);
  const issues = [...parsed.errors];
  if (parsed.title && parsed.title !== `${name} Changelog`) {
    issues.push(`title must be "# ${name} Changelog"`);
  }
  const newest = parsed.releases[0];
  if (!newest) issues.push("no released version");
  else if (newest.version !== version) {
    issues.push(`package.json version ${version} does not match the newest changelog release ${newest.version}`);
  }
  if (release && parsed.unreleased.trim()) {
    issues.push('"## Unreleased" has entries; cut them into a version with `bun run release`');
  }
  return issues;
}

export function rootPackage(root = repositoryRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const changelogPath = path.join(root, "CHANGELOG.md");
  return {
    name: manifest.name,
    version: manifest.version,
    changelog: fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, "utf8") : undefined,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = rootPackage();
  const issues = changelogIssues(pkg, { release: process.argv.includes("--release") });
  if (issues.length) {
    console.error(`FAIL ${pkg.name}@${pkg.version}`);
    for (const issue of issues) console.error(`  ${issue}`);
    console.error("\nSee docs/VERSIONING.md.");
    process.exit(1);
  }
  console.log(`ok   ${pkg.name}@${pkg.version}`);
}
