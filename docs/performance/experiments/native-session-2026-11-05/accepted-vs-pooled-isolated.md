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
| algorithm.middle.50 | 13.300 | 13.300 | 0.0% | 3853 → 3853 |
| algorithm.end.50 | 2.000 | 2.000 | 0.0% | 400 → 400 |
| algorithm.middle.200 | 51.400 | 51.600 | 0.4% | 15456 → 15456 |
| algorithm.end.200 | 7.500 | 7.900 | 5.3% | 1600 → 1600 |
| algorithm.repeated-labels.middle.200 | 48.600 | 49.100 | 1.0% | 15400 → 15400 |
| algorithm.middle.long.50 | 15.000 | 14.800 | -1.3% | 4000 → 4000 |
| components.mount.middle.cold.200 | 106.500 | 107.900 | 1.3% | 21385 → 21385 |
| components.mount.measured-end.cold.200 | 43.700 | 43.800 | 0.2% | 1700 → 1700 |
| components.mount.css-end.cold.200 | 42.300 | 42.400 | 0.2% | 0 → 0 |
| components.mount.css-start.cold.200 | 47.900 | 48.100 | 0.4% | 0 → 0 |
| components.mount.middle.cold.50 | 48.300 | 48.500 | 0.4% | 5329 → 5329 |
| components.mount.highlight-middle.cold.50 | 48.400 | 48.300 | -0.2% | 5329 → 5329 |
| components.mount.emoji-middle.cold.50 | 47.200 | 47.400 | 0.4% | 5350 → 5350 |
| components.notifications.middle.warm.200 | 238.100 | 237.100 | -0.4% | 0 → 0 |
| components.resize.middle.warm.200 | 253.500 | 251.900 | -0.6% | 7459 → 7459 |
| components.change-text.middle.50 | 50.000 | 49.800 | -0.4% | 5169 → 5169 |
| components.change-style.middle.50 | 50.000 | 50.200 | 0.4% | 3736 → 3736 |

Correctness failures: 0.
Strict timing regressions require non-overlapping bootstrap 95% median intervals and separation exceeding the coarser measured timer resolution (or one calibrated frame for component journeys). This measures evidence on this host, not a universal UX budget.
