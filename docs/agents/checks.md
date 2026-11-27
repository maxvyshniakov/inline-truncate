# Checks

## Focused
- Unit tests: `bunx vitest --config vitest.config.ts run src/<file>.test.ts`.
- Types: `bun run typecheck:fast` (the build config only), `bun run typecheck` (build and tests).
- Lint: `bun run lint`.
- Changelog: `bun run check:changelogs`.

## Full gate
- `bun run verify`: changelog, `package-kit check`, build, packed consumer, lint, tests and types, side by side, in about a
  minute. Steps are declared in `package-kit.config.mjs`.
- The pre-push hook runs it; run it by hand only to reproduce a hook failure.

## Heavy checks
- `bun run verify` and the pre-push hook take one slotfather slot themselves (`package-kit verify`,
  `package-kit pre-push`). Wrap any new heavy script as `package-kit heavy <slots> <command>`.

## Browser and visual
- No Storybook. Unit tests run in happy-dom.
- `bun run verify:browser` (`package-kit verify --browser`): the browser suite in `package-kit.config.mjs`,
  `verify.browser`. It runs the correctness check (`scripts/perf/run.mjs --check`), `scripts/a11y/check.mjs`,
  `scripts/a11y/pointer.mjs` and `scripts/highlight/check.mjs` in Chromium, Firefox and WebKit, one script at a time under one slot. Each script has a
  hard timeout of 4 minutes, after which verify stops its whole process tree. package-kit's local release gate runs
  it after `verify --release`. Hosted CI (`.github/workflows/check.yml`, `browser` job on `ubuntu-latest`) installs
  Playwright Chromium, Firefox and WebKit and runs `check:browser:engine`, `check:a11y:engine` and `check:a11y:pointer`
  across all three engines. Run `bun run verify:browser` locally before handing
  back any change under `src/` or `scripts/`: the plain `verify` gate does not run it.
- `bun run check:a11y`: accessible text, copy and find, then pointer, selection, overflow and focus on a table of
  truncated cells (`scripts/a11y/pointer.mjs`, which also fails when a measured root makes a flush scrolling box
  scroll), in Chromium, Firefox (the installed stable, over WebDriver BiDi)
  and WebKit, one engine at a time, behind one heavy slot, each script stopped with its process group after the same
  4 minutes (`scripts/a11y/all.mjs`). Run it for changes to the rendered DOM. Reports land in `artifacts/a11y/`.
- `scripts/highlight/check.mjs --browser=<engine>`: how a highlighted match meets the edge of the box, read from a
  screenshot at device pixel ratio 2 (inline-truncate#8, data-grid#148). On "Lomboc boat bookcase" narrowed from
  100 to 190px in end, middle and start-ellipsis layouts, and on "Sofas" in a fitted column, it fails when nothing is
  highlighted, a match paints past the box the text is cut to, a hidden or split match leaves the marker plain, a
  highlight is not drawn in the highlight foreground or holds light text, or Data Grid's 1px decoration (emulated in
  `scripts/highlight/page.html`) loses its pixel or its rounded corner on a side, or paints otherwise at the text's
  edge than in its middle. It also fails when the root's box or Inline Measure's width for it differs from
  origin/dev's root with a consumer's `px-2`, `mx-2`, `border` or `box-border`, and when measured truncation keeps
  another end of Latin or Arabic text, or draws the dots on another side, than CSS for the same props. Reports and
  the screenshot land in `artifacts/highlight/`.
- `scripts/harness.css`: the package's Tailwind utilities written out for the four browser harnesses, which have no
  Tailwind build; `src/harness-css.test.tsx` fails when a class the component renders has no rule there.

## Pins
- `@maxvyshniakov/package-kit` exact (from npmjs.org): each commit's gate is the kit its lockfile records. Raise it
  with each package-kit release, then `bunx package-kit hooks sync` and the `@v<version>` workflow references in
  `.github/workflows/` (`package-kit check` fails until they match).
- Bun 1.4.4 (`packageManager`, package-kit's `actions/setup-bun`): 1.3.14 and older trust the compromised eMudhra
  chains. Keep the floor; it moves only with package-kit.
