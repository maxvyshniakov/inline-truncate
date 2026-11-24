// Probes the packed-consumer check runs against the installed archive
// (package-kit.config.mjs, packedConsumer.probes). They check what ships, not src/.
import fs from "node:fs";
import path from "node:path";

const RUNTIME_EXPORTS = ["HighlightedMatchText", "TextTruncate", "splitTextGraphemes", "truncateText"];
const TYPE_EXPORTS = ["TextTruncateEllipsis", "TextTruncateMode", "TextTruncateProps", "TextTruncateStrategy"];
// Modules that must carry "use client": the ones that use hooks or the DOM.
const CLIENT_MODULES = ["text-truncate.js"];

const installed = consumerDir => path.join(consumerDir, "node_modules/inline-truncate");
const firstStatement = source => source.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").split(/[;\n]/, 1)[0].trim();
const usesClient = source => /^["']use client["']$/.test(firstStatement(source));
const names = list => list.split(",").map(name => name.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()).filter(Boolean);

/** The public entry: exactly eight exports, types included, nothing else shipped beside the build. */
export async function publicEntry({ consumerDir, run, ok, fail }) {
  console.log("\nPublic entry");
  const root = installed(consumerDir);
  const declarations = fs.readFileSync(path.join(root, "dist/index.d.ts"), "utf8");
  const declared = [...declarations.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)].flatMap(match => names(match[1])).sort();
  const expected = [...RUNTIME_EXPORTS, ...TYPE_EXPORTS].sort();
  if (JSON.stringify(declared) === JSON.stringify(expected)) ok(`dist/index.d.ts exports exactly ${expected.join(", ")}`);
  else fail(`dist/index.d.ts exports ${declared.join(", ")}; expected ${expected.join(", ")}`);
  const runtime = run("node", ["--input-type=module", "-e", 'console.log(JSON.stringify(Object.keys(await import("inline-truncate")).sort()))'], { cwd: consumerDir });
  const keys = runtime.status === 0 ? runtime.stdout.trim() : runtime.stderr.trim();
  if (keys === JSON.stringify([...RUNTIME_EXPORTS].sort())) ok(`runtime exports exactly ${RUNTIME_EXPORTS.join(", ")}`);
  else fail(`runtime exports ${keys}; expected ${JSON.stringify(RUNTIME_EXPORTS)}`);
  const shipped = fs.readdirSync(path.join(root, "dist"));
  const maps = shipped.filter(file => file.endsWith(".map"));
  if (!maps.length) ok("no source maps ship");
  else fail(`source maps ship that name unshipped sources: ${maps.join(", ")}`);
  for (const file of shipped.filter(file => file.endsWith(".js"))) {
    const client = usesClient(fs.readFileSync(path.join(root, "dist", file), "utf8"));
    const wanted = CLIENT_MODULES.includes(file);
    if (client === wanted) ok(`dist/${file} ${wanted ? 'starts with "use client"' : 'has no "use client"'}`);
    else fail(`dist/${file} ${wanted ? 'lacks "use client"' : 'starts with "use client", which makes every export a client reference'}`);
  }
}

// Code only the component pulls in: its DOM attributes, Inline Measure's DOM
// probe and the class merger.
const COMPONENT_MARKERS = ["data-truncate-full-text", "createInlineMeasurementRoot", "useLayoutEffect"];

/** Importing only a pure function bundles none of the component. */
export async function pureImportsBundle({ consumerDir, run, ok, fail, writeFile }) {
  console.log("\nPure imports bundle");
  const entries = {
    "truncate-only": 'import { truncateText } from "inline-truncate";\nconsole.log(truncateText({ text: "report.pdf", maxWidth: 5, mode: "end", measureText: (value) => value.length }).text);\n',
    "graphemes-only": 'import { splitTextGraphemes } from "inline-truncate";\nconsole.log(splitTextGraphemes("a👍🏽b"));\n',
  };
  for (const [name, source] of Object.entries(entries)) writeFile(path.join(consumerDir, `${name}.js`), source);
  writeFile(path.join(consumerDir, "bundle.mjs"), `import { build } from "vite";
const sizes = {};
for (const name of ${JSON.stringify(Object.keys(entries))}) {
  const result = await build({ configFile: false, logLevel: "silent", build: { write: false, minify: true, lib: { entry: name + ".js", formats: ["es"], fileName: name }, rollupOptions: { external: ["react", "react-dom", /^react\\//] } } });
  const code = [result].flat().flatMap(output => output.output).filter(chunk => chunk.type === "chunk").map(chunk => chunk.code).join("\\n");
  sizes[name] = { bytes: Buffer.byteLength(code), markers: ${JSON.stringify(COMPONENT_MARKERS)}.filter(marker => code.includes(marker)), react: /from\\s*["']react/.test(code) };
}
console.log(JSON.stringify(sizes));
`);
  const result = run("node", ["bundle.mjs"], { cwd: consumerDir });
  if (result.status !== 0) {
    fail(`vite build of pure imports: ${result.stderr.trim().split("\n").filter(Boolean).slice(-3).join(" ")}`);
    return;
  }
  const sizes = JSON.parse(result.stdout.trim().split("\n").at(-1));
  for (const [name, { bytes, markers, react }] of Object.entries(sizes)) {
    if (!markers.length && !react) ok(`${name}: ${bytes} bytes, no component code`);
    else fail(`${name}: ${bytes} bytes, pulls the component (${[...markers, ...(react ? ["react"] : [])].join(", ")})`);
  }
}

/**
 * A React server component can use the pure exports through the entry. RSC
 * bundlers read "use client" per module: with none on the entry, its pure
 * re-exports stay server code and TextTruncate, whose module has the
 * directive, becomes a client reference. Run under the "react-server"
 * condition, where React has no hooks, the pure exports must work.
 */
export async function serverImport({ consumerDir, run, ok, fail }) {
  console.log("\nServer components");
  const script = `
const entry = await import("inline-truncate");
const graphemes = entry.splitTextGraphemes("a👍🏽b");
const cut = entry.truncateText({ text: "Quarterly-design-review.pdf", maxWidth: 12, mode: "middle", measureText: (value) => value.length }).text;
const element = entry.HighlightedMatchText({ text: "Quarterly-design-review.pdf", query: "design" });
const children = [element.props.children].flat();
const match = children.find((child) => child?.props?.["data-slot"] === "highlighted-match");
console.log(JSON.stringify({ graphemes, cut, match: match?.props.children }));
`;
  const result = run("node", ["--conditions=react-server", "--input-type=module", "-e", script], { cwd: consumerDir });
  if (result.status !== 0) {
    fail(`pure exports under the react-server condition: ${result.stderr.trim().split("\n").filter(Boolean).at(-1)}`);
    return;
  }
  const { graphemes, cut, match } = JSON.parse(result.stdout.trim());
  if (graphemes.length === 3 && cut.length <= 12 && cut.includes("...") && match === "design") {
    ok('splitTextGraphemes, truncateText and HighlightedMatchText run under the "react-server" condition');
  } else {
    fail(`pure exports under react-server returned ${result.stdout.trim()}`);
  }
}
