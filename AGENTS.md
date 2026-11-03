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
All default examples and documentation use English.

- Pushing, CI, releases and publishing: [docs/agents/publishing.md](docs/agents/publishing.md).
- Checks, the `bun run verify` gate and pins: [docs/agents/checks.md](docs/agents/checks.md).
- The gate, the pre-push hook, release and publish come from `@maxvyshniakov/repo-kit`; this repository declares its
  verify steps in `repo-kit.config.mjs`.
