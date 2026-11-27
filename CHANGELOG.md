# inline-truncate Changelog

Versions and release rules: [docs/VERSIONING.md](docs/VERSIONING.md).

## Unreleased

### Fixed

- Plain Canvas-only measured roots (without a DOM-verified highlight) keep `overflow: hidden` instead of
  `overflow: visible` with `clip-path`, and highlighted roots temporarily clip with `overflow: hidden` between a
  shrinking resize or font change and the next measurement commit so unverified or stale strings never add to an
  ancestor's scroll size.
- Resuming measurement for the same text, mode, query, and ellipsis (e.g. `middle` → `end` → `middle` under
  `strategy="auto"`) keeps the held cut until the next frame remeasures instead of flashing one frame of clipped text
  without an ellipsis.
- `middle` mode no longer wraps a cut in `<bdi>` when `prefixEnd` is `0`; `<bdi>` isolation applies only to
  `ellipsis="start"` and end-mode cuts that keep the end.
- Clarification to 0.6.0: skipping DOM verification when Canvas puts fitting non-emoji text more than a few pixels
  inside the box (`FIT_MARGIN`) applies to every measured mode (`middle`, `strategy="measure"`, and auto `end`).

## 0.6.1 - 2026-11-27

### Fixed

- Measured `<TextTruncate>` instances that remeasure on device-pixel-ratio changes (highlighted matches, emoji, and
  DOM-measured styles) now share one `window.matchMedia` listener per window instead of registering one per instance,
  and highlighted instances avoid redundant match scans across mount and device-pixel-ratio updates (inline-truncate#9).

## 0.6.0 - 2026-11-24

### Changed

- Depends on `inline-measure` `^0.5.1` (was `^0.5.0`); 0.5.1 changes only its release tooling.
- Depends on `cn` `^0.5.2` (was `^0.4.0`), which needs Node 22 or later and groups the legacy
  `bg-gradient-to-*` utilities with `bg-color` when merging a `className`. Applications that install `cn` `^0.4`
  themselves get a second copy until they move to `^0.5`.
- Rendering changes for consumers that pass `query` with `mode="end"`: under `strategy="auto"` (the default), end
  mode now measures whenever `query` matches the text, as `middle` does, instead of using CSS `text-overflow`. A match
  the cut hides or splits highlights the marker (`data-slot="highlighted-match"` with `data-truncate-marker`): dark
  dots on the highlight background, the box around the dots. The browser's own ellipsis could not take the highlight:
  a clipped match painted a highlight box after, or half under, dots in the text colour (inline-truncate#8). Such a
  root reports `data-truncate-strategy="measure"`, sets `data-truncate-state="truncated"` while cut and holds the
  visible string and the hidden full-text copy described under Accessibility. Until its first measurement (the
  server's HTML, the frame after the query starts matching) it renders as CSS does, ellipsis included. Text that fits
  renders whole as before; when Canvas puts it more than a few pixels inside the box, it is not verified in the DOM.
  End mode without a query, or with one that does not match, keeps CSS and measures nothing.
  Measured on 50 matching components that overflow (2026-11-24): 53 Canvas calls, 200 DOM reads and 150 style reads
  where CSS made none; on 50 that fit, 50 Canvas calls, 100 DOM reads and 100 style reads, and one more React commit
  as the CSS look gives way. Mount medians stay at the frame floor in Chromium, Firefox and WebKit.
- With `ellipsis="start"` and a matching `query` (or `strategy="measure"`, which ignored the prop before), end mode
  measures as above with the ellipsis first, as CSS draws it: the root keeps `[direction:rtl]` and `data-tip-align="end"`,
  and the visible string sits in a `bdi` inside `[data-truncate-visible]`. Measured, such a root has no
  `data-truncate-overflow-target`: once cut, `data-truncate-state="truncated"` says so; before its first measurement it
  has the CSS root's `data-truncate-overflow-target=":scope > bdi"`. Measured `middle` still ignores the prop.
- Measured end mode cuts the side CSS `text-overflow` cuts for the same text: the line keeps its start edge. Text in
  the line's direction keeps its start, as before. Text in the other direction keeps its end, with the dots on the
  line's end side, in a `bdi`: Arabic or Hebrew text in a left-to-right line kept its start under `strategy="measure"`,
  where CSS keeps its end, and with `ellipsis="start"` Latin text and numbers keep their end, right-to-left text its
  start. The direction is the text's first letter's, as `dir="auto"` reads it.
- A measured root clips paint, not layout: `overflow-visible [clip-path:inset(0_-1px)]` replaces `overflow-hidden`,
  so a highlight decoration that paints 1px past its glyphs, as Data Grid's `box-shadow` does, keeps that pixel and
  its rounded corners at the text's first and last character and next to the marker, where the clip cut it flat
  (data-grid#148). The root's box, what Inline Measure reports for it, its scroll sizes and how a `className` merges
  do not change. An ancestor that clips flush with the root still clips the pixel. A root whose text is not cut yet in
  `middle` mode, or that shows the marker alone in a box narrower than it, keeps `overflow-hidden`.

### Fixed

- Correction to 0.5.0: the old scoped `@maxvyshniakov/text-truncate` is not deprecated on npmjs.org;
  it never existed there and lives only in the private GitHub Packages registry, at 0.4.1.

## 0.5.1 - 2026-11-24

### Changed

- The package metadata names the renamed repository, `github.com/maxvyshniakov/inline-truncate`, and gains
  `homepage` and `bugs` links.

### Fixed

- `query` matches the Greek final sigma: `ς` and `σ` match as one letter, so `οδος` finds `ΟΔΟΣ` and `ΟΔΟΣ` finds
  `οδος`. Matching lowercases code point by code point, which always turned `Σ` into `σ` and missed a typed `ς`.
- A non-ASCII `query` whose lowercase is ASCII now matches ASCII text, as the lowercase rule says: the Kelvin sign
  `K` (U+212A) finds `k` and `K`. Every such match was dropped.
- Text with a matching `query`, and text whose style Canvas cannot express (numeric or font features, disabled optical
  sizing, word spacing, text transforms), is measured again when the device pixel ratio changes, as emoji text already
  was: its widths come from the DOM, and moving the window to another display could keep a cut that no longer fit.
- After a text change, until the next frame measures it, a previous result that fit no longer counts as truncated:
  for that frame the root set `data-truncate-state="truncated"` and rendered the hidden full-text copy although
  nothing was cut, so hosts reading the state (tooltips) saw a false truncation. It now shows the new text whole. The
  same holds when measuring resumes after the CSS strategy took over (also a `mode` switch under `strategy="auto"`):
  the cut from before is dropped instead of flashing for a frame.

## 0.5.0 - 2026-11-24

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
  Text that fits and the CSS strategy highlight as before. A highlighted cut is measured as drawn (see Fixed), so with
  a match or the marker highlighted it can keep one grapheme less than before.
- The package entry no longer starts with `"use client"`; only the `TextTruncate` module does. React Server
  Components can now call `truncateText` and `splitTextGraphemes` and render `HighlightedMatchText` from
  `inline-truncate`, and `TextTruncate` stays a client component.
- The package declares `"sideEffects": false`, so a bundle that imports only `truncateText` or `splitTextGraphemes`
  leaves out the component, Inline Measure and React: with Vite 8, minified, about 62 kB becomes 5 kB and 0.5 kB.

### Removed

- The package no longer ships source maps (`dist/*.js.map`, `dist/*.d.ts.map`). They named `src/` files the package
  does not include, so they never resolved; the archive shrinks from about 34 kB to 22 kB.

### Fixed

- In WebKit, measured text with a highlighted match could paint up to 1.4px wider than its box and lose the end of
  its last glyph: Canvas measured the plain string, and WebKit shapes each side of a highlight span apart. When the
  query matches, the final string is now verified in the DOM as drawn, as emoji text already was. With a query, that
  is one cached DOM measurement per component and update.
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
