# @skipstery/text-truncate Changelog

Versions and release rules: [docs/VERSIONING.md](docs/VERSIONING.md).

## Unreleased

### Changed

- `cn` is a caret range (`^0.4.0`) instead of an exact version, so an app
  that also depends on it, as Sid-Kit and Data Grid do, can share one copy
  with Text Truncate. The range starts at the version Text Truncate is tested
  with.

## 0.1.2 - 2026-10-02

### Changed

- Merge class names with [`cn`](https://github.com/shadcn-ui/cn) 0.4.0, the
  engine Sid-Kit and Data Grid use, instead of `clsx` and `tailwind-merge`,
  which leave the dependencies. Classes passed to `TextTruncate` through
  `className` merge more precisely in a few edge cases: a later `px-*` removes
  earlier `ps-*` and `pe-*`, with the same physical/logical-axis rule for
  margins, insets, borders and scroll spacing, and `max-h-none`,
  `shadow-inner`, `columns-auto` and `bg-conic` now replace their group.
  Legacy `bg-gradient-to-*` classes remain alongside background colors.

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
