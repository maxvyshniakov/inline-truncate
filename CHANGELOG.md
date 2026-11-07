# @maxvyshniakov/text-truncate Changelog

Versions and release rules: [docs/VERSIONING.md](docs/VERSIONING.md).

## Unreleased

### Added

- Standalone synchronous callback-throughput cases cover repeated same-width
  ResizeObserver notifications for plain and emoji text, with computed-style
  counts reported separately from frame-based resize journeys.

### Fixed

- Skip repeated measured truncation for resize notifications with unchanged
  available width and typography, while preserving live style validation,
  font/DPR invalidation and recovery after a hidden interval.

## 0.2.2 - 2026-11-05

### Fixed

- Measured truncation uses a native text probe when optical sizing is disabled,
  preserves that setting with Inline Measure 0.3.0, and invalidates cached widths
  when optical sizing changes.

## 0.2.1 - 2026-11-05

### Changed

- Middle truncation measures visible edges lazily and reuses bounded,
  component-local measurements across resize updates.
- Emoji inputs verify the final Canvas-selected result instead of measuring
  every candidate in the DOM; native widths are cached and invalidated on
  font/style/query and device-pixel-ratio changes.
- Require Inline Measure `^0.3.0`, matching the version used by Data Grid.
- Add standalone browser correctness and performance commands, with reproducible
  baseline comparisons for batches, mounting, resizing and content/style changes.

### Fixed

- Recreate highlighted text nodes when text or query changes so browsers cannot
  retain stale inline shaping through repeated resize updates.
- Measure the complete truncated string so shaping around the marker cannot
  make the selected result overflow its measured width.
- Recompute measured text after class changes and later font loads; pending
  font readiness no longer schedules a frame after unmount.
- Preserve emoji widths, numeric/font features, variation settings, word spacing and text
  transforms through a DOM measurement fallback when Canvas cannot express them.

## 0.2.0 - 2026-10-06

### Breaking

- Breaking: publish as `@maxvyshniakov/text-truncate` after the GitHub account rename. Replace the old package scope in imports and registry configuration.

## 0.1.4 - 2026-10-02

### Changed

- The README documents every `TextTruncate` prop, the `truncateText` and
  `HighlightedMatchText` exports, and that measured truncation keeps grapheme
  clusters whole.

## 0.1.3 - 2026-10-02

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
  github.com/maxvyshniakov/text-truncate. Install it by version instead of from a
  local archive; see the README.
- Depends on `@maxvyshniakov/inline-measure` `^0.1.1` from the registry instead of
  the exact version packed alongside it.

## 0.1.0 - 2026-09-17

_First versioned release, assigned retroactively on 2026-09-25; `package.json` read 0.0.0 before._

### Breaking

- Independent highlight CSS variables with standalone defaults replace Data Grid theme variables.
