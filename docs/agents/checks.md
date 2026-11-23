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
- None: the package has no Storybook. Tests run in happy-dom.

## Pins
- `@maxvyshniakov/package-kit` exact (from npmjs.org): each commit's gate is the kit its lockfile records. Raise it
  with each package-kit release, then `bunx package-kit hooks sync` and the `@v<version>` workflow references in
  `.github/workflows/` (`package-kit check` fails until they match).
- Bun 1.4.4 (`packageManager`, package-kit's `actions/setup-bun`): 1.3.14 and older trust the compromised eMudhra
  chains. Keep the floor; it moves only with package-kit.
