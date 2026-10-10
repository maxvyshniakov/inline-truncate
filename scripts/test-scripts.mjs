import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { changelogIssues, rootPackage } from "./check-changelogs.mjs";
import { nextVersion, parseChangelog } from "./lib/changelog.mjs";
import { commitsToVerify } from "./pre-push.mjs";
import { publishBlockers, registryUrl } from "./publish.mjs";
import { cutRelease } from "./release.mjs";
import { verifySteps } from "./verify.mjs";
import { notifyDataGrid } from "./notify-data-grid.mjs";

test("publication notifies only Data Grid main and a failed notification is recoverable", async () => {
  let request;
  assert.equal(await notifyDataGrid("test-token", async (url, options) => {
    request = { url, options };
    return { ok: true };
  }), true);
  assert.equal(request.url, "https://api.github.com/repos/maxvyshniakov/data-grid/actions/workflows/update-catalog-dependencies.yml/dispatches");
  assert.equal(request.options.method, "POST");
  assert.deepEqual(JSON.parse(request.options.body), { ref: "main" });
  assert.equal(await notifyDataGrid("test-token", async () => ({ ok: false, status: 403 })), false);
});

const changelog = `# @maxvyshniakov/example Changelog

Versions and release rules: [docs/VERSIONING.md](docs/VERSIONING.md).

## Unreleased

### Fixed

- Fixed a thing.

## 0.2.0 - 2026-09-20

- Second release.
`;

test("the repository's changelog matches package.json", () => {
  assert.deepEqual(changelogIssues(rootPackage()), []);
});

test("releases follow the requested level and move Unreleased entries", () => {
  assert.equal(nextVersion("0.2.0", "patch"), "0.2.1");
  assert.equal(nextVersion("0.2.0", "minor"), "0.3.0");
  const parsed = parseChangelog(cutRelease(changelog, { version: "0.2.1", date: "2026-10-01" }));
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.unreleased, "");
  assert.deepEqual(parsed.releases.map(release => release.version), ["0.2.1", "0.2.0"]);
});

test("a version mismatch and, for releases, Unreleased entries fail", () => {
  const pkg = { name: "@maxvyshniakov/example", version: "0.2.0", changelog };
  assert.deepEqual(changelogIssues(pkg), []);
  assert.match(changelogIssues({ ...pkg, version: "0.2.1" }).join("\n"), /does not match the newest changelog release 0.2.0/);
  assert.match(changelogIssues(pkg, { release: true }).join("\n"), /"## Unreleased" has entries/);
});

test("publishing requires a token, a clean pushed main, a released changelog and a new tag", () => {
  const ready = { token: "t", branch: "main", dirty: false, head: "a", upstream: "a", issues: [], tagExists: false, tag: "v0.2.0" };
  assert.deepEqual(publishBlockers(ready), []);
  assert.match(publishBlockers({ ...ready, token: undefined }).join("\n"), /GITHUB_TOKEN is not set/);
  assert.match(publishBlockers({ ...ready, branch: "feature" }).join("\n"), /publish from main/);
  assert.match(publishBlockers({ ...ready, dirty: true }).join("\n"), /uncommitted changes/);
  assert.match(publishBlockers({ ...ready, upstream: "b" }).join("\n"), /push the release commit first/);
  assert.match(publishBlockers({ ...ready, tagExists: true }).join("\n"), /v0.2.0 already exists/);
});

test("the registry check reads the scoped package from GitHub Packages", () => {
  assert.equal(registryUrl("@maxvyshniakov/inline-measure"), "https://npm.pkg.github.com/@maxvyshniakov%2finline-measure");
});

test("verify runs CI's steps, and CI runs verify --release", () => {
  assert.deepEqual(verifySteps().map(([name]) => name), ["changelog", "build", "packed consumer", "lint", "test", "typecheck"]);
  assert.deepEqual(verifySteps({ release: true })[0][1], ["run", "check:changelogs", "--", "--release"]);
  const workflow = fs.readFileSync(new URL("../.github/workflows/check.yml", import.meta.url), "utf8");
  assert.match(workflow, /- run: bun run verify -- --release\n/);
});

test("the pre-push hook verifies each pushed commit once, as a release for main", () => {
  const sha = digit => digit.repeat(40);
  const stdin = [
    `refs/heads/main ${sha("a")} refs/heads/main ${sha("0")}`,
    `refs/heads/feature ${sha("b")} refs/heads/feature ${sha("c")}`,
    `(delete) ${sha("0")} refs/heads/gone ${sha("d")}`,
    `refs/tags/v1 ${sha("e")} refs/tags/v1 ${sha("0")}`,
  ].join("\n");
  assert.deepEqual(commitsToVerify(stdin), [{ sha: sha("a"), release: true }, { sha: sha("b"), release: false }]);
});
