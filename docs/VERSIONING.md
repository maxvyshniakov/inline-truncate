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
GITHUB_TOKEN=$(gh auth token) bun run release:publish
```

It refuses to publish from anything but a clean `main` that matches
`origin/main` with an empty `## Unreleased`, then runs `bun publish` (which
builds first) and pushes a `v<version>` tag. The token needs `write:packages`;
`gh auth refresh -h github.com -s read:packages,write:packages` adds it.

After publication and tag creation, the same command requests Data Grid's
**Update catalog dependencies** workflow. Its catalog and package dependencies
advance together only after Data Grid tests and every Storybook render/axe check
pass. Stable incompatible versions are included; Data Grid cuts and publishes
its own release when adopting them.

The publishing token needs access to Data Grid with Actions write permission
for the immediate notification. No additional cross-repository secret is stored.
If notification fails (including a repository-scoped Actions token), publication
still succeeds and Data Grid's daily registry check discovers the release.
Retry only the notification with `node scripts/notify-data-grid.mjs`; do not
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
