# @skipstery/text-truncate

React text truncation and search highlighting. Depends on Inline Measure, not Sid-Kit or Data Grid.

```tsx
import { TextTruncate } from "@skipstery/text-truncate";
<TextTruncate text="Quarterly-design-review.pdf" mode="middle" />
```

Compile the package class names with Tailwind CSS 4, including this package in your source scan. It is independent of a design system, but currently requires Tailwind utilities.

Highlight colors use `--text-truncate-highlight-background` and `--text-truncate-highlight-foreground`, with amber and current-text defaults. Hosts can override those variables. Data Grid maps them to its theme.

`mode="end"` preserves the start; `mode="middle"` preserves both ends. See the Data Grid Storybook for a constrained-width example and `src/index.test.tsx` for Unicode and truncation behavior.

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

Import Tailwind in your stylesheet and scan only the package's `dist`:

```css
@import "tailwindcss";
@source "../node_modules/@skipstery/text-truncate/dist";
```

Browser measurement requires a mounted, constrained-width element.

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

## License

MIT for owner-authored code; see [LICENSE](LICENSE).
