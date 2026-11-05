# Text Truncate measurements

[Recorded results and accuracy cost, 2026-11-05](2026-11-05-results.md).

This harness imports Text Truncate and Inline Measure directly into a small Vite
page. It does not import Data Grid, its fixtures, or Storybook. The checked-in
Inter fixture is InterVariable from Sid-Kit's existing licensed asset; its SIL
Open Font License is beside it in `scripts/perf/fonts/OFL.txt`. The fixture is
only a development/browser-test asset and is excluded from the published package.

## Method

`bun run perf:capture` reserves all machine slots. `--browser=chromium|firefox|webkit`
selects the engine; default Chromium. Use the same host, browser version, font
fixture and scenario filter for a before/after pair. Close unrelated workloads;
slot reservations coordinate participating processes, not every app on the Mac.

Timed workloads load the checked-in Inter font before sampling; system-font
fallback remains relevant to multilingual correctness and is separated from timings.
Host identity and OS release are included in compatibility checks.

Each scenario warms once, then records at least three samples (default nine).
Algorithm batches use 50 and 200 independent catalog-like strings, a repeated-label
batch and a long path batch. Each pure call prepares its own input; repeated-label
does not claim a persistent component cache. Component cases mount 200 measured-middle, measured-end, CSS-end or
CSS-start instances; resize 200 middle instances through five widths; and change
text or only the class of 50 instances. A separate warm notification journey
retains 200 mounted components and replays their actual ResizeObserver callbacks
five times at a stable width; preparation is warmed before timing. The constructor
wrapper still uses native ResizeObserver and removes replays on disconnect. Cold
mount and warm resize/notification IDs make cache state explicit. A 50-component
highlight mount case measures the decorated markup cost against the matching
plain 50-component case; highlights do not add per-update DOM probes to the normal
Canvas path. A separate 50-component emoji mount case records the cost of the
accuracy fallback for browser Canvas/paint width discrepancies. Text/style cases retain the original
text or style respectively so invalidation is tested independently.

Timers exclude correctness checks. Canvas calls and measured code units come
from a separate, untimed replay. React commit counts use a Profiler only during
that replay; timed runs contain no Profiler. Mount/resize samples include requestAnimationFrame
settlement, so their wall time has a display-refresh floor: use algorithm timings
and operation counts to interpret changes rather than attributing all wall time
to text measurement. Browser font and Canvas caches remain warm between samples;
mount cases have cold component-local caches. No OS/font-cache flush is claimed.

Correctness uses real DOM geometry of complete strings, not Canvas comparing
itself to its own answer. Cases include emoji/graphemes, Cyrillic, Arabic,
kerning-sensitive text, Inter tabular numbers, highlighted middle truncation at
120–360px retained-instance width sweep plus the failing 289/315/332px
boundaries with its real pseudo-element styles and a query-only change, resize, a class-only change and a
late-loaded local font. Widths smaller than the marker are tested separately in
unit tests because that public boundary intentionally returns a clipped marker.
The browser oracle permits 0.5 CSS px for layout quantization, not a whole extra
character. Each component check verifies the expected node count.

JSON reports include package, revision and actual production-source digest,
method/font digest, browser/version, environment and raw samples. The git revision
alone is not a claim of a clean tree. An optional `INLINE_MEASURE_SOURCE` is explicit
in the report; otherwise the installed registry package is used.

`--strict` requires `--baseline=file` before browser startup. Comparison rejects incompatible scenarios, methods, browser,
package, Inline Measure version/source digest or environment. Changing Inline
Measure requires `--allow-inline-measure-change`, which labels the comparison as
a combined experiment rather than attributing its gains to Text Truncate alone. It marks a timing regression when independently
bootstrapped 95% median intervals do not overlap and their separation exceeds
the coarser measured timer resolution. Component journeys additionally require a
separation larger than one idle frame interval, calibrated with nine RAF
timestamps: settlement can differ by one frame solely from start phase. The
rounded frame interval is part of environment compatibility. Algorithm timings
use only timer resolution, so this allowance cannot hide algorithm regressions. The bootstrap seed is fixed for reproducible
reports. Small sample sets can miss real differences; use nine or more repeats
and repeat suspicious comparisons. These are evidence checks, not universal
latency budgets. Browser correctness failures always produce nonzero exit status.

`--ref=HEAD` obtains the entire production source tree from git into an ignored temporary
snapshot, including helpers and their relative imports, without modifying the checkout;
the identical current browser harness measures that source. This supports a fair
baseline after the harness itself is enhanced. Vite watching/HMR is disabled
while captures run so fixture edits cannot reload an in-progress page.

## Commands

```sh
bun run perf:capture -- --ref=HEAD --runs=9 --output=artifacts/perf/before.json
bun run perf:capture -- --runs=9 --baseline=artifacts/perf/before.json --strict --output=artifacts/perf/after.json
bun run check:browser -- --browser=firefox --output=artifacts/perf/check.firefox.json
bun run perf:test
```

Recorded 2026-11-05 captures and their generated Markdown summaries live beside
this file. A baseline may expose an existing correctness failure that a candidate
fixes; such a baseline is not evidence that the prior implementation was correct.
