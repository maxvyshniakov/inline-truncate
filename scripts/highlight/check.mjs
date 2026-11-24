// How a highlighted match meets the edge of the truncation box, in one engine:
//   node scripts/highlight/check.mjs --browser=<chromium|firefox|webkit>
// Writes artifacts/highlight/<browser>.json (every case, measured) and .png.
//
// inline-truncate#8: a match the cut hides or splits highlights the marker:
// the dots take the highlight's foreground, the highlight paints the marker's
// box, and no match paints past the box the text is cut to (the browser's own
// ellipsis left a clipped match painting under light dots).
// data-grid#148: a decoration painting 1px past the glyphs (Data Grid's
// box-shadow, emulated in page.html) keeps that 1px and its rounded corners
// on both sides of a match at the start, in the middle and at the end of a
// fitting text, and of a marker next to the cut; the room for it leaves the
// root's box, and what Inline Measure reports for it, as on origin/dev.
// Measured and CSS truncation keep the same end of the text and put the dots
// on the same side, in left-to-right and right-to-left text.
import fs from "node:fs";
import { createServer } from "vite";
import { chromium, firefox, webkit } from "playwright";
import { decodePng } from "./png.mjs";

const browserName = process.argv.find((a) => a.startsWith("--browser="))?.slice(10) ?? "chromium";
const DPR = 2;
const MATCH_FOREGROUND = "rgb(0, 0, 0)";
// Paint snaps to device pixels, 0.5 CSS px at this ratio: a 1px extension
// reads 0.5 to 1.5px on a side, and two sides one device pixel and a rounding
// apart. A clipped side reads 0.5 or less.
const EXTENSION = { min: 0.5, max: 1.5, apart: 0.75 };

const TEXT = "Lomboc boat bookcase";
const ARABIC = "مرحبا بالعالم ملف نهائي طويل";
const widths = Array.from({ length: 46 }, (_, i) => 100 + i * 2);
const cases = [
  // The owner's frames: query "as", the column narrowed step by step ("boo…" to "bookca…" and on).
  ...widths.flatMap((width) => [
    { id: `end/${width}`, width, mode: "end", query: "as", text: TEXT },
    // "boat" sits where middle mode cuts: hidden at narrow widths, split at wider ones.
    { id: `middle/${width}`, width, mode: "middle", query: "boat", text: TEXT },
    // A right-aligned column: the ellipsis first, the match near the start.
    { id: `start/${width}`, width, mode: "end", ellipsis: "start", query: "mb", text: TEXT },
  ]),
  // A match at the start, in the middle and at the end of a fitting text, in a fitted column.
  ...[["start", "So"], ["middle", "of"], ["end", "fas"]].flatMap(([where, query]) =>
    [["end"], ["middle"], ["end", "start"]].map(([mode, ellipsis]) =>
      ({ id: `fit/${mode}${ellipsis ? "-start" : ""}/${where}`, width: "fit", mode, ellipsis, query, text: "Sofas", reference: "" }))),
  // The root's box with a consumer's spacing or box model, measured and cut,
  // against the box origin/dev gave it.
  ...["", "px-2", "mx-2", "border", "box-border"].flatMap((reference) => [
    { id: `box/${reference || "none"}/fit`, width: "fit", mode: "end", query: "as", text: TEXT, reference },
    { id: `box/${reference || "none"}/cut`, width: 120, mode: "end", query: "as", text: TEXT, reference },
  ]),
  // The same props under CSS (no query) and measured (a matching query).
  ...[["latin", TEXT, "boat"], ["arabic", ARABIC, "ملف"]].flatMap(([script, text, query]) =>
    ["end", "start"].flatMap((ellipsis) => [90, 130].flatMap((width) => [
      { id: `bidi/${script}/${ellipsis}/${width}/css`, width, mode: "end", ellipsis, strategy: "css", text },
      { id: `bidi/${script}/${ellipsis}/${width}/measured`, width, mode: "end", ellipsis, query, text },
    ]))),
];

const yellow = ([r, g, b]) => r > 200 && g > 200 && b < 90;
// At least half covered by the highlight over the #1e1e1e cell: an
// antialiased edge pixel counts when most of it is painted.
const halfYellow = ([r, g, b]) => r > 140 && g > 140 && b < 90;
const light = ([r, g, b]) => r > 170 && g > 170 && b > 120;

// What the screenshot shows for one case.
function paint(image, cell) {
  const px = (v) => Math.round(v * DPR);
  // The rows the highlights cover: a border or other ink outside them is not text on the highlight.
  const top = cell.matches.length ? Math.min(...cell.matches.map((match) => px(match.top))) : px(cell.root.top) + 2;
  const bottom = cell.matches.length ? Math.max(...cell.matches.map((match) => px(match.bottom))) - 1 : px(cell.root.bottom) - 2;
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
  // Each match: how far its paint reaches past its box on a row below the
  // baseline, where a neighbouring glyph's ink does not cover the extension,
  // and whether the outermost pixel of its top row at each end is
  // highlighted (a flat edge) or not (a rounded corner).
  const edges = cell.matches.map((match) => {
    // Below the baseline and above the 2px rounded bottom corners.
    const row = Math.round((match.bottom - 2.5) * DPR);
    let runLeft = Math.ceil(match.left * DPR), runRight = Math.floor(match.right * DPR) - 1;
    while (runLeft > left && halfYellow(image.pixel(runLeft - 1, row))) runLeft--;
    while (runRight < right && halfYellow(image.pixel(runRight + 1, row))) runRight++;
    const cornerRow = Math.ceil(match.top * DPR);
    return {
      extLeft: match.left - runLeft / DPR,
      extRight: (runRight + 1) / DPR - match.right,
      roundLeft: !yellow(image.pixel(runLeft, cornerRow)),
      roundRight: !yellow(image.pixel(runRight, cornerRow)),
    };
  });
  return { lightOnHighlight, edges };
}

// Which side of the root the dots are drawn on.
function dotsSide(cell) {
  const middle = (cell.root.left + cell.root.right) / 2;
  if (cell.strategy === "css" || cell.state !== "truncated") return cell.direction === "rtl" ? "left" : "right";
  return cell.marker && (cell.marker.left + cell.marker.right) / 2 < middle ? "left" : "right";
}

function problems(cell, byId) {
  const found = [];
  const query = cell.query?.trim().toLowerCase();
  const cut = cell.state === "truncated" || cell.overflows;
  if (query && cell.matches.length === 0) found.push(`"${query}" matches the text and nothing is highlighted`);
  for (const [index, match] of cell.matches.entries()) {
    const name = match.marker ? "marker" : `"${match.text}"`;
    if (match.left < cell.content.left - 0.5 || match.right > cell.content.right + 0.5) {
      found.push(`${name} [${match.left.toFixed(1)}, ${match.right.toFixed(1)}] paints past the box the text is cut to [${cell.content.left.toFixed(1)}, ${cell.content.right.toFixed(1)}]`);
    }
    if (match.color !== MATCH_FOREGROUND) found.push(`${name} is drawn in ${match.color}, not the highlight foreground`);
    // A side touching the next highlight is no edge: the pair is one box.
    const edge = cell.paint.edges[index];
    const touchesLeft = cell.matches.some((other) => other !== match && Math.abs(other.right - match.left) < 2);
    const touchesRight = cell.matches.some((other) => other !== match && Math.abs(other.left - match.right) < 2);
    const sides = [
      !touchesLeft && ["left", edge.extLeft, edge.roundLeft],
      !touchesRight && ["right", edge.extRight, edge.roundRight],
    ].filter(Boolean);
    for (const [side, ext, round] of sides) {
      if (ext < EXTENSION.min || ext > EXTENSION.max) found.push(`${name} paints ${ext.toFixed(2)}px past its ${side} edge, not 1px`);
      if (!round) found.push(`${name} has a flat ${side} edge, not a rounded corner`);
    }
    if (sides.length === 2 && Math.abs(edge.extLeft - edge.extRight) > EXTENSION.apart) {
      found.push(`${name} paints ${edge.extLeft.toFixed(2)}px left and ${edge.extRight.toFixed(2)}px right`);
    }
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
  // A match at the text's start or end paints as one in its middle does.
  const fit = /^fit\/([^/]+)\/(start|end)$/.exec(cell.id);
  if (fit) {
    const middle = byId.get(`fit/${fit[1]}/middle`);
    const [own, reference] = [cell.paint.edges[0], middle?.paint.edges[0]];
    if (own && reference) for (const side of ["Left", "Right"]) {
      if (Math.abs(own[`ext${side}`] - reference[`ext${side}`]) > EXTENSION.apart) {
        found.push(`paints ${own[`ext${side}`].toFixed(2)}px past its ${side.toLowerCase()} edge, the match in the middle ${reference[`ext${side}`].toFixed(2)}px`);
      }
    }
  }
  if (cell.reference) {
    // How far each edge sits inside its cell (a fitted cell's own width follows its content).
    const insets = (box, cellBox) => [box.left - cellBox.left, cellBox.right - box.right];
    const [ownLeft, ownRight] = insets(cell.root, cell.cell);
    const [refLeft, refRight] = insets(cell.reference.root, cell.reference.cell);
    if (Math.abs(ownLeft - refLeft) > 0.01 || Math.abs(ownRight - refRight) > 0.01) {
      found.push(`the root sits ${ownLeft.toFixed(2)}px and ${ownRight.toFixed(2)}px inside its cell, origin/dev's box ${refLeft.toFixed(2)}px and ${refRight.toFixed(2)}px`);
    }
    if (Math.abs(cell.inlineWidth - cell.reference.inlineWidth) > 0.01) {
      found.push(`Inline Measure reports ${cell.inlineWidth.toFixed(2)}px for the root, ${cell.reference.inlineWidth.toFixed(2)}px for origin/dev's box`);
    }
  }
  const pair = /^(bidi\/.+)\/measured$/.exec(cell.id);
  if (pair) {
    const css = byId.get(`${pair[1]}/css`);
    // The measured string says which end it kept; CSS's is read from where its characters are drawn.
    const ends = cell.state === "truncated"
      ? { firstShown: !cell.visible.startsWith("..."), lastShown: !cell.visible.endsWith("...") }
      : { firstShown: true, lastShown: true };
    if (!css.overflows) found.push("the CSS twin does not overflow: the width tests nothing");
    if (css.ends.firstShown !== ends.firstShown || css.ends.lastShown !== ends.lastShown) {
      const kept = (ends) => ends.firstShown && !ends.lastShown ? "the start" : !ends.firstShown && ends.lastShown ? "the end" : "both ends";
      found.push(`keeps ${kept(ends)} of the text; CSS keeps ${kept(css.ends)}`);
    }
    if (dotsSide(cell) !== dotsSide(css)) found.push(`draws the dots on the ${dotsSide(cell)}; CSS on the ${dotsSide(css)}`);
  }
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
  const measured = cells.map((cell, index) => {
    const marker = cell.matches.find((match) => match.marker) ?? cell.dots;
    return { ...cases[index], ...cell, marker, paint: paint(image, cell) };
  });
  const byId = new Map(measured.map((cell) => [cell.id, cell]));
  const results = measured.map((cell) => ({ ...cell, problems: problems(cell, byId) }));
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
