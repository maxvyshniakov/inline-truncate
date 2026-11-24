// How a highlighted match meets the edge of the truncation box, in one engine:
//   node scripts/highlight/check.mjs --browser=<chromium|firefox|webkit>
// Writes artifacts/highlight/<browser>.json (every case, measured) and .png.
//
// inline-truncate#8: a match the cut hides or splits highlights the marker:
// the dots take the highlight's foreground, the highlight paints the marker's
// box, and no match paints past the box the text is cut to (the browser's own
// ellipsis left a clipped match painting under light dots).
// data-grid#148: a decoration painting 1px past the glyphs (Data Grid's
// box-shadow, emulated in page.html) keeps that 1px and its radius on both
// sides of a match at the start, in the middle and at the end of a fitting
// text, and of a marker next to the cut.
import fs from "node:fs";
import { createServer } from "vite";
import { chromium, firefox, webkit } from "playwright";
import { decodePng } from "./png.mjs";

const browserName = process.argv.find((a) => a.startsWith("--browser="))?.slice(10) ?? "chromium";
const DPR = 2;
const MATCH_FOREGROUND = "rgb(0, 0, 0)";

const TEXT = "Lomboc boat bookcase";
const widths = Array.from({ length: 46 }, (_, i) => 100 + i * 2);
const cases = [
  // The owner's frames: query "as", the column narrowed step by step ("boo…" to "bookca…" and on).
  ...widths.flatMap((width) => [
    { id: `end/${width}`, width, mode: "end", query: "as", text: TEXT },
    { id: `middle/${width}`, width, mode: "middle", query: "as", text: TEXT },
    // A right-aligned column: the ellipsis first, the match near the start.
    { id: `start/${width}`, width, mode: "end", ellipsis: "start", query: "mb", text: TEXT },
  ]),
  // A match at the start, in the middle and at the end of a fitting text, in a fitted column.
  ...[["start", "So"], ["middle", "of"], ["end", "fas"]].flatMap(([where, query]) =>
    [["end"], ["middle"], ["end", "start"]].map(([mode, ellipsis]) =>
      ({ id: `fit/${mode}${ellipsis ? "-start" : ""}/${where}`, width: "fit", mode, ellipsis, query, text: "Sofas" }))),
];

const yellow = ([r, g, b]) => r > 200 && g > 200 && b < 90;
const light = ([r, g, b]) => r > 170 && g > 170 && b > 120;

// What the screenshot shows for one case.
function paint(image, cell) {
  const px = (v) => Math.round(v * DPR);
  const top = px(cell.root.top) + 2, bottom = px(cell.root.bottom) - 2;
  const left = Math.max(0, px(cell.root.left) - 8), right = Math.min(image.width - 1, px(cell.root.right) + 8);
  let lightOnHighlight = 0;
  for (let x = left; x <= right; x++) {
    let hasYellow = false, hasLight = false;
    for (let y = top; y <= bottom; y++) {
      const p = image.pixel(x, y);
      if (yellow(p)) hasYellow = true;
      else if (light(p)) hasLight = true;
    }
    if (hasYellow && hasLight) lightOnHighlight++;
  }
  // Each match: how far its paint reaches past its box on its middle row, and
  // whether the top corners at both ends of that paint look alike (a radius
  // on one side and a flat cut on the other do not).
  const edges = cell.matches.map((match) => {
    const row = px((match.top + match.bottom) / 2);
    let runLeft = Math.ceil(match.left * DPR), runRight = Math.floor(match.right * DPR) - 1;
    while (runLeft > left && yellow(image.pixel(runLeft - 1, row))) runLeft--;
    while (runRight < right && yellow(image.pixel(runRight + 1, row))) runRight++;
    const cornerRow = Math.ceil(match.top * DPR);
    const [a, b] = [image.pixel(runLeft, cornerRow), image.pixel(runRight, cornerRow)];
    return {
      extLeft: match.left - runLeft / DPR,
      extRight: (runRight + 1) / DPR - match.right,
      cornerDelta: Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]),
    };
  });
  return { lightOnHighlight, edges };
}

function problems(cell) {
  const found = [];
  const query = cell.id.startsWith("fit/") ? null : cell.id.startsWith("start/") ? "mb" : "as";
  const cut = cell.state === "truncated" || cell.overflows;
  for (const [index, match] of cell.matches.entries()) {
    const name = match.marker ? "marker" : `"${match.text}"`;
    if (match.left < cell.content.left - 0.5 || match.right > cell.content.right + 0.5) {
      found.push(`${name} [${match.left.toFixed(1)}, ${match.right.toFixed(1)}] paints past the box the text is cut to [${cell.content.left.toFixed(1)}, ${cell.content.right.toFixed(1)}]`);
    }
    if (match.color !== MATCH_FOREGROUND) found.push(`${name} is drawn in ${match.color}, not the highlight foreground`);
    // A side touching the next highlight has no edge of its own.
    const edge = cell.paint.edges[index];
    const touchesLeft = cell.matches.some((other) => other !== match && Math.abs(other.right - match.left) < 2);
    const touchesRight = cell.matches.some((other) => other !== match && Math.abs(other.left - match.right) < 2);
    const sides = [!touchesLeft && ["left", edge.extLeft], !touchesRight && ["right", edge.extRight]].filter(Boolean);
    for (const [side, ext] of sides) {
      if (ext < 0.25 || ext > 1.75) found.push(`${name} paints ${ext.toFixed(2)}px past its ${side} edge, not 1px`);
    }
    if (sides.length === 2 && Math.abs(edge.extLeft - edge.extRight) > 0.75) {
      found.push(`${name} paints ${edge.extLeft.toFixed(2)}px left and ${edge.extRight.toFixed(2)}px right`);
    }
    if (sides.length === 2 && edge.cornerDelta > 150) found.push(`${name} has unlike corners (difference ${edge.cornerDelta})`);
  }
  if (query && cut) {
    // A match the box clips is not shown, whatever its text.
    const inside = (match) => match.left >= cell.content.left - 0.5 && match.right <= cell.content.right + 0.5;
    const shown = cell.matches.filter((match) => !match.marker && inside(match)).map((match) => match.text.toLowerCase());
    const hidden = !shown.includes(query);
    const marker = cell.matches.some((match) => match.marker);
    if (hidden && !marker) found.push(`the cut hides or splits "${query}" and the marker is not highlighted`);
    if (!hidden && marker) found.push(`"${query}" is visible whole and the marker is highlighted too`);
  }
  if (cell.paint.lightOnHighlight > 0) found.push(`${cell.paint.lightOnHighlight} columns draw light text on the highlight`);
  return found;
}

const server = await createServer({ configFile: false, root: process.cwd(), logLevel: "error", server: { port: 0, host: "127.0.0.1", hmr: false, watch: null } });
let browser;
const failures = [];
try {
  await server.listen();
  const launcher = { chromium, firefox, webkit }[browserName];
  if (!launcher) throw new Error(`Unsupported browser ${browserName}`);
  browser = await launcher.launch({ headless: true, ...(browserName === "firefox" ? { channel: "moz-firefox" } : {}) });
  const page = await browser.newPage({ viewport: { width: 400, height: 1200 }, deviceScaleFactor: DPR });
  page.on("pageerror", (error) => failures.push(`page error: ${error.message}`));
  await page.goto(`${server.resolvedUrls.local[0]}scripts/highlight/page.html`);
  await page.waitForFunction(() => window.highlightHarness);
  const cells = await page.evaluate((list) => window.highlightHarness.show(list), cases);
  const shot = await page.screenshot({ fullPage: true });
  const image = decodePng(shot);
  const results = cells.map((cell) => {
    const measured = { ...cell, paint: paint(image, cell) };
    return { ...measured, problems: problems(measured) };
  });
  for (const result of results) for (const problem of result.problems) failures.push(`${result.id} (${result.strategy}, "${result.visible}"): ${problem}`);
  fs.mkdirSync("artifacts/highlight", { recursive: true });
  fs.writeFileSync(`artifacts/highlight/${browserName}.png`, shot);
  fs.writeFileSync(`artifacts/highlight/${browserName}.json`, JSON.stringify({ browser: `${browserName}/${browser.version()}`, results }, null, 2) + "\n");
  const failed = results.filter((result) => result.problems.length).length;
  console.log(`highlight edges, ${browserName}/${browser.version()}: ${results.length - failed}/${results.length} cases pass`);
} finally {
  await browser?.close();
  await server.close();
}
if (failures.length) {
  console.error(failures.slice(0, 40).join("\n"));
  if (failures.length > 40) console.error(`... and ${failures.length - 40} more (artifacts/highlight/${browserName}.json)`);
  process.exitCode = 1;
}
