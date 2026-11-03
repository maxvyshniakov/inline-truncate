# Checks

## Focused
- Unit tests: `bunx vitest --config vitest.config.ts run src/<file>.test.ts`.
- Types: `bun run typecheck:fast` (the build config only), `bun run typecheck` (build and tests).
- Lint: `bun run lint`.
- Changelog: `bun run check:changelogs`.

## Full gate
- `bun run verify`: changelog, `repo-kit check`, build, packed consumer, lint, tests and types, side by side, in about a
  minute. Steps are declared in `repo-kit.config.mjs`.
- The pre-push hook runs it; run it by hand only to reproduce a hook failure.

## Heavy checks
- `bun run verify` and the pre-push hook take one slotfather slot themselves (`repo-kit verify`, `repo-kit pre-push`).
  Wrap any new heavy script as `repo-kit heavy <slots> <command>`.

## Browser and visual
- None: the package has no Storybook. Tests run in happy-dom.

## Pins
- `@maxvyshniakov/repo-kit` exact: each commit's gate is the kit its lockfile records. Raise it with each repo-kit
  release, then `bun run repo-kit hooks sync` and the workflow references (`repo-kit check` fails until they match).
- Bun 1.4.4 (`packageManager`, repo-kit's `actions/setup-bun`): 1.3.14 and older trust the compromised eMudhra chains.
  Keep the floor; it moves only with repo-kit.
