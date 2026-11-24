# Versions, changelog and publishing

The package owns its version and its `CHANGELOG.md`, and is published to
npmjs.org as `inline-truncate`, with public access.

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
   - **minor** for a breaking change (put it under `### Breaking`, start it with
     `Breaking:`, and give it an indented `No transition period: <why>` line, which
     `bun run check:changelogs` requires there; a `Breaking:` entry under another
     heading escapes that check) and for a new entrypoint or broad default-behavior
     change;
   - **patch** for fixes and compatible additions.

   After `1.0.0`, breaking changes take a major version.
4. Depend on sibling packages (`inline-measure`, `cn`) with `^x.y.z` ranges, so applications
   install one copy of each. Raise the floor when this package starts to need a
   newer version, and release this package with an entry saying so.
5. Keep entries consumer-facing: what changed for users of the package and what
   they must do, not which internal files moved.

## Publishing

After the release commit is on `origin/main`:

```sh
gh workflow run release-npm.yml --ref main
```

`.github/workflows/release-npm.yml` publishes from GitHub Actions with npm trusted
publishing (an OIDC token, no stored npm token) and, from a public repository, a
provenance attestation. `package-kit.config.mjs` sets
`publish: { registry: "npm", access: "public" }`. The workflow:

1. runs package-kit's `verify.yml` (`bun run verify -- --release`) as its `check` job;
2. in its `publish` job, the only one granted `id-token: write`, runs `bun run release:publish`
   (`package-kit publish`), which checks that HEAD is `origin/main` by SHA, the tree is clean,
   `## Unreleased` is empty and the tag is new; packs one archive and runs the packed-consumer check on it;
   publishes it with `npm publish --access public --provenance`; waits until npmjs.org serves the version with
   the archive's integrity; and pushes a `v<version>` tag.

`bun run release:publish` outside Actions refuses and names the workflow. If the tag push fails
after publication, rerun the workflow; `package-kit publish --resume` finishes it without
republishing. npmjs.org trusts the workflow file once, the owner's step:
`npm trust github inline-truncate --file release-npm.yml --repo maxvyshniakov/inline-truncate --allow-publish`.

0.5.0, the first version under this name, was published by the owner from their machine
(`npm publish --access public`, no provenance, tag pushed by hand). npmjs.org then holds the trusted
publisher as "Pending validation" until one publication from `release-npm.yml`. The `0.0.0-stage` version
npmjs.org shows is its own placeholder for a trusted publisher set up on the website for a new name;
publishing that version is refused.

After publication and tag creation, the same command requests Data Grid's
**Update catalog dependencies** workflow. Its catalog and package dependencies
advance together only after Data Grid tests and every Storybook render/axe check
pass. Stable incompatible versions are included; Data Grid cuts and publishes
its own release when adopting them.

The workflow token cannot dispatch another repository's workflow, so the
notification usually warns from Actions. Publication still succeeds and Data
Grid's daily registry check discovers the release. Retry only the notification
locally with `bunx package-kit notify`; do not republish an existing version.
Failed Data Grid checks leave its main and live catalog unchanged and appear in
its workflow log.

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
