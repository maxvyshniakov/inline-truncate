# @maxvyshniakov/text-truncate

React text truncation and search highlighting. Depends on Inline Measure, not Sid-Kit or Data Grid.

```tsx
import { TextTruncate } from "@maxvyshniakov/text-truncate";

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
| `query` | none | Highlights every case-insensitive match. |
| `className` | none | Merged onto the root `span`. |
| `measureExtra` | none | Written to `data-truncate-measure-extra` for hosts that measure the cell, such as Data Grid auto-fit. |

Measured truncation never splits a grapheme cluster such as an emoji or a letter with a
combining mark. The package also exports `truncateText`, which truncates with
any `measureText` callback, `HighlightedMatchText`, which highlights without
truncating, and `splitTextGraphemes`.

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
change. Emoji inputs select through Canvas first, then verify the complete final string
with a cached DOM measurement. At most two corrections use the observed width
discrepancy; a native predicate handles larger disagreements. CSS numeric
features, variation settings, disabled optical sizing, word spacing and text
transforms use a hidden DOM predicate when Canvas cannot express them. Emoji native widths are invalidated
on font/style/query changes and resolution changes, independently of box resize. Inherited
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

## Install

The package is private and lives in GitHub Packages. Point bun at the registry
for the `@maxvyshniakov` scope:

```toml
# bunfig.toml
[install.scopes]
maxvyshniakov = { url = "https://npm.pkg.github.com/", token = "$GITHUB_TOKEN" }
```

Then install with a token that has `read:packages`
(`gh auth refresh -h github.com -s read:packages` adds the scope):

```sh
export GITHUB_TOKEN=$(gh auth token)
bun add @maxvyshniakov/text-truncate react@^19.2.8 react-dom@^19.2.8
```

The class names are Tailwind utilities, so Tailwind CSS 4 must compile them;
the package needs no design system. Scan only the package's `dist`, with a
path relative to your stylesheet:

```css
@import "tailwindcss";
@source "../node_modules/@maxvyshniakov/text-truncate/dist";
```

## Development

```sh
export GITHUB_TOKEN=$(gh auth token)   # Inline Measure comes from the registry
bun install
bun run verify
```

`bun run verify` is the push gate and the command CI runs: changelog, build,
packed-consumer check, lint, tests and types. `bun install` points Git at
`.githooks`, whose pre-push hook runs it on each pushed commit. Releases and
publishing follow [docs/VERSIONING.md](docs/VERSIONING.md).

Live examples are in the Data Grid Storybook, which renders Inline Measure and
Text Truncate demos alongside the grid.

## Correctness and performance

The standalone browser harness needs no Data Grid or Storybook build:

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
to test its source explicitly; the default uses the installed registry package.
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
