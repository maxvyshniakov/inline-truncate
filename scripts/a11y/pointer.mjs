// Proves the hidden full-text copy of measured truncation stays out of the way of
// the pointer, selection, layout and focus in one engine, on a table of truncated cells.
//   node scripts/a11y/pointer.mjs --browser=<chromium|firefox|webkit>
// (1) elementFromPoint over every pixel of each truncated cell never returns the copy,
//     and clicks reach the cell's handler with the visible span or the root as target;
// (2) double-click, triple-click, a drag across two cells and select-all give the
//     visible strings once and never the copy (selection, and the clipboard in Chromium);
// (3) the copy adds no scrollable overflow to its cell or the scroll container;
// (4) Tab skips it.
import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";
import { chromium, firefox, webkit } from "playwright";

const args = process.argv.slice(2);
const browserName = args.find((a) => a.startsWith("--browser="))?.slice(10) ?? "chromium";
const output = path.resolve(`artifacts/a11y/pointer.${browserName}.json`);
// Progress on stderr, so a stalled engine shows the step it stalled in.
const step = (name) => process.stderr.write(`[pointer ${browserName}] ${name}\n`);

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: "error",
  server: { port: 0, host: "127.0.0.1", hmr: false, watch: null },
});
let browser;
try {
  await server.listen();
  const url = `${server.resolvedUrls.local[0]}scripts/a11y/pointer.html`;
  const launcher = { chromium, firefox, webkit }[browserName];
  if (!launcher) throw new Error(`Unsupported browser ${browserName}`);
  browser = await launcher.launch({ headless: true, ...(browserName === "firefox" ? { channel: "moz-firefox" } : {}) });
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  step("load");
  await page.goto(url);
  await page.waitForFunction(() => {
    const roots = document.querySelectorAll("#scroller [data-truncate]");
    return roots.length === 6 && [...roots].every((root) => root.dataset.truncateState === "truncated");
  });

  const failures = [...errors];
  const fail = (message) => failures.push(message);

  // Every cell's full text, visible string and a run only the cut part holds.
  const cells = await page.evaluate(() =>
    [...document.querySelectorAll("#scroller td")].map((cell) => {
      const root = cell.querySelector("[data-truncate]");
      const full = root.dataset.truncateOriginal;
      const visible = root.querySelector(":scope > [data-truncate-visible]").textContent;
      // The first marker-shaped run; with periods beside the cut this can be off by
      // a period, so a cut part the visible string also shows is not used.
      const at = visible.indexOf("...");
      const cutPart = full.slice(at, full.length - (visible.length - at - 3));
      return { id: cell.dataset.cell, full, visible, cutPart: visible.includes(cutPart) ? "" : cutPart };
    }));
  const checkCopied = (label, copied, expected) => {
    if (copied === null) return;
    for (const cell of cells) {
      if (copied.includes(cell.full)) fail(`${label}: holds the full text of ${cell.id}`);
      if (cell.cutPart.length >= 4 && copied.includes(cell.cutPart)) fail(`${label}: holds the cut part of ${cell.id} ("${cell.cutPart}")`);
      const count = copied.split(cell.visible).length - 1;
      if (expected.includes(cell.id) && count !== 1) fail(`${label}: holds the visible string of ${cell.id} ${count} times`);
    }
  };
  // Only Chromium lets a page read the clipboard here: Firefox holds the read on a
  // paste prompt that blocks the page, and check.mjs reads it in Chromium only too.
  const readClipboard = async () => {
    if (browserName !== "chromium") return null;
    step("copy");
    await page.keyboard.press("ControlOrMeta+C");
    return page.evaluate(() => navigator.clipboard.readText());
  };
  const selection = () => page.evaluate(() => getSelection().toString());
  const clearSelection = () => page.evaluate(() => getSelection().removeAllRanges());
  const rect = (id, part = "[data-truncate]") =>
    page.locator(`td[data-cell="${id}"] ${part}`).first().evaluate((element) => {
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
      return { left, top, right, bottom, width, height };
    });

  step("overflow");
  // (3) Scroll sizes: before the first truncation, now, and now without the copies.
  const sizes = await page.evaluate(() => {
    const after = window.readSizes();
    const copies = [...document.querySelectorAll("[data-truncate-full-text]")];
    for (const copy of copies) copy.style.display = "none";
    const withoutCopies = window.readSizes();
    for (const copy of copies) copy.style.display = "";
    return { before: window.sizesBefore, after, withoutCopies };
  });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(sizes.before, sizes.after)) fail(`overflow: scroll sizes changed with truncation ${JSON.stringify(sizes.before)} -> ${JSON.stringify(sizes.after)}`);
  if (!same(sizes.after, sizes.withoutCopies)) fail(`overflow: the copies change scroll sizes ${JSON.stringify(sizes.withoutCopies)} -> ${JSON.stringify(sizes.after)}`);

  step("flush");
  // (3b) A measured root flush against a scrolling box: its paint clip reaches
  // 1px past its sides, which must not make the box scroll.
  const flush = await page.evaluate(() => [...document.querySelectorAll("[data-flush]")].map((box) => ({
    index: box.dataset.flush,
    state: box.querySelector("[data-truncate]").dataset.truncateState ?? "fits",
    strategy: box.querySelector("[data-truncate]").dataset.truncateStrategy,
    scroll: [box.scrollWidth, box.clientWidth, box.scrollHeight, box.clientHeight],
  })));
  console.log(`[pointer ${browserName}] flush: ${JSON.stringify(flush)}`);
  for (const box of flush) {
    if (box.strategy !== "measure") fail(`flush ${box.index}: not measured (${box.strategy})`);
    if (box.scroll[0] > box.scroll[1] || box.scroll[2] > box.scroll[3]) fail(`flush ${box.index} (${box.state}): the box scrolls ${JSON.stringify(box.scroll)}`);
  }

  step("hit test");
  // (1) Hit testing over every pixel of each cell, and over each copy's own box.
  const hits = await page.evaluate(() => {
    const result = { points: 0, copyHits: 0, targets: {} };
    for (const cell of document.querySelectorAll("#scroller td")) {
      const box = cell.getBoundingClientRect();
      const copyBox = cell.querySelector("[data-truncate-full-text]").getBoundingClientRect();
      const points = [[copyBox.left + copyBox.width / 2, copyBox.top + copyBox.height / 2], [copyBox.left, copyBox.top]];
      for (let y = Math.ceil(box.top); y < box.bottom; y++) {
        for (let x = Math.ceil(box.left); x < box.right; x++) points.push([x, y]);
      }
      for (const [x, y] of points) {
        const hit = document.elementFromPoint(x, y);
        result.points++;
        if (hit?.closest("[data-truncate-full-text]")) result.copyHits++;
        const name = hit ? `${hit.tagName.toLowerCase()}${[...hit.attributes].filter((a) => a.name.startsWith("data-")).map((a) => `[${a.name}]`).join("")}` : "null";
        result.targets[name] = (result.targets[name] ?? 0) + 1;
      }
    }
    return result;
  });
  if (hits.copyHits) fail(`elementFromPoint returned the copy at ${hits.copyHits} of ${hits.points} points`);

  step("clicks");
  // (1) Clicks at the root's left, middle and right, and at the copy's box.
  await page.evaluate(() => {
    window.clicks = [];
    for (const cell of document.querySelectorAll("#scroller td")) {
      cell.addEventListener("click", (event) => {
        const target = event.target;
        const root = cell.querySelector("[data-truncate]");
        const kind = target === root ? "root"
          : target.closest?.("[data-truncate-visible]") ? (target.hasAttribute("data-truncate-visible") ? "visible" : "inside visible")
          : target.closest?.("[data-truncate-full-text]") ? "copy" : `other:${target.tagName}`;
        window.clicks.push(`${cell.dataset.cell}:${kind}`);
      });
    }
  });
  // The copy's 1px box sits 1px above and left of its place (margin: -1px), so over
  // the header row for the first row; the click goes to the nearest point inside the cell.
  const clamp = (value, low, high) => Math.min(Math.max(value, low + 0.5), high - 0.5);
  let expectedClicks = 0;
  const lost = [];
  for (const cell of cells) {
    const box = await rect(cell.id);
    const copyBox = await rect(cell.id, "[data-truncate-full-text]");
    const points = { left: [box.left + 2, box.top + box.height / 2], middle: [box.left + box.width / 2, box.top + box.height / 2], right: [box.right - 2, box.top + box.height / 2], copy: [clamp(copyBox.left + copyBox.width / 2, box.left, box.right), clamp(copyBox.top + copyBox.height / 2, box.top, box.bottom)] };
    for (const [where, [x, y]] of Object.entries(points)) {
      const before = await page.evaluate(() => window.clicks.length);
      await page.mouse.click(x, y);
      expectedClicks++;
      if (await page.evaluate(() => window.clicks.length) === before) {
        const at = await page.evaluate(([px, py]) => {
          const hit = document.elementFromPoint(px, py);
          return hit ? `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ""}` : "null";
        }, [x, y]);
        lost.push(`${cell.id} ${where} (${Math.round(x)},${Math.round(y)}) hits ${at}; cell ${JSON.stringify(box)} copy ${JSON.stringify(copyBox)}`);
      }
    }
  }
  const clicks = await page.evaluate(() => window.clicks);
  if (clicks.length !== expectedClicks) fail(`clicks: ${clicks.length} of ${expectedClicks} reached a cell handler: ${lost.join("; ")}`);
  for (const click of clicks) if (!/:(root|visible|inside visible)$/.test(click)) fail(`click target ${click}`);
  await clearSelection();

  step("double-click");
  // (2) Double- and triple-click: a plain paragraph first, as the control. Where the
  // engine's synthetic gestures select nothing even there, the gesture is not driveable
  // and is reported, not failed; the drag and select-all below still cover selection.
  const wordAt = (selector) => page.locator(selector).evaluate((element) => {
    const node = element.firstChild;
    const text = node.textContent;
    const end = text.indexOf(" ");
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, end);
    const { left, top, width, height } = range.getBoundingClientRect();
    return { text: text.slice(0, end), x: left + width / 2, y: top + height / 2 };
  });
  const gesture = async (point, clickCount) => {
    await page.mouse.move(point.x, point.y);
    await page.mouse.click(point.x, point.y, { clickCount });
    const selected = await selection();
    await clearSelection();
    // Past the engine's multi-click interval, so the next gesture starts a new count.
    await page.waitForTimeout(800);
    return selected;
  };
  const controlWord = await wordAt("#control");
  const controlDouble = await gesture(controlWord, 2);
  const controlTriple = await gesture(controlWord, 3);
  const doubleDriveable = controlDouble.trim() === controlWord.text;
  const tripleDriveable = controlTriple.includes("Control paragraph without truncation");

  const word = await wordAt('td[data-cell="1-0"] [data-truncate-visible]');
  const doubleClick = await gesture(word, 2);
  if (doubleDriveable && doubleClick.trim() !== word.text) fail(`double-click selected "${doubleClick}", expected "${word.text}"`);
  checkCopied("double-click", doubleClick, []);

  step("triple-click");
  const tripleBox = await rect("1-0");
  const triplePoint = { x: tripleBox.left + tripleBox.width / 2, y: tripleBox.top + tripleBox.height / 2 };
  const tripleClick = await gesture(triplePoint, 3);
  if (tripleDriveable) checkCopied("triple-click", tripleClick, ["1-0"]);
  else checkCopied("triple-click", tripleClick, []);
  await page.mouse.click(triplePoint.x, triplePoint.y, { clickCount: 3 });
  const tripleClipboard = await readClipboard();
  checkCopied("triple-click clipboard", tripleClipboard, tripleDriveable ? ["1-0"] : []);
  await clearSelection();
  await page.waitForTimeout(800);

  step("drag");
  // (2) A drag from the start of one cell to the end of the next.
  const from = await rect("1-0");
  const to = await rect("1-1");
  await page.mouse.move(from.left + 1, from.top + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.left + to.width / 2, to.top + to.height / 2, { steps: 8 });
  await page.mouse.move(to.right - 1, to.top + to.height / 2, { steps: 4 });
  await page.mouse.up();
  const drag = await selection();
  checkCopied("drag", drag, []);
  if (!drag.includes(cells.find((c) => c.id === "1-1").visible.slice(0, 6))) fail(`drag did not reach the second cell: "${drag}"`);
  const dragClipboard = await readClipboard();
  checkCopied("drag clipboard", dragClipboard, []);
  await clearSelection();

  step("select-all");
  // (2) Select all.
  await page.mouse.click(700, 500);
  await page.keyboard.press("ControlOrMeta+A");
  const selectAll = await selection();
  checkCopied("select-all", selectAll, cells.map((c) => c.id));
  const selectAllClipboard = await readClipboard();
  checkCopied("select-all clipboard", selectAllClipboard, cells.map((c) => c.id));
  await clearSelection();

  step("tab");
  // (4) Tab from the input before the table lands on the input after it.
  await page.focus("#before");
  await page.keyboard.press("Tab");
  const tabbedTo = await page.evaluate(() => {
    const active = document.activeElement;
    return active.id || `${active.tagName.toLowerCase()}${active.closest("[data-truncate-full-text]") ? " (copy)" : ""}`;
  });
  if (tabbedTo !== "after") fail(`Tab moved focus to ${tabbedTo}, expected the input after the table`);
  const focusableInside = await page.evaluate(() =>
    [...document.querySelectorAll("[data-truncate] *")].filter((element) => element.tabIndex >= 0).length);
  if (focusableInside) fail(`${focusableInside} focusable elements inside truncated text`);

  const report = {
    browser: `${browserName}/${browser.version()}`,
    cells,
    sizes,
    hits,
    clicks,
    doubleClick: { word: word.text, selected: doubleClick, control: controlDouble, driveable: doubleDriveable },
    tripleClick: { selected: tripleClick, clipboard: tripleClipboard, control: controlTriple, driveable: tripleDriveable },
    drag: { selected: drag, clipboard: dragClipboard },
    selectAll: { selected: selectAll, clipboard: selectAllClipboard },
    tab: { tabbedTo, focusableInside },
    failures,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  const show = JSON.stringify;
  console.log(report.browser);
  console.log(`hit test: ${hits.points} points, copy hits ${hits.copyHits}, targets ${JSON.stringify(hits.targets)}`);
  console.log(`clicks: ${clicks.length}/${expectedClicks} ${[...new Set(clicks.map((c) => c.split(":")[1]))].join(", ")}`);
  const driven = (ok) => (ok ? "" : " (not driveable: the control selected nothing)");
  console.log(`double-click "${word.text}": ${show(doubleClick)} control=${show(controlDouble)}${driven(doubleDriveable)}`);
  console.log(`triple-click: ${show(tripleClick)} clipboard=${show(tripleClipboard)} control=${show(controlTriple)}${driven(tripleDriveable)}`);
  console.log(`drag: ${show(drag)} clipboard=${show(dragClipboard)}`);
  console.log(`select-all: ${show(selectAll)} clipboard=${show(selectAllClipboard)}`);
  console.log(`overflow: before=${JSON.stringify(sizes.before.scroller)} after=${JSON.stringify(sizes.after.scroller)} without copies=${JSON.stringify(sizes.withoutCopies.scroller)} cells equal=${same(sizes.before.cells, sizes.after.cells) && same(sizes.after.cells, sizes.withoutCopies.cells)}`);
  console.log(`tab: ${tabbedTo}, focusable inside=${focusableInside}`);
  console.log(failures.length ? `FAIL\n- ${failures.join("\n- ")}` : "PASS");
  if (failures.length) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
