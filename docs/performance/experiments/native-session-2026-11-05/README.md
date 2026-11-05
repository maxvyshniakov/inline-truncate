# Rejected native-session experiments — 2026-11-05

**Decision: neither candidate is adopted.** Production remains digest `e917879917ed6dd867e9199f7ad38ca5a060cd758fadaee55f4352e354540f52`. These files are historical experiments, not the accepted implementation or its final standalone captures.

- `lazy/`: defer source box geometry until a native cache miss. Source `ffe31ac3e6846af924dda77ae7dd04473c69607a1ca67c88218a6ed447e6bf56`.
- `pooled-v1/`: lazy geometry plus one document-owned, empty root across synchronous sessions, `contain: layout style`, timer cleanup. Source `f73d0ec94dfcbe5f1e9b9a8a220255af14e7ab908a7ebc778e53136df1eefe74`. Static review found active-session detachment was not repaired. No integration timing of this version was used for selection.
- `pooled-v2/`: reviewed fix revalidates root/probe attachment before every native read; independent cleanup for overlapping old/new owners. Source `8890baf0a4fa499faa1557e3f63b0bec9cca389ad13b362579ff779bf24eb9dc`.

Each directory preserves its patch against production `src/measurement.ts`, focused test source, original source manifest and browser/equivalence evidence. Apply the patch only to a scratch copy of the recorded production source; copy the test into its `src/` to run it. No dependency directory or build output is archived. Equivalence scripts contain original local paths and require updating those paths to replay elsewhere.

Both final candidates pass full Chromium/Firefox/WebKit correctness and 1,056 strict native-width comparisons per engine with no differences. Pooled-v2 additionally passes active-root removal, probe removal and overlapping cleanup checks in real browsers. Its 50-session operation replay reduces body root appends/removes from 50/50 to 1/1. These counts establish fewer mutations, not better interaction latency. Pooled-v2 has 30 Vitest tests, including seven operation/lifecycle checks; lazy has 24. Types, lint and the 17 Node tests pass.

## Package-owned comparison and scope

`accepted-vs-pooled-isolated.{json,md}` and
`accepted-vs-pooled-combined.{json,md}` compare the candidate directly with the
accepted production captures through the package’s existing comparison function.
Method, browser, environment, workload and Inline Measure identity match within
each pair. There are zero supported improvements and zero supported regressions
across all 17 scenarios in each comparison. Cold emoji mount is 47.2→47.4ms
(isolated) and 47.4→47.7ms (combined). Fewer body mutations do not demonstrate a
package latency gain, so the extra pooling machinery is not adopted.

Lazy-box has focused correctness and operation-count evidence, but was not
separately timed in the package harness. It remains unadopted without a claimed
speedup.

Data Grid performance belongs to another session and is outside this archive.

Original pooled micro captures against the older committed baseline remain
unchanged in this archive. The direct comparisons above are the relevant test
of an additional gain over the accepted implementation. Primary captures in
`../../` remain production `e917…`.
