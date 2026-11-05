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

| Scenario | Before ms | After ms | Change | Calls before → after |
| --- | ---: | ---: | ---: | ---: |
| algorithm.middle.50 | 10.300 | 10.400 | 1.0% | 3853 → 3853 |
| algorithm.end.50 | 1.700 | 1.700 | 0.0% | 400 → 400 |
| algorithm.middle.200 | 41.400 | 41.300 | -0.2% | 15456 → 15456 |
| algorithm.end.200 | 6.800 | 6.600 | -2.9% | 1600 → 1600 |
| algorithm.repeated-labels.middle.200 | 38.000 | 39.300 | 3.4% | 15400 → 15400 |
| algorithm.middle.long.50 | 11.800 | 12.000 | 1.7% | 4000 → 4000 |
| components.mount.middle.cold.200 | 91.300 | 96.400 | 5.6% | 21385 → 21385 |
| components.mount.measured-end.cold.200 | 43.200 | 42.600 | -1.4% | 1700 → 1700 |
| components.mount.css-end.cold.200 | 41.500 | 48.100 | 15.9% | 0 → 0 |
| components.mount.css-start.cold.200 | 47.900 | 48.000 | 0.2% | 0 → 0 |
| components.mount.middle.cold.50 | 48.300 | 48.100 | -0.4% | 5329 → 5329 |
| components.mount.highlight-middle.cold.50 | 47.700 | 49.100 | 2.9% | 5329 → 5329 |
| components.mount.emoji-middle.cold.50 | 47.400 | 47.700 | 0.6% | 5350 → 5350 |
| components.notifications.middle.warm.200 | 236.100 | 249.400 | 5.6% | 0 → 0 |
| components.resize.middle.warm.200 | 234.000 | 249.100 | 6.5% | 7459 → 7459 |
| components.change-text.middle.50 | 50.000 | 50.100 | 0.2% | 5169 → 5169 |
| components.change-style.middle.50 | 50.000 | 49.500 | -1.0% | 3736 → 3736 |

Correctness failures: 0.
Strict timing regressions require non-overlapping bootstrap 95% median intervals and separation exceeding the coarser measured timer resolution (or one calibrated frame for component journeys). This measures evidence on this host, not a universal UX budget.
