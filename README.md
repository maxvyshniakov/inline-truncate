# inline-truncate

React text truncation and search highlighting. Depends on Inline Measure, not Sid-Kit or Data Grid.

```tsx
import { TextTruncate } from "inline-truncate";

<TextTruncate text="Quarterly-design-review.pdf" mode="middle" query="design" />
```

`TextTruncate` renders a block `span` that fills its container, so give the
container a constrained width.

| Prop | Default | Meaning |
| --- | --- | --- |
| `text` | required | The full string. |
| `mode` | required | `"end"` keeps the start of the text; `"middle"` keeps both ends. |
| `strategy` | `"auto"` | `"css"` truncates with CSS `text-overflow`. `"measure"` measures the text with Inline Measure and shortens the string, again after a resize or once fonts load. `"auto"` measures for `middle` and uses CSS for `end`. |
| `ellipsis` | `"end"` | `"start"` puts the ellipsis first and keeps the end of the text visible. CSS strategy only. |
| `query` | none | Highlights every case-insensitive match in the full text. When measured truncation cuts the string, a match's visible part is highlighted in place and a match in the cut part highlights the marker. |
| `className` | none | Merged onto the root `span`. |
| `measureExtra` | none | Written to `data-truncate-measure-extra` for hosts that measure the cell, such as Data Grid auto-fit. |

Measured truncation never splits a grapheme cluster such as an emoji or a letter with a
combining mark. The package also exports `truncateText`, which truncates with
any `measureText` callback, `HighlightedMatchText`, which highlights without
truncating, and `splitTextGraphemes`.

With React Server Components, `TextTruncate` is a client component (its module
starts with `"use client"`), while `truncateText`, `splitTextGraphemes` and
`HighlightedMatchText` are server-safe: a server component can call or render them
through the same `inline-truncate` import.

Matches are found once, in the full text; the cut string only renders them. A
match that straddles the cut highlights its visible end and the marker, and the
query never matches text that exists only where the two visible ends join. The
highlighted marker is a `span` with `data-slot="highlighted-match"` and
`data-truncate-marker`, styled like any match. Highlight spans can paint wider
than the plain string (WebKit shapes each side of a span apart), so when the query
matches, the result is measured as drawn: a DOM probe renders the highlighted
string the way the component does, after Canvas selects the cut or in place of
Canvas for the styles listed below. A highlighted match or marker can therefore
make the cut one grapheme shorter than without a query.

Matching is case-insensitive by the Unicode lowercase mapping, the same in every
locale and without case folding: `STRAẞE` matches `Straße` but `strasse` does not,
and `izmir` does not match `İZMİR`. The Greek final sigma `ς` and `σ` match as one
letter, so `οδος` matches `ΟΔΟΣ`. The query is literal text, not a pattern.
Offsets always refer to the original string, and a match never splits a
user-perceived character: `e` does not match the `é` written as `e` plus a
combining accent, and `👩` does not match inside `👨‍👩‍👧`.

Highlight colors use `--text-truncate-highlight-background` and
`--text-truncate-highlight-foreground`, with amber and current-text defaults.
Hosts can override those variables; Data Grid maps them to its search-match
colors.

Measured truncation checks the complete result, including the marker, so font
kerning at the cut is included. Query highlights recreate their decorated text nodes when the
text or query changes, avoiding stale inline shaping during repeated resizes.
Highlight customization is intended for colors; metric-changing host styles such
as extra padding need their own measurement policy. Middle truncation measures only the edges it
visits. Each mounted measured component reuses segmented text and a bounded
width cache across resizes, and invalidates widths after a class or font-load
change. Emoji inputs and text with a matching query select through Canvas first, then verify the complete final
string with a cached DOM measurement. At most two corrections use the observed width
discrepancy; a native predicate handles larger disagreements. CSS numeric
features, variation settings, disabled optical sizing, word spacing and text
transforms use a hidden DOM predicate when Canvas cannot express them. DOM-verified widths (emoji text,
and text with a matching query) are invalidated on font/style/query changes and resolution changes, independently of box resize. Inherited
style changes must cause a resize, font-load event, or a component class/text
change to trigger a new measurement; arbitrary ancestor style mutations are
not observed.

Repeated resize notifications skip selection and measurement-session setup when
the available content width and live typography signature match the last
completed calculation. Width and computed style are still read to detect
inherited changes. Font/DPR invalidation and component input changes force a
fresh calculation; a zero-width interval clears completion so showing the
element at its previous width truncates again.

For `truncateText`, a nonpositive width returns the original text (useful before
layout). If the width is smaller than `...`, the marker is still returned and
may be clipped by the component. The marker remains three ASCII periods.
Grapheme-safe cuts require `Intl.Segmenter`; older runtimes fall back to code
points. This package has no multiline truncation API. Use CSS `line-clamp` for
multiline clipping; Inline Measure's multiline entrypoint solves a different
problem, the minimum width for a requested number of lines.

## Accessibility

When measured truncation shortens the string, assistive technology gets the full
text, not the cut one. The root then holds two children: the visible string in a
`span` with `aria-hidden="true"` (`data-truncate-visible`), and the full text in a
visually hidden `span` (`data-truncate-full-text`) styled inline, so it needs no
host CSS. The hidden copy is `user-select: none` and `pointer-events: none`, so a
copied selection holds the visible string once and clicks, hit tests and drags land
on the visible string. Highlighted matches stay in the visible string. Text that
fits, and the CSS strategy, whose DOM already holds the full text, render the
text alone with no extra nodes; a re-measure that ends untruncated removes them.

While the text is cut, the root's `textContent` is the visible string followed by
the full text; read `data-truncate-original` for the full text. In-page find also
sees the hidden copy: a word only the cut part holds is found, invisibly, and a
word the visible string shows counts twice (`window.find` in Chromium, Firefox and WebKit).

This is a known limit of the browser's own find-in-page (Cmd+F, Ctrl+F): a page
cannot tell it which copy to count or where to paint, so it counts a visible word
twice and paints a hit in the cut part inside the hidden copy, where it cannot be
seen. The ways to stop that cost more than they give: hiding either copy from find
(`inert`) hides it from assistive technology too, and drawing the visible string as
CSS generated content takes away selection, copy and highlighted matches. Search
inside the application, through `query`, has neither problem.

`bun run check:a11y` records the accessible name, selection, clipboard and
`window.find` results in Chromium, Firefox and WebKit and fails when a truncated
element does not expose its full text. On a table of truncated cells it also fails
when the hidden copy is hit by `elementFromPoint` or a click, ends up in a
double-click, triple-click, drag or select-all selection, adds scrollable overflow,
or takes focus.

## Install

The package is published to npmjs.org; installing it needs no token or registry
configuration:

```sh
bun add inline-truncate react@^19.2.8 react-dom@^19.2.8
```

It depends on [`inline-measure`](https://www.npmjs.com/package/inline-measure),
also from npmjs.org.

The class names are Tailwind utilities, so Tailwind CSS 4 must compile them;
the package needs no design system. Scan only the package's `dist`, with a
path relative to your stylesheet:

```css
@import "tailwindcss";
@source "../node_modules/inline-truncate/dist";
```

## Development

```sh
bun install
bun run verify
```

`bun run verify` is the push gate and the command CI runs: changelog, build,
packed-consumer check, lint, tests and types. `bun install` points Git at
`.githooks`, whose pre-push hook runs it on each pushed commit. The gate, hooks, release and
publishing come from [`@maxvyshniakov/package-kit`](https://www.npmjs.com/package/@maxvyshniakov/package-kit);
releases and publishing follow [docs/VERSIONING.md](docs/VERSIONING.md).

Live examples are in the Data Grid Storybook, which renders Inline Measure and
Text Truncate demos alongside the grid.

## Correctness and performance

The standalone browser harness needs no Data Grid or Storybook build.
`bun run verify:browser` runs the correctness check and both accessibility
checks in all three engines, each with a 4-minute limit; the commands below
run one part:

```sh
bun run check:browser -- --browser=chromium
bun run check:browser -- --browser=firefox
bun run check:browser -- --browser=webkit
bun run perf:capture -- --runs=9 --output=artifacts/perf/baseline.json
bun run perf:capture -- --runs=9 --baseline=artifacts/perf/baseline.json --strict --output=artifacts/perf/candidate.json
```

The scripts reserve machine slots (`all` for timings, one for correctness).
Install browser engines with `bunx playwright install chromium webkit`; Firefox
uses the installed `moz-firefox` channel. A filtered run accepts
`--scenario=algorithm.middle`. Set `INLINE_MEASURE_SOURCE=/path/to/inline-measure`
to test its source explicitly; the default uses the installed `inline-measure` package.
Comparing different Inline Measure versions or source digests also requires
`--allow-inline-measure-change`; the report labels this as a combined experiment.
`--ref=<commit>` measures this package's committed production source with the
current harness, without checking out or modifying the working tree.

See [the measurement method and recorded results](docs/performance/README.md).
Quick behavior and operation-budget tests plus report-comparison tests run in
`bun run test`. Browser correctness and timing are separate commands, not part
of the default push gate.

## License

MIT for owner-authored code; see [LICENSE](LICENSE).
