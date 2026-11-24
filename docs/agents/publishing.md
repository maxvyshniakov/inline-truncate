# Publishing

## Branches
- Everyday destination: `dev`. Release destination: `main`.
- `main` only receives a SHA that `dev` receives in the same push, so `origin/main` stays an ancestor of `origin/dev`.
- Base branch for cleanup: `dev`.

## Gate
- The pre-push hook (`.githooks/pre-push`, written by `package-kit hooks sync`) runs `bun run verify` on each pushed
  commit in a clean temporary worktree, `bun run verify -- --release` for `main`. Do not run it by hand first.
- Every dependency comes from npmjs.org, so the hook's installs need no token.
- The hook holds one slotfather slot for the installs and every verification.

## Push
- `dev`: `sha=$(git rev-parse HEAD)`, then `lanefather promote "$sha"`. Push a SHA, never `HEAD` or a branch by name.
- `dev` and `main`: `lanefather promote "$sha" --ship`.
- promote takes the landing lock that `.githooks/reference-transaction` requires of agent sessions, pushes the SHA and
  fast-forwards the local branches. Never use a bare `git push` to `dev` or `main`, and never force-push.
- Landing a task branch: rebase onto `origin/dev`, push the tip.
- Standing permission (owner, 2026-11-24): an orchestrator pushes a green batch with every review resolved to `dev`
  without asking, and reports it in one line. `main`, a release and a publication to npmjs.org each
  need the owner's command; the release guard (`MASTACK_RELEASE_OK`) refuses agents without it.

## CI
- `.github/workflows/check.yml` ("Library checks") runs on `main` pushes, pull requests and `workflow_dispatch`, on a
  GitHub-hosted `ubuntu-latest` runner. Nothing runs for `dev`. Never name a self-hosted runner in a workflow: the
  repository is meant to be public, where a pull request from a fork chooses the code a runner executes.
- It calls package-kit's reusable `verify.yml`: job `check / verify`, `bun run verify`, with `--release` for `main` and
  pull requests into `main`. A manual run on `dev` or a branch runs without it, so Unreleased entries pass.
- Find the run: `gh run list --workflow check.yml --commit <sha>`.
- A push to `dev` is finished when the hook passed and `git ls-remote origin dev` shows the SHA. A push to `main` is
  finished when Library checks has a final result on it.

## Release
- Rules: [docs/VERSIONING.md](../VERSIONING.md). Cut right before pushing to `main`: `bun run release -- <patch|minor|major>`.
- Publish from GitHub Actions, after the release commit is on `origin/main`:
  `gh workflow run release-npm.yml --ref main`. Its `check` job runs `verify --release`; its `publish` job (the only
  one with `id-token: write`) publishes to npmjs.org with trusted publishing and provenance, tags `v<version>`, then
  requests Data Grid's catalog dependency workflow.
- `bun run release:publish` outside Actions refuses and names that command.
- npmjs.org trusts `release-npm.yml` once, the owner's step:
  `npm trust github inline-truncate --file release-npm.yml --repo maxvyshniakov/inline-truncate --allow-publish`.
- First publication, as it happened for 0.5.0: the owner published from their machine
  (`npm publish --access public`, no provenance) and pushed the tag by hand. A version `0.0.0-stage` is not a
  placeholder to publish (the registry refuses it); npmjs.org creates it when a trusted publisher is set up for a
  new name on the website. That publisher stays "Pending validation" until one publication from `release-npm.yml`;
  for inline-truncate that must happen before 2026-11-26 05:41 UTC.
- Data Grid adopts the release through its catalog dependency workflow, under the standing approval to release Data Grid
  when every check passes (maxvyshniakov/data-grid docs/CATALOG-DEPENDENCIES.md).

## After publish
- `npm view inline-truncate version` names the new version; `git ls-remote --tags origin v<version>` shows
  the tag.
- The old name, `@maxvyshniakov/text-truncate` (up to 0.4.1), lives only in the private GitHub Packages registry; it
  never existed on npmjs.org, so there is nothing to `npm deprecate`, and GitHub Packages has no deprecation.
- The Data Grid request only warns on failure (the workflow token cannot dispatch another repository's workflow); retry
  it locally with `bunx package-kit notify`.

## Report
- The pushed SHA per branch; for `main`, the Library checks run link and result; for a release, the published version,
  the tag and the release-npm run link.
