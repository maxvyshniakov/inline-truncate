// Records what assistive technology gets from TextTruncate in one engine and fails
// when a truncated element does not expose its full text.
//   node scripts/a11y/check.mjs --browser=<chromium|firefox|webkit>
// Accessible names come from three sources:
// - "engine": the browser's own accessibility tree. Chromium through CDP
//   Accessibility.getFullAXTree; Firefox through WebDriver BiDi
//   browsingContext.locateNodes with an accessibility locator (a match on the
//   full text, since BiDi cannot return the name). WebKit has no such API here.
// - "aria": Playwright's ARIA snapshot, its own implementation of accname.
// - copy and find: the selection string, the clipboard where the engine allows
//   it, and window.find for a word only the cut part of the text holds.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "vite";
import { chromium, firefox, webkit } from "playwright";

if (process.env.TMPDIR && process.env.TMPDIR.length > 60) process.env.TMPDIR = "/tmp";

const args = process.argv.slice(2);
const browserName = args.find((a) => a.startsWith("--browser="))?.slice(10) ?? "chromium";
const output = path.resolve(`artifacts/a11y/${browserName}.json`);
const CUT_WORD = "northern";

const systemFirefox = process.env.FIREFOX_PATH
  ?? { darwin: "/Applications/Firefox.app/Contents/MacOS/firefox", linux: "/snap/bin/firefox" }[process.platform];
const hasSystemFirefox = Boolean(systemFirefox && fs.existsSync(systemFirefox));

async function firefoxEngineMatches(url, cases) {
  // Prefer the stable Firefox that Playwright's moz-firefox channel launches;
  // fall back to Playwright's bundled Firefox when system Firefox is absent (e.g. ubuntu-latest CI).
  const executable = hasSystemFirefox ? systemFirefox : firefox.executablePath();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tt-a11y-ff-"));
  const child = spawn(executable, ["--headless", "--no-remote", "--profile", profile, "--remote-debugging-port=0"], { stdio: ["ignore", "ignore", "pipe"] });
  try {
    const wsUrl = await new Promise((resolve, reject) => {
      let buffer = "";
      const timer = setTimeout(() => reject(new Error("Firefox BiDi did not start")), 30_000);
      child.stderr.on("data", (chunk) => {
        buffer += chunk;
        const match = buffer.match(/WebDriver BiDi listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    const socket = new WebSocket(`${wsUrl}/session`);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextId = 0;
    const pending = new Map();
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id === undefined) return;
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.type === "error") reject(new Error(`${message.error}: ${message.message}`));
      else resolve(message.result);
    };
    const send = (method, params) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    await send("session.new", { capabilities: {} });
    const { contexts } = await send("browsingContext.getTree", {});
    const context = contexts[0].context;
    await send("browsingContext.navigate", { context, url, wait: "complete" });
    const evaluate = (expression) => send("script.evaluate", { expression, target: { context }, awaitPromise: true });
    for (let i = 0; i < 100; i++) {
      const { result } = await evaluate(settledExpression);
      if (result.value) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const located = {};
    for (const testCase of cases) {
      const found = await send("browsingContext.locateNodes", {
        context,
        locator: { type: "accessibility", value: { role: "cell", name: testCase.text } },
      });
      for (const node of found.nodes) {
        const { result } = await send("script.callFunction", {
          functionDeclaration: "(node) => node.dataset.case",
          arguments: [node],
          target: { context },
          awaitPromise: false,
        });
        located[result.value] = true;
      }
    }
    socket.close();
    return Object.fromEntries(cases.map((c) => [c.id, located[c.id] ? c.text : "(no cell has the full text as its name)"]));
  } finally {
    child.kill();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

const settledExpression = `(() => window.a11yCases?.every((c) => !c.expectTruncated
  || document.querySelector('[data-case="' + c.id + '"] [data-truncate]')?.dataset.truncateState === "truncated"))()`;

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: "error",
  server: { port: 0, host: "127.0.0.1", hmr: false, watch: null },
});
let browser;
try {
  await server.listen();
  const url = `${server.resolvedUrls.local[0]}scripts/a11y/index.html`;
  const launcher = { chromium, firefox, webkit }[browserName];
  if (!launcher) throw new Error(`Unsupported browser ${browserName}`);
  browser = await launcher.launch({ headless: true, ...(browserName === "firefox" && hasSystemFirefox ? { channel: "moz-firefox" } : {}) });
  const browserContext = await browser.newContext({ viewport: { width: 800, height: 600 } });
  if (browserName === "chromium") await browserContext.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await browserContext.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(settledExpression);
  const cases = await page.evaluate(() => window.a11yCases);

  const engineNames = {};
  if (browserName === "chromium") {
    const cdp = await browserContext.newCDPSession(page);
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const cells = nodes.filter((n) => n.role?.value === "cell");
    cases.forEach((c, i) => { engineNames[c.id] = cells[i]?.name?.value ?? null; });
  }

  const rows = [];
  for (const testCase of cases) {
    const cell = page.locator(`[data-case="${testCase.id}"]`);
    const snapshot = await cell.ariaSnapshot();
    const aria = snapshot.match(/^- cell "(.*)"/m)?.[1]?.replace(/\\"/g, '"') ?? snapshot;
    const dom = await cell.evaluate((element, word) => {
      const root = element.querySelector("[data-truncate]");
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const selected = selection.toString();
      selection.removeAllRanges();
      // Hide every other case so a match can only come from this cell. Chromium
      // moves the found selection out of a user-select: none node, so the anchor
      // says where the selection landed, not always which node matched.
      const others = [...document.querySelectorAll("table")].filter((table) => !table.contains(element));
      for (const table of others) table.style.display = "none";
      const before = document.createRange();
      before.setStart(document.body, 0);
      selection.addRange(before);
      const hit = window.find(word, false, false, false, false, false, false) ? selection.anchorNode : null;
      // A word the visible string also shows: how many matches find steps through.
      selection.removeAllRanges();
      selection.addRange(before);
      let visibleWordMatches = 0;
      while (visibleWordMatches < 5 && window.find("draft", false, false, false, false, false, false)) visibleWordMatches++;
      for (const table of others) table.style.display = "";
      const found = !hit ? "none"
        : (hit.nodeType === Node.ELEMENT_NODE ? hit : hit.parentElement)?.closest("[data-truncate-full-text]") ? "hidden copy"
        : "found";
      selection.removeAllRanges();
      const anchor = hit && (hit.nodeType === Node.ELEMENT_NODE ? hit : hit.parentElement);
      return {
        findAnchor: anchor ? `${anchor.tagName.toLowerCase()}${[...anchor.attributes].map((a) => `[${a.name}]`).join("")}` : null,
        state: root.dataset.truncateState ?? "",
        textContent: root.textContent,
        visibleText: root.querySelector(":scope > [aria-hidden='true']")?.textContent ?? root.textContent,
        elementsInside: root.querySelectorAll("*").length,
        // What is painted as a match; "marker:" when the truncation marker carries it.
        highlights: Array.from(root.querySelectorAll("[data-slot='highlighted-match']"), (match) =>
          `${match.hasAttribute("data-truncate-marker") ? "marker:" : ""}${match.textContent}`),
        overflow: root.scrollWidth - root.clientWidth,
        selected,
        found,
        visibleWordMatches,
      };
    }, CUT_WORD);
    let clipboard = null;
    if (browserName === "chromium") {
      await cell.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      });
      await page.keyboard.press("ControlOrMeta+C");
      clipboard = await page.evaluate(() => navigator.clipboard.readText());
      await page.evaluate(() => getSelection().removeAllRanges());
    }
    rows.push({ id: testCase.id, text: testCase.text, expectTruncated: testCase.expectTruncated, expectMarker: testCase.expectMarker, engine: engineNames[testCase.id] ?? null, aria, clipboard, ...dom });
  }

  // A re-measure that ends untruncated must remove the hidden copy.
  await page.locator('[data-case="middle-regrow"]').evaluate((element) => { element.querySelector("[data-truncate]").style.width = "2000px"; });
  await page.waitForFunction(() => !document.querySelector('[data-case="middle-regrow"] [data-truncate]').dataset.truncateState);
  const regrown = await page.locator('[data-case="middle-regrow"] [data-truncate]').evaluate((root) => ({
    elementsInside: root.querySelectorAll("*").length,
    textContent: root.textContent,
  }));

  if (browserName === "firefox") {
    const matches = await firefoxEngineMatches(url, cases);
    for (const row of rows) row.engine = matches[row.id];
  }

  const failures = [...errors];
  for (const row of rows) {
    const truncated = row.state === "truncated";
    if (row.expectTruncated !== truncated) failures.push(`${row.id}: expected truncated=${row.expectTruncated}, got state "${row.state}"`);
    const engineReports = browserName === "chromium" || browserName === "firefox";
    if (engineReports && row.engine === null) failures.push(`${row.id}: the engine reported no cell`);
    if (row.engine !== null && row.engine !== row.text) failures.push(`${row.id}: engine name "${row.engine}"`);
    if (row.aria !== row.text) failures.push(`${row.id}: ARIA snapshot name "${row.aria}"`);
    for (const [label, copied] of [["selection", row.selected], ["clipboard", row.clipboard]]) {
      if (copied !== null && copied.split(row.text).length > 2) failures.push(`${row.id}: ${label} holds the full text twice`);
      if (copied !== null && truncated && copied.includes(row.text) && copied.includes(row.visibleText)) failures.push(`${row.id}: ${label} holds both strings`);
    }
    if (row.expectMarker && !row.highlights.some((match) => match.startsWith("marker:"))) failures.push(`${row.id}: the marker is not highlighted for a cut match (${JSON.stringify(row.highlights)})`);
    if (truncated && row.overflow > 0) failures.push(`${row.id}: the visible string overflows by ${row.overflow}px`);
    if (!truncated && row.elementsInside !== 0 && !row.id.includes("highlight")) failures.push(`${row.id}: ${row.elementsInside} extra elements while not truncated`);
  }
  if (regrown.elementsInside !== 0) failures.push(`middle-regrow: ${regrown.elementsInside} elements left after the text fits`);

  const report = { browser: `${browserName}/${browser.version()}`, rows, regrown, failures };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(report.browser);
  for (const row of rows) {
    console.log(`${row.id} [${row.state || "fits"}] visible="${row.visibleText}" engine=${JSON.stringify(row.engine)} aria="${row.aria}" selection="${row.selected}" clipboard=${JSON.stringify(row.clipboard)} find(${CUT_WORD})=${row.found} find(draft)=${row.visibleWordMatches} elements=${row.elementsInside} highlights=${JSON.stringify(row.highlights)} overflow=${row.overflow}`);
  }
  console.log(`middle-regrow after fit: elements=${regrown.elementsInside}`);
  console.log(failures.length ? `FAIL\n- ${failures.join("\n- ")}` : "PASS");
  if (failures.length) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
