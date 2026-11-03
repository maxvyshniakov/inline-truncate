# Versions, changelog and publishing

The package owns its version and its `CHANGELOG.md`, and is published to the
private GitHub Packages registry as `@maxvyshniakov/<name>`.

## Rules

1. A change a consumer can notice adds an entry under `## Unreleased` in
   `CHANGELOG.md`, in the same change as the code. Consumer-visible means public
   API, exports, default behavior, accessibility contract, visual contract,
   packaging or dependencies. Internal refactors, tests and tooling need no entry.
2. Nothing reaches `main` with entries left under `## Unreleased`. Cut them into
   a version right before pushing:

   ```sh
   bun run release -- patch
   ```

   The script moves the entries under `## x.y.z - YYYY-MM-DD` and sets the
   version in `package.json`. `bun run verify -- --release` fails otherwise; CI
   runs it, and so does the pre-push hook for main.
3. Choose the level with semver. Before `1.0.0`:
   - **minor** for a breaking change (start its entry with `Breaking:`, or put
     it under `### Breaking`) and for a new entrypoint or broad default-behavior
     change;
   - **patch** for fixes and compatible additions.

   After `1.0.0`, breaking changes take a major version.
4. Depend on other `@maxvyshniakov` packages with `^x.y.z` ranges, so applications
   install one copy of each. Raise the floor when this package starts to need a
   newer version, and release this package with an entry saying so.
5. Keep entries consumer-facing: what changed for users of the package and what
   they must do, not which internal files moved.

## Publishing

After the release commit is on `origin/main`:

```sh
git fetch origin && bunx repo-kit release-gate origin/main
bun run release:publish
```

`repo-kit release-gate` is the local release gate (repo-kit's README, "Release gate"): it runs
`bun run verify -- --release` in a clean temporary worktree of the commit and, on a pass, records the commit
status `Library checks (local, macOS)`.

`release:publish` is `repo-kit publish` (`@maxvyshniakov/repo-kit`). In order, it:

1. runs the Bun TLS gate;
2. checks that HEAD is `origin/main` by SHA (a worktree or a detached HEAD is fine), the tree is clean,
   `## Unreleased` is empty and the tag is new;
3. requires the release gate's passed status on that commit, and refuses without one, naming the command to run;
4. runs `bun publish` (which builds first) and checks that the registry serves the version;
5. pushes a `v<version>` tag.

It uses `GITHUB_TOKEN`, or `gh auth token` when that is unset; the token needs `write:packages`
(`gh auth refresh -h github.com -s read:packages,write:packages`).
If the tag push fails after publication, it prints the recovery; `bun run release:publish -- --resume` finishes it.

Library checks in CI are advisory. One line in `repo-kit.config.mjs`, `release: { gate: "ci" }`, switches back:
step 3 then waits for Library checks on the commit and refuses when they fail.

After publication and tag creation, the same command requests Data Grid's
**Update catalog dependencies** workflow. Its catalog and package dependencies
advance together only after Data Grid tests and every Storybook render/axe check
pass. Stable incompatible versions are included; Data Grid cuts and publishes
its own release when adopting them.

The publishing token needs access to Data Grid with Actions write permission
for the immediate notification. No additional cross-repository secret is stored.
If notification fails (including a repository-scoped Actions token), publication
still succeeds and Data Grid's daily registry check discovers the release.
Retry only the notification with `bun run repo-kit notify`; do not
republish an existing version. Failed Data Grid checks leave its main and live
catalog unchanged and appear in its workflow log.

## Format

```md
# @maxvyshniakov/<package> Changelog

Versions and release rules: [docs/VERSIONING.md](docs/VERSIONING.md).

## Unreleased

## 0.2.0 - 2026-10-01

### Breaking

- Breaking: ...

### Changed

- ...
```

Sections, in this order and only when they have entries: Breaking, Added,
Changed, Deprecated, Removed, Fixed, Security. `bun run check:changelogs` checks
the layout and that `package.json` names the newest release.
