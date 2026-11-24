// The gate (bun run verify), the pre-push hook, release and publish:
// @maxvyshniakov/package-kit (README.md there).
import { publicEntry } from "./scripts/packed-consumer-probes.mjs";

export default {
  verify: {
    steps: ({ release }) => [
      { name: "changelog", command: ["run", "check:changelogs", ...(release ? ["--", "--release"] : [])] },
      { name: "kit", command: ["run", "check:kit"] },
      { name: "build", command: ["run", "build"] },
      { name: "packed consumer", command: ["run", "check:consumer"], needs: ["build"] },
      { name: "lint", command: ["run", "lint"] },
      { name: "test", command: ["run", "test"], usesCores: true },
      { name: "typecheck", command: ["run", "typecheck"] },
    ],
  },
  packedConsumer: {
    probes: [publicEntry],
  },
  publish: {
    // npmjs.org with trusted publishing, from .github/workflows/release-npm.yml.
    registry: "npm",
    access: "public",
    // Data Grid adopts the release through its catalog dependency workflow.
    notify: [{ repository: "maxvyshniakov/data-grid", workflow: "update-catalog-dependencies.yml", ref: "main" }],
  },
};
