// The gate (bun run verify), the pre-push hook, release and publish:
// @maxvyshniakov/package-kit (README.md there).
import { chain } from "@maxvyshniakov/package-kit";
import { publicEntry, pureImportsBundle, serverImport } from "./scripts/packed-consumer-probes.mjs";

// Minutes one browser script may run before verify stops its whole process
// tree. Each takes well under one minute; a11y/pointer.mjs once hung 2,699 s.
const BROWSER_SCRIPT_TIMEOUT = 4;
const ENGINES = ["chromium", "firefox", "webkit"];
// GiB a script's process tree peaks at (measured 2026-11-24: Firefox 3.8, the others under 1).
const ENGINE_MEMORY = { chromium: 1, firefox: 4, webkit: 1 };

export default {
  verify: {
    // `bun run verify:browser`, and package-kit's local release gate after
    // `verify --release`. Hosted CI (check.yml, release-npm.yml's check job) runs
    // plain verify, whose runner has no Firefox or WebKit installed.
    browser: chain(ENGINES.flatMap((engine) => [
      [`browser ${engine}`, ["run", "check:browser:engine", "--", `--browser=${engine}`], { slots: 1, timeout: BROWSER_SCRIPT_TIMEOUT, memory: ENGINE_MEMORY[engine] }],
      [`a11y ${engine}`, ["run", "check:a11y:engine", "--", `--browser=${engine}`], { slots: 1, timeout: BROWSER_SCRIPT_TIMEOUT, memory: ENGINE_MEMORY[engine] }],
      [`pointer ${engine}`, ["run", "check:a11y:pointer", "--", `--browser=${engine}`], { slots: 1, timeout: BROWSER_SCRIPT_TIMEOUT, memory: ENGINE_MEMORY[engine] }],
    ])),
    browserSlots: 1,
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
    // The bundler for the pure-imports probe, at its devDependencies pin.
    dependencies: ["vite"],
    probes: [publicEntry, pureImportsBundle, serverImport],
  },
  publish: {
    // npmjs.org with trusted publishing, from .github/workflows/release-npm.yml.
    registry: "npm",
    access: "public",
    // Data Grid adopts the release through its catalog dependency workflow.
    notify: [{ repository: "maxvyshniakov/data-grid", workflow: "update-catalog-dependencies.yml", ref: "main" }],
  },
};
