# Text Truncate

React text truncation and search highlighting. It depends on Inline Measure and
must not require Sid-Kit or Data Grid CSS. Application labels, routes and
fetching stay outside the package.

The package is published to npmjs.org as `inline-truncate` (public access, trusted
publishing from `.github/workflows/release-npm.yml`) as part of a release (docs/VERSIONING.md).
Every dependency comes from npmjs.org, so installing needs no token. Changing the repository's
visibility, a first publication to npmjs.org or enabling Pages needs explicit authorization.

Behavior changes need focused tests. Public contracts need matching README and
changelog entries under `## Unreleased`; cut them into a version with
`bun run release -- <patch|minor|major>` right before pushing to main.
All default examples and documentation use English.

- Pushing, CI, releases and publishing: [docs/agents/publishing.md](docs/agents/publishing.md).
- Checks, the `bun run verify` gate and pins: [docs/agents/checks.md](docs/agents/checks.md).
- The gate, the pre-push hook, release and publish come from `@maxvyshniakov/package-kit`; this repository declares
  its verify steps and publish target in `package-kit.config.mjs`.
