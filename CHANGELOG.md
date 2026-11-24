# inline-truncate Changelog

Versions and release rules: [docs/VERSIONING.md](docs/VERSIONING.md).

## Unreleased

### Breaking

- Breaking: the package is renamed from `@maxvyshniakov/text-truncate` to the unscoped
  `inline-truncate` on npmjs.org, next to `inline-measure`. Replace the old name in
  `package.json`, imports and the Tailwind `@source` path. The API and the `--text-truncate-highlight-*`
  CSS variables keep their names; the behavior changes below come with the new name. The scoped package
  stays installable at 0.4.1, receives no further releases, and is marked deprecated on npmjs.org
  ("Renamed to inline-truncate") once the new name is published.
  No transition period: consumers that take the `maxvyshniakov` scope from GitHub Packages cannot install the scoped
  name from npmjs.org at all, so releasing it under both names would not reach them.

### Changed
- Measured truncation now exposes the full text to assistive technology. While the string is cut, the visible text sits
  in an `aria-hidden` span (`data-truncate-visible`) and the full text in a visually hidden span that takes no
  selection or pointer events (`data-truncate-full-text`); text that fits and the CSS strategy add no nodes. While
  cut, the root's `textContent` holds both strings back to back and its `innerText` both strings (on two lines in
  Chromium and Firefox), so tests that read a truncated cell's text, such as `toHaveTextContent` or an exact
  `getByText`, see the full text after the visible one: read `data-truncate-original` for the full text and
  `[data-truncate-visible]` for the visible string. In-page find also matches the hidden copy.
- `query` is matched against the full text instead of the visible cut string. A match the cut hides highlights the
  truncation marker (`data-slot="highlighted-match"` with `data-truncate-marker`), a match straddling the cut
  highlights its visible end and the marker, and text that exists only where the visible ends join no longer matches.
  Text that fits and the CSS strategy highlight as before. Where the cut is measured in the DOM (text with emoji, or
  styles canvas cannot express), it is measured as drawn, highlighted marker included, so with the marker or a
  straddling match highlighted it can keep one grapheme less than before; otherwise the measured cut does not change.
- The package entry no longer starts with `"use client"`; only the `TextTruncate` module does. React Server
  Components can now call `truncateText` and `splitTextGraphemes` and render `HighlightedMatchText` from
  `inline-truncate`, and `TextTruncate` stays a client component.
- The package declares `"sideEffects": false`, so a bundle that imports only `truncateText` or `splitTextGraphemes`
  leaves out the component, Inline Measure and React: with Vite 8, minified, about 62 kB becomes 5 kB and 0.5 kB.

### Removed

- The package no longer ships source maps (`dist/*.js.map`, `dist/*.d.ts.map`). They named `src/` files the package
  does not include, so they never resolved; the archive shrinks from about 34 kB to 22 kB.

### Fixed

- `query` matching keeps its place in the original text when lowercasing changes a character's length (`İ`
  lowercases to two code units, which shifted every later highlight), and a match no longer splits a user-perceived
  character: `👩` does not match inside `👨‍👩‍👧`, nor `e` the base of `e` plus a combining accent. Matching is the
  Unicode lowercase mapping in every locale, without case folding, as the README states.

## 0.4.1 - 2026-11-23

### Changed

- Updated release tooling to `@maxvyshniakov/package-kit` `1.0.1` and validated npmjs.org OIDC trusted publishing with provenance.

## 0.4.0 - 2026-11-23

### Changed

- Depends on the unscoped `inline-measure` `^0.5.0` from npmjs.org instead of
  `@maxvyshniakov/inline-measure` from GitHub Packages. Applications that install
  `@maxvyshniakov/inline-measure` themselves should move to `inline-measure`
  so they keep one copy.
- `@maxvyshniakov/text-truncate` is published to npmjs.org with public access
  (through `@maxvyshniakov/package-kit`, with trusted publishing and provenance)
  instead of GitHub Packages. Installing it needs no `GITHUB_TOKEN` and no
  `bunfig.toml` scope mapping; remove the `@maxvyshniakov` mapping to GitHub
  Packages unless another package still needs it.

## 0.3.0 - 2026-11-22

### Changed

- Replaced linear middle truncation and unguided binary end truncation with
  interpolated/galloping O(log k) search and an ASCII grapheme fast path,
  reducing measurement calls by ~85% on middle truncation and ~37% on end
  truncation while preserving grapheme boundaries and kerning checks.
- Shared a single `ResizeObserver`, `document.fonts` listener pair, and
  two-phase batched `requestAnimationFrame` scheduler across mounted
  `TextTruncate` instances, reading all layout geometry and typography before
  DOM probe or state writes and avoiding redundant `getComputedStyle` /
  `closest("[lang]")` / `cn()` / empty-query highlight overhead.
- Memoized `TextTruncate` with `React.memo` and retained observers across
  prop updates.

## 0.2.3 - 2026-11-07

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
