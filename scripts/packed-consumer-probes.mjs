// Probes the packed-consumer check runs against the installed archive
// (package-kit.config.mjs, packedConsumer.probes). They check what ships, not src/.
import fs from "node:fs";
import path from "node:path";

const RUNTIME_EXPORTS = ["HighlightedMatchText", "TextTruncate", "splitTextGraphemes", "truncateText"];
const TYPE_EXPORTS = ["TextTruncateEllipsis", "TextTruncateMode", "TextTruncateProps", "TextTruncateStrategy"];
// Modules that must carry "use client": the ones that use hooks or the DOM.
const CLIENT_MODULES = ["index.js", "text-truncate.js"];

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
