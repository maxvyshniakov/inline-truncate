# Text Truncate

React text truncation and search highlighting. It depends on Inline Measure and
must not require Sid-Kit or Data Grid CSS. Application labels, routes and
fetching stay outside the package.

The repository and the package are private; the package is published to the private
GitHub Packages registry as part of a release (docs/VERSIONING.md). Making either
public, publishing to npm or enabling Pages needs explicit authorization.
Installing needs `GITHUB_TOKEN` with `read:packages` (`export GITHUB_TOKEN=$(gh auth token)`).

Behavior changes need focused tests. Public contracts need matching README and
changelog entries under `## Unreleased`; cut them into a version with
`bun run release -- <patch|minor|major>` right before pushing to main.
`bun run verify` is the push gate and the command CI runs; the pre-push hook runs it.
Everyday pushes go to `dev` (`git push origin HEAD:dev`), where only the pre-push hook runs. A release pushes
the same tip to both branches (`git push origin HEAD:dev HEAD:main`), so `origin/main` stays an ancestor of
`origin/dev`; Checks runs on `main` only, on the self-hosted homelab runner. Never force-push.
All default examples and documentation use English.
