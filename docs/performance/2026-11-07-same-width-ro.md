# Text Truncate: repeated same-width RO

Measured repair on dev against baseline 0251d4a (Text Truncate 0.2.2). Inline Measure is fixed at 0.3.3 in every final before/after capture. The experiment changes no Data Grid code.

Evidence root: `~/.local/state/text-truncate-same-ro-20261107/`. Relative artifact paths below refer to that directory.

## Confirmed defect and repair

A warmed same-width RO still ran session setup, middle selection and setState; cache hits prevented new Canvas work but did not skip those calculations. The native/emoji session also fetched computed style a second time. The RED unit test observed two reads rather than the required one.

The guard validates live available content width and complete existing typography signature (plus inherited lang), then skips the session, selection and state update if that completed input is unchanged. Font/DPR invalidation and effect input changes clear completion; zero width clears completion before returning the original text. It retains width/style reads and does not filter RO/RAF delivery or batch different components.

## Before / after

Each row is milliseconds for 20 rounds ×200 mounted components =4000 callback deliveries. The scenario synchronously drains the actual scheduled RAF work against native DOM geometry, without waiting for frames. This is callback-throughput wall time, not paint/frame latency or sampled CPU time. Preparation and independent correctness are outside timing; work counters come from a separate replay.

All measurements held every Slotfather slot exclusively. Nine samples, fresh browser process per capture, A/B/B/A. Identical method/font hashes and Inline Measure dependency; fixed seed bootstrap95% intervals and timer-quantum floor must confirm improvement in both pairs. Raw frame calibration is retained but is not an environment constraint for these synchronous CPU-only scenarios. Frame-based workloads keep the original strict compatibility and one-frame floor.

| Browser | Text | Before ms | After ms | Change |
| --- | --- | ---: | ---: | ---: |
| chromium | plain | 132.65 | 14.30 | -89.2% |
| chromium | emoji | 123.25 | 14.10 | -88.6% |
| firefox | plain | 120.00 | 12.00 | -90.0% |
| firefox | emoji | 116.00 | 12.00 | -89.7% |
| webkit | plain | 122.00 | 15.50 | -87.3% |
| webkit | emoji | 136.50 | 15.00 | -89.0% |

In every counter replay, Canvas calls remain0, width/geometry reads4000 and React commits0. Plain computed-style reads remain4000. Emoji computed-style reads fall8000→4000. Gains therefore do not come from fewer RO deliveries, fewer width reads, skipping validation or a cheaper font dependency.

## Accuracy and limits

All selected main-series captures pass the component checks and complete native oracle, including highlighted emoji, changing widths/styles, late font loading, same-width stability, zero-width recovery and live typography/padding changes. The oracle checks available content width after padding. Tests also preserve same-width font/DPR invalidation and prop/query lifecycle handling.

The first Firefox A2 baseline emoji scenario had an aggregate correctness=false while its separate global oracle passed. This raw failure is retained in firefox/A2.json; its phase is not recoverable from the schema. A complete independent Firefox A/B/B/A series under firefox-control is clean and is used above, rather than mixing individual successful samples. The initial exploratory red-chromium report used Inline0.3.0 and a prior harness; it is excluded from final comparisons.

These results do not prove redundant width notifications occur in a particular Data Grid trace. The Grid session explicitly found that more useful width updates explained much of its higher TT callback count. Same-width style validation can still force layout after other components write DOM; this repair is not a shared read/write scheduler. No Data Grid frame-gain claim is made.

## Reproduction and evidence

Frozen source/harness: frozen-worktree; Inline snapshot: inline033; manifests: frozen-manifest.json. capture.py defines the matrix; capture-webkit.py and capture-ff-control.py define the continued independent groups. All JSON, logs and screenshots remain alongside. analyze.mjs recomputes comparisons; comparison.json includes intervals, counters, source hashes and raw frame calibration in the referenced reports.

Working production hash: 730e0d38ac09b8f5bbba44724070f97202b2353885e98ce95f2668fe1148e823
