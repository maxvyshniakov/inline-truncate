# Publishing

## Branches
- Everyday destination: `dev`. Release destination: `main`.
- `main` only receives a SHA that `dev` receives in the same push, so `origin/main` stays an ancestor of `origin/dev`.
- Base branch for cleanup: `dev`.

## Gate
- The pre-push hook (`.githooks/pre-push`, written by `repo-kit hooks sync`) runs `bun run verify` on each pushed
  commit in a clean temporary worktree, `bun run verify -- --release` for `main`. Do not run it by hand first.
- The hook installs from the private registry: `export GITHUB_TOKEN=$(gh auth token)` (read:packages). It falls back to
  `gh auth token` itself when `GITHUB_TOKEN` is unset.
- The hook holds one slotfather slot for the installs and every verification.

## Push
- `dev`: `sha=$(git rev-parse HEAD)`, then `~/straylight/tools/lane promote "$sha"`. Push a SHA, never `HEAD` or a
  branch by name.
- `dev` and `main`: `STRAYLIGHT_LANE_REVIEW_START=manual ~/straylight/tools/lane promote "$sha" --ship`.
- promote takes the landing lock that `.githooks/reference-transaction` requires of agent sessions, pushes the SHA and
  fast-forwards the local branches. Never use a bare `git push` to `dev` or `main`, and never force-push.
- Landing a task branch: rebase onto `origin/dev`, push the tip.

## CI
- `.github/workflows/check.yml` ("Library checks") runs on `main` pushes, pull requests and `workflow_dispatch`, on the
  self-hosted homelab runner (maxvyshniakov/proxmox `docs/ci-runner.md`). Nothing runs for `dev`.
- It calls repo-kit's reusable `verify.yml`: job `check / verify`, `bun run verify` behind the TLS gate, with `--release`
  for `main` and pull requests into `main`. A manual run on `dev` or a branch runs without it, so Unreleased entries pass.
- Find the run: `gh run list --workflow check.yml --commit <sha>`. A run queued for minutes means the runner is offline.
- A push to `dev` is finished when the hook passed and `git ls-remote origin dev` shows the SHA. A push to `main` is
  finished when Library checks has a final result on it.

## Release
- Rules: [docs/VERSIONING.md](../VERSIONING.md). Cut right before pushing to `main`: `bun run release -- <patch|minor|major>`.
- Publish from a clean checkout whose HEAD is `origin/main` by SHA (a worktree or detached HEAD is fine):
  `bun run release:publish`. It runs the TLS gate, waits for Library checks on that commit, publishes, tags
  `v<version>`, then requests Data Grid's catalog dependency workflow.
- The token needs `write:packages` (`gh auth refresh -s write:packages`).
- Data Grid adopts the release through its catalog dependency workflow, under the standing approval to release Data Grid
  when every check passes (maxvyshniakov/data-grid docs/CATALOG-DEPENDENCIES.md).

## After publish
- `gh api /user/packages/npm/text-truncate/versions --jq '.[0].name'` names the new version; `git ls-remote --tags
  origin v<version>` shows the tag.
- The Data Grid request only warns on failure; retry it with `bun run repo-kit notify`.

## Report
- The pushed SHA per branch; for `main`, the Library checks run link and result; for a release, the published version
  and tag.
