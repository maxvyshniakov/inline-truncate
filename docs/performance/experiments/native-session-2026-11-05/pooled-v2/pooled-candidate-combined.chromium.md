# Text Truncate performance

Browser: chromium/156.0.8078.4. Workload: text-truncate-v2.

Timing is wall time; component journeys include animation-frame settlement. Counts come from a separate untimed replay.

| Scenario | Median ms | p95 ms | Canvas calls | DOM reads | Correct |
| --- | ---: | ---: | ---: | ---: | --- |
| algorithm.middle.50 | 10.400 | 10.700 | 3853 | 0 | true |
| algorithm.end.50 | 1.700 | 1.900 | 400 | 0 | true |
| algorithm.middle.200 | 41.300 | 45.500 | 15456 | 0 | true |
| algorithm.end.200 | 6.600 | 7.000 | 1600 | 0 | true |
| algorithm.repeated-labels.middle.200 | 39.300 | 44.200 | 15400 | 0 | true |
| algorithm.middle.long.50 | 12.000 | 12.400 | 4000 | 0 | true |
| components.mount.middle.cold.200 | 96.400 | 98.300 | 21385 | 400 | true |
| components.mount.measured-end.cold.200 | 42.600 | 44.900 | 1700 | 400 | true |
| components.mount.css-end.cold.200 | 48.100 | 48.900 | 0 | 0 | true |
| components.mount.css-start.cold.200 | 48.000 | 48.900 | 0 | 0 | true |
| components.mount.middle.cold.50 | 48.100 | 49.400 | 5329 | 100 | true |
| components.mount.highlight-middle.cold.50 | 49.100 | 49.600 | 5329 | 100 | true |
| components.mount.emoji-middle.cold.50 | 47.700 | 49.500 | 5350 | 150 | true |
| components.notifications.middle.warm.200 | 249.400 | 250.500 | 0 | 1000 | true |
| components.resize.middle.warm.200 | 249.100 | 251.600 | 7459 | 1000 | true |
| components.change-text.middle.50 | 50.100 | 51.000 | 5169 | 50 | true |
| components.change-style.middle.50 | 49.500 | 51.400 | 3736 | 50 | true |

Combined experiment: Inline Measure changed as explicitly allowed by --allow-inline-measure-change. These timings cannot isolate Text Truncate alone.

| Scenario | Before ms | After ms | Change | Calls before → after |
| --- | ---: | ---: | ---: | ---: |
| algorithm.middle.50 | 23.200 | 10.400 | -55.2% | 6880 → 3853 |
| algorithm.end.50 | 1.900 | 1.700 | -10.5% | 400 → 400 |
| algorithm.middle.200 | 93.500 | 41.300 | -55.8% | 27780 → 15456 |
| algorithm.end.200 | 7.500 | 6.600 | -12.0% | 1600 → 1600 |
| algorithm.repeated-labels.middle.200 | 84.000 | 39.300 | -53.2% | 27200 → 15400 |
| algorithm.middle.long.50 | 2795.700 | 12.000 | -99.6% | 83780 → 4000 |
| components.mount.middle.cold.200 | 213.700 | 96.400 | -54.9% | 55560 → 21385 |
| components.mount.measured-end.cold.200 | 44.900 | 42.600 | -5.1% | 3400 → 1700 |
| components.mount.css-end.cold.200 | 47.100 | 48.100 | 2.1% | 0 → 0 |
| components.mount.css-start.cold.200 | 47.200 | 48.000 | 1.7% | 0 → 0 |
| components.mount.middle.cold.50 | 63.200 | 48.100 | -23.9% | 13760 → 5329 |
| components.mount.highlight-middle.cold.50 | 64.400 | 49.100 | -23.8% | 13760 → 5329 |
| components.mount.emoji-middle.cold.50 | 42.600 | 47.700 | 12.0% | 10760 → 5350 |
| components.notifications.middle.warm.200 | 570.500 | 249.400 | -56.3% | 138900 → 0 |
| components.resize.middle.warm.200 | 568.500 | 249.100 | -56.2% | 138900 → 7459 |
| components.change-text.middle.50 | 46.300 | 50.100 | 8.2% | 7680 → 5169 |
| components.change-style.middle.50 | 49.600 | 49.500 | -0.2% | 6880 → 3736 |

Correctness failures: 0.
Strict timing regressions require non-overlapping bootstrap 95% median intervals and separation exceeding the coarser measured timer resolution (or one calibrated frame for component journeys). This measures evidence on this host, not a universal UX budget.
