// Reuses the publishing token locally; no cross-repository PAT is stored in CI.
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function notifyDataGrid(token, fetcher = fetch) {
  try {
    if (!token) throw new Error("GITHUB_TOKEN is missing");
    const response = await fetcher("https://api.github.com/repos/maxvyshniakov/data-grid/actions/workflows/update-catalog-dependencies.yml/dispatches", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    console.log("Requested the Data Grid dependency update.");
    return true;
  } catch (error) {
    // Publication already succeeded. Do not retry an immutable package release:
    // Data Grid's daily registry check also discovers this version.
    console.warn(`Data Grid notification failed: ${error.message}. Its daily registry check will retry discovery, or run: node scripts/notify-data-grid.mjs`);
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!await notifyDataGrid(process.env.GITHUB_TOKEN)) process.exitCode = 1;
}
