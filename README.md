# @skipstery/text-truncate

The package is currently private. See the [standalone quick start](../../docs/GETTING_STARTED.md) for local archive installation.

React text truncation and search highlighting. Depends on Inline Measure, not Sid-Kit or Data Grid.

```tsx
import { TextTruncate } from "@skipstery/text-truncate";
<TextTruncate text="Quarterly-design-review.pdf" mode="middle" />
```

Compile the package class names with Tailwind CSS 4, including this package in your source scan. It is independent of a design system, but currently requires Tailwind utilities.

Highlight colors use `--text-truncate-highlight-background` and `--text-truncate-highlight-foreground`, with amber and current-text defaults. Hosts can override those variables. Data Grid maps them to its theme.

`mode="end"` preserves the start; `mode="middle"` preserves both ends. See Storybook for a constrained-width example and `src/index.test.tsx` for Unicode and truncation behavior.
