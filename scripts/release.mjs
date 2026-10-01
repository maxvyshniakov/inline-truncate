// Cuts a release: moves the "## Unreleased" entries under a new
// "## x.y.z - YYYY-MM-DD" heading and sets that version in package.json.
// Policy: docs/VERSIONING.md. Publish afterwards with `bun run release:publish`.
//
//   bun run release -- minor
//   bun run release -- 0.2.0 --date=2026-10-01
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatChangelog, nextVersion, parseChangelog } from "./lib/changelog.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

export function cutRelease(changelog, { version, date }) {
  const parsed = parseChangelog(changelog);
  if (parsed.errors.length) throw new Error(`changelog is malformed:\n  ${parsed.errors.join("\n  ")}`);
  if (!parsed.unreleased.trim()) throw new Error('"## Unreleased" has no entries to release');
  return formatChangelog({
    ...parsed,
    unreleased: "",
    releases: [{ version, date, body: parsed.unreleased }, ...parsed.releases],
  });
}

function today() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(part => String(part).padStart(2, "0")).join("-");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const date = args.find(arg => arg.startsWith("--date="))?.slice("--date=".length) ?? today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date must be YYYY-MM-DD, got ${date}`);
  const level = args.find(arg => !arg.startsWith("--"));
  if (!level) {
    console.error("Usage: bun run release -- <patch|minor|major|x.y.z> [--date=YYYY-MM-DD]");
    process.exit(1);
  }

  const manifestPath = path.join(repositoryRoot, "package.json");
  const changelogPath = path.join(repositoryRoot, "CHANGELOG.md");
  const manifestText = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText);
  const version = nextVersion(manifest.version, level);
  const changelog = cutRelease(fs.readFileSync(changelogPath, "utf8"), { version, date });
  fs.writeFileSync(changelogPath, changelog);
  fs.writeFileSync(manifestPath, manifestText.replace(`"version": "${manifest.version}"`, `"version": "${version}"`));
  console.log(`${manifest.name} ${manifest.version} -> ${version} (${date})`);
  execFileSync("bun", ["install", "--frozen-lockfile"], { cwd: repositoryRoot, stdio: "inherit" });
}
