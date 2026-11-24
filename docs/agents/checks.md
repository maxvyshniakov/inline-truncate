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
  `verify.browser`. It runs the correctness check (`scripts/perf/run.mjs --check`), `scripts/a11y/check.mjs` and
  `scripts/a11y/pointer.mjs` in Chromium, Firefox and WebKit, one script at a time under one slot. Each script has a
  hard timeout of 4 minutes, after which verify stops its whole process tree. package-kit's local release gate runs
  it after `verify --release`. Hosted CI does not, because its runner has no Firefox or WebKit. Run it before handing
  back any change under `src/` or `scripts/`: the plain gate does not run it.
- `bun run check:a11y`: accessible text, copy and find, then pointer, selection, overflow and focus on a table of
  truncated cells (`scripts/a11y/pointer.mjs`), in Chromium, Firefox (the installed stable, over WebDriver BiDi)
  and WebKit, one engine at a time, behind one heavy slot. Run it for changes to the rendered DOM. Reports land in
  `artifacts/a11y/`.

## Pins
- `@maxvyshniakov/package-kit` exact (from npmjs.org): each commit's gate is the kit its lockfile records. Raise it
  with each package-kit release, then `bunx package-kit hooks sync` and the `@v<version>` workflow references in
  `.github/workflows/` (`package-kit check` fails until they match).
- Bun 1.4.4 (`packageManager`, package-kit's `actions/setup-bun`): 1.3.14 and older trust the compromised eMudhra
  chains. Keep the floor; it moves only with package-kit.
