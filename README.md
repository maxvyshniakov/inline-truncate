# @skipstery/text-truncate

React text truncation and search highlighting. Depends on Inline Measure, not Sid-Kit or Data Grid.

```tsx
import { TextTruncate } from "@skipstery/text-truncate";

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

## Install

The package is private and lives in GitHub Packages. Point bun at the registry
for the `@skipstery` scope:

```toml
# bunfig.toml
[install.scopes]
skipstery = { url = "https://npm.pkg.github.com/", token = "$GITHUB_TOKEN" }
```

Then install with a token that has `read:packages`
(`gh auth refresh -h github.com -s read:packages` adds the scope):

```sh
export GITHUB_TOKEN=$(gh auth token)
bun add @skipstery/text-truncate react@^19.2.8 react-dom@^19.2.8
```

The class names are Tailwind utilities, so Tailwind CSS 4 must compile them;
the package needs no design system. Scan only the package's `dist`, with a
path relative to your stylesheet:

```css
@import "tailwindcss";
@source "../node_modules/@skipstery/text-truncate/dist";
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

## License

MIT for owner-authored code; see [LICENSE](LICENSE).
