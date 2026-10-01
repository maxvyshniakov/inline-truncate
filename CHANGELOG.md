# @skipstery/text-truncate Changelog

Versions and release rules: [docs/VERSIONING.md](docs/VERSIONING.md).

## Unreleased

### Changed

- Update `tailwind-merge` to 3.7.0. Classes passed to `TextTruncate` through
  `className` merge more precisely in a few edge cases, for example `px-*` now
  overrides an earlier `ps-*`/`pe-*`.

## 0.1.1 - 2026-10-01

### Changed

- Published to the private GitHub Packages registry from its own repository,
  github.com/skipstery/text-truncate. Install it by version instead of from a
  local archive; see the README.
- Depends on `@skipstery/inline-measure` `^0.1.1` from the registry instead of
  the exact version packed alongside it.

## 0.1.0 - 2026-09-17

_First versioned release, assigned retroactively on 2026-09-25; `package.json` read 0.0.0 before._

### Breaking

- Independent highlight CSS variables with standalone defaults replace Data Grid theme variables.
