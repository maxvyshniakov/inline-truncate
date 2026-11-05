# Text Truncate performance

Browser: chromium/156.0.8078.4. Workload: text-truncate-v2.

Timing is wall time; component journeys include animation-frame settlement. Counts come from a separate untimed replay.

| Scenario | Median ms | p95 ms | Canvas calls | DOM reads | Correct |
| --- | ---: | ---: | ---: | ---: | --- |
| algorithm.middle.50 | 13.300 | 13.500 | 3853 | 0 | true |
| algorithm.end.50 | 2.000 | 2.100 | 400 | 0 | true |
| algorithm.middle.200 | 51.600 | 54.700 | 15456 | 0 | true |
| algorithm.end.200 | 7.900 | 8.100 | 1600 | 0 | true |
| algorithm.repeated-labels.middle.200 | 49.100 | 50.300 | 15400 | 0 | true |
| algorithm.middle.long.50 | 14.800 | 15.700 | 4000 | 0 | true |
| components.mount.middle.cold.200 | 107.900 | 119.200 | 21385 | 400 | true |
| components.mount.measured-end.cold.200 | 43.800 | 45.100 | 1700 | 400 | true |
| components.mount.css-end.cold.200 | 42.400 | 42.500 | 0 | 0 | true |
| components.mount.css-start.cold.200 | 48.100 | 48.300 | 0 | 0 | true |
| components.mount.middle.cold.50 | 48.500 | 48.700 | 5329 | 100 | true |
| components.mount.highlight-middle.cold.50 | 48.300 | 48.400 | 5329 | 100 | true |
| components.mount.emoji-middle.cold.50 | 47.400 | 47.800 | 5350 | 150 | true |
| components.notifications.middle.warm.200 | 237.100 | 239.300 | 0 | 1000 | true |
| components.resize.middle.warm.200 | 251.900 | 256.000 | 7459 | 1000 | true |
| components.change-text.middle.50 | 49.800 | 50.000 | 5169 | 50 | true |
| components.change-style.middle.50 | 50.200 | 50.300 | 3736 | 50 | true |

| Scenario | Before ms | After ms | Change | Calls before → after |
| --- | ---: | ---: | ---: | ---: |
| algorithm.middle.50 | 23.200 | 13.300 | -42.7% | 6880 → 3853 |
| algorithm.end.50 | 1.900 | 2.000 | 5.3% | 400 → 400 |
| algorithm.middle.200 | 93.500 | 51.600 | -44.8% | 27780 → 15456 |
| algorithm.end.200 | 7.500 | 7.900 | 5.3% | 1600 → 1600 |
| algorithm.repeated-labels.middle.200 | 84.000 | 49.100 | -41.5% | 27200 → 15400 |
| algorithm.middle.long.50 | 2795.700 | 14.800 | -99.5% | 83780 → 4000 |
| components.mount.middle.cold.200 | 213.700 | 107.900 | -49.5% | 55560 → 21385 |
| components.mount.measured-end.cold.200 | 44.900 | 43.800 | -2.4% | 3400 → 1700 |
| components.mount.css-end.cold.200 | 47.100 | 42.400 | -10.0% | 0 → 0 |
| components.mount.css-start.cold.200 | 47.200 | 48.100 | 1.9% | 0 → 0 |
| components.mount.middle.cold.50 | 63.200 | 48.500 | -23.3% | 13760 → 5329 |
| components.mount.highlight-middle.cold.50 | 64.400 | 48.300 | -25.0% | 13760 → 5329 |
| components.mount.emoji-middle.cold.50 | 42.600 | 47.400 | 11.3% | 10760 → 5350 |
| components.notifications.middle.warm.200 | 570.500 | 237.100 | -58.4% | 138900 → 0 |
| components.resize.middle.warm.200 | 568.500 | 251.900 | -55.7% | 138900 → 7459 |
| components.change-text.middle.50 | 46.300 | 49.800 | 7.6% | 7680 → 5169 |
| components.change-style.middle.50 | 49.600 | 50.200 | 1.2% | 6880 → 3736 |

Correctness failures: 0.
Strict timing regressions require non-overlapping bootstrap 95% median intervals and separation exceeding the coarser measured timer resolution (or one calibrated frame for component journeys). This measures evidence on this host, not a universal UX budget.
