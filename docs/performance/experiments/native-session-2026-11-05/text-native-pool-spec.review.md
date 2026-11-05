# Native pooled-root specification review

Read-only review of `/tmp/text-truncate-native-session-review.diff`, the candidate's `src/measurement.ts`, focused `src/measurement-operation.test.ts`, existing measurement-boundary tests, and baseline README/AGENTS. No tests, browsers, or benchmarks run. No performance benefit assumed.

## Finding

### [P2] Revalidate an active session's root after external removal

Location: `/private/tmp/text-truncate-native-pooled-root-20261105/src/measurement.ts:72-80` (read at line 89).

The detached-root check at lines 33-35 only runs when a session first acquires its root. Once `root` is set, every subsequent `measureDOM` call skips that check. For example, open sessions A and B on the shared root, remove that root externally, and measure again through A. A continues reading its disconnected probe; its DOM rectangle is zero, so native verification/exact selection receives an incorrect zero width. Starting a new session B after the removal creates a new root but still does not repair A. This fails the explicit requirement that external root removal must not leave stale pool use, including overlapping sessions.

Revalidate the session's root/probe attachment before every native read and move/recreate its probe on a valid document root when necessary. Add coverage for external removal both between sessions and while an existing session remains active; the supplied focused tests cover neither case.

## Remaining requirements

The diff preserves the Canvas/native branch selection and exact-measure hooks; marker policy and component cache invalidation are unchanged. Source box geometry is deferred until the first native call. Disposal removes the session probe synchronously; normal empty-root timer cleanup and independent document entries are present, with focused coverage for ordinary overlapping sessions. Containment is explicitly `layout style`, without size containment. Actual browser width equivalence remains unverified by this static review.
