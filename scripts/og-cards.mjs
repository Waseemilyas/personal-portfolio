// Social preview cards are built from the rendered pages in Eleventy's normal
// build/watch loop. No generated source images or duplicate text manifest.
// Rendering needs Chromium (CHROME=/path/to/chrome to choose one).

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";

const FONT_DIR = "src/assets/fonts";

/** @typedef {{label: string, title: string, subtitle: string}} CardText */

/** The default card: the home page's own headline. */
const DEFAULT_CARD = {
  label: "Waseem Ilyas / UK",
  title: "Technologist who designs, builds, teaches, and <em>automates.</em>",
  subtitle: "Automancer — AI &amp; automation for small businesses",
  footer: "waseem@automancer.uk",
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Collapse whitespace the way a reader sees it. @param {string | null | undefined} s */
const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * The card text for a built page, or null when the page uses the default card.
 * Notes and case studies get their own; everything else shares the default.
 * @param {Document} doc
 * @param {string} url the page's path, e.g. "/notes/some-note/"
 * @returns {CardText | null}
 */
export function cardText(doc, url) {
  const title = clean(doc.querySelector("h1")?.textContent);
  if (/^\/notes\/[^/]+\/$/.test(url)) {
    const iso = doc.querySelector(".casehead time")?.getAttribute("datetime") ?? "";
    const d = new Date(iso);
    const date = Number.isNaN(d.getTime()) ? "" : ` · ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    return { label: `Note${date}`, title, subtitle: "" };
  }
  if (/^\/work\/[^/]+\/$/.test(url)) {
    const ref = clean(doc.querySelector(".casehead .ref")?.textContent);
    return { label: `Case study${ref ? ` · ${ref}` : ""}`, title, subtitle: clean(doc.querySelector(".casehead .kick")?.textContent) };
  }
  return null;
}

/** Where a page's card lives in the built site. @param {string} url */
export const cardImage = (url) => `/assets/img/og/${url.split("/").filter(Boolean).join("-")}.png`;

/** The card's alternative text: what the picture says, as sentences. @param {CardText} t */
export const cardAlt = (t) =>
  [t.label, t.title, t.subtitle].filter(Boolean).map((s) => (/[.?!]$/.test(s) ? s : `${s}.`)).join(" ");

/** @param {string} s */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * One self-contained card page: fonts inlined, nothing fetched.
 * @param {{label: string, title: string, subtitle: string, footer?: string}} card HTML-safe strings
 */
function cardHtml(card) {
  const font = (/** @type {string} */ f) => `data:font/woff2;base64,${readFileSync(join(FONT_DIR, f)).toString("base64")}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Geist"; src: url(${font("Geist-Variable.woff2")}) format("woff2"); font-weight: 100 900; }
@font-face { font-family: "Geist Mono"; src: url(${font("GeistMono-Variable.woff2")}) format("woff2"); font-weight: 100 900; }
:root { --graphite-900: oklch(0.17 0.008 65); --bone: oklch(0.93 0.006 75);
  --bone-mute: oklch(0.70 0.008 70); --signal: oklch(0.66 0.185 42); }
* { margin: 0; box-sizing: border-box; }
html, body { width: 1200px; height: 630px; overflow: hidden; }
body { font-family: "Geist", sans-serif; color: var(--bone); -webkit-font-smoothing: antialiased; position: relative;
  background:
    linear-gradient(oklch(1 0 0 / 0.045) 1px, transparent 1px) 0 0 / 54px 54px,
    linear-gradient(90deg, oklch(1 0 0 / 0.045) 1px, transparent 1px) 0 0 / 54px 54px,
    var(--graphite-900); }
.reg { position: absolute; width: 30px; height: 30px; }
.reg::before, .reg::after { content: ""; position: absolute; background: oklch(1 0 0 / 0.38); }
.reg::before { left: 14px; top: 0; width: 2px; height: 30px; } .reg::after { top: 14px; left: 0; height: 2px; width: 30px; }
.card { position: absolute; inset: 0; padding: 92px 80px 70px; display: flex; flex-direction: column; }
.label { font-family: "Geist Mono", monospace; font-weight: 500; font-size: 25px; letter-spacing: .16em; text-transform: uppercase; color: var(--signal); }
.title { margin-top: 34px; font-weight: 700; line-height: 1.04; letter-spacing: -0.03em; text-wrap: balance; max-width: 1040px; }
.title em { font-style: normal; color: var(--signal); }
.subtitle { margin-top: 26px; font-size: 29px; line-height: 1.3; color: var(--bone-mute); max-width: 1000px; }
.foot { margin-top: auto; display: flex; justify-content: space-between; align-items: baseline; }
.word { font-weight: 700; font-size: 30px; letter-spacing: -0.02em; } .word b { color: var(--signal); }
.url { font-family: "Geist Mono", monospace; font-size: 23px; letter-spacing: .04em; color: var(--bone-mute); }
</style></head><body>
<i class="reg" style="left:41px;top:39px"></i><i class="reg" style="right:41px;top:39px"></i>
<i class="reg" style="left:41px;bottom:39px"></i><i class="reg" style="right:41px;bottom:39px"></i>
<div class="card">
  <div class="label">${card.label}</div>
  <h1 class="title">${card.title}</h1>
  ${card.subtitle ? `<p class="subtitle">${card.subtitle}</p>` : ""}
  <div class="foot">${card.footer
    ? `<span class="url">${card.footer}</span>`
    : `<span class="word">Waseem Ilyas<b>.</b></span><span class="url">waseemilyas.uk</span>`}</div>
</div></body></html>`;
}

// Largest title size that keeps the title to three lines and the text clear of the footer.
const FIT_TITLE = `(async () => {
  await document.fonts.ready;
  const t = document.querySelector(".title"), foot = document.querySelector(".foot");
  const last = document.querySelector(".subtitle") || t;
  for (let size = 92; size >= 44; size -= 2) {
    t.style.fontSize = size + "px";
    const lines = Math.round(t.getBoundingClientRect().height / (size * 1.04));
    if (lines <= 3 && foot.getBoundingClientRect().top - last.getBoundingClientRect().bottom >= 44) return size;
  }
  return 44;
})()`;

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const name of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    const found = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).stdout.trim();
    if (found) return found;
  }
  throw new Error("No Chromium found: set CHROME=/path/to/chrome");
}

/**
 * Launch headless Chromium and return its DevTools ws:// address.
 * @param {string} executable @param {number} timeoutMs
 * @returns {Promise<{chrome: import("node:child_process").ChildProcess, wsUrl: string, profile: string}>}
 */
function launchChrome(executable, timeoutMs) {
  const profile = mkdtempSync(join(tmpdir(), "og-cards-"));
  const chrome = spawn(executable, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    // Hosted CI restricts user namespaces; this browser renders only our inlined card HTML.
    ...(process.env.CI ? ["--no-sandbox"] : []),
    "--no-first-run", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  return new Promise((resolve, reject) => {
    let log = "";
    const fail = (/** @type {Error} */ error) => {
      clearTimeout(timer);
      chrome.kill();
      const done = () => { rmSync(profile, { recursive: true, force: true }); reject(error); };
      if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) chrome.once("exit", done);
      else done();
    };
    const timer = setTimeout(() => fail(new Error(`Chromium gave no DevTools address:\n${log}`)), timeoutMs);
    chrome.once("error", (error) => fail(error));
    chrome.once("exit", (code) => fail(new Error(`Chromium exited before rendering (${code}):\n${log}`)));
    chrome.stderr?.on("data", (d) => {
      log += d;
      const m = log.match(/ws:\/\/\S+/);
      if (m) { clearTimeout(timer); chrome.removeAllListeners("exit"); chrome.removeAllListeners("error"); resolve({ chrome, wsUrl: m[0], profile }); }
    });
  });
}

/**
 * Render card pages to PNG buffers in one headless Chromium.
 * @param {string[]} pages
 * @returns {Promise<Buffer[]>}
 */
async function render(pages) {
  const executable = findChrome();
  // A stalled first launch (seen on hosted CI: only dbus noise on stderr) is
  // retried once with a longer budget before the build is allowed to fail.
  /** @type {Awaited<ReturnType<typeof launchChrome>> | undefined} */
  let launched;
  /** @type {unknown} */
  let lastError;
  for (const timeout of [20_000, 60_000]) {
    try { launched = await launchChrome(executable, timeout); break; }
    catch (error) { lastError = error; console.warn(`Chromium launch failed, ${timeout === 20_000 ? "retrying once" : "giving up"}:`, error); }
  }
  if (!launched) throw lastError;
  const { chrome, wsUrl, profile } = launched;
  let socket;
  try {
    const ws = socket = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let seq = 0;
    /** @type {Map<number, {resolve: (v: any) => void, reject: (e: Error) => void}>} */
    const waiting = new Map();
    ws.onclose = () => {
      for (const w of waiting.values()) w.reject(new Error("Chromium connection closed"));
      waiting.clear();
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      if (m.error) w.reject(new Error(m.error.message)); else w.resolve(m.result);
    };
    /** @param {string} method @param {object} [params] @param {string} [sessionId] @returns {Promise<any>} */
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`Chromium timed out: ${method}`)); }, 15_000);
      const finish = (/** @type {any} */ value) => { clearTimeout(timer); resolve(value); };
      const fail = (/** @type {Error} */ error) => { clearTimeout(timer); reject(error); };
      waiting.set(id, { resolve: finish, reject: fail });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false }, sessionId);
    const { frameTree } = await send("Page.getFrameTree", {}, sessionId);
    /** @type {Buffer[]} */
    const shots = [];
    for (const html of pages) {
      await send("Page.setDocumentContent", { frameId: frameTree.frame.id, html }, sessionId);
      const fit = await send("Runtime.evaluate", { expression: FIT_TITLE, awaitPromise: true, returnByValue: true }, sessionId);
      if (fit.exceptionDetails) throw new Error(`Card layout failed: ${fit.exceptionDetails.text}`);
      const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } }, sessionId);
      shots.push(Buffer.from(data, "base64"));
    }
    ws.close();
    return shots;
  } finally {
    socket?.close();
    chrome.kill();
    await new Promise((r) => (chrome.pid && chrome.exitCode === null && chrome.signalCode === null ? chrome.once("exit", r) : r(null)));
    rmSync(profile, { recursive: true, force: true });
  }
}

// A 256-colour palette keeps flat text art visually identical at about a sixth of the bytes.
const QUANTIZE = `import sys
from PIL import Image
for path in sys.argv[1:]:
    image = Image.open(path).convert("RGB")
    image.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)`;

/** Shrink the PNGs with Pillow when it is installed; otherwise leave them full colour. @param {string[]} files */
function squeeze(files) {
  const run = spawnSync("python3", ["-I", "-c", QUANTIZE, ...files], { encoding: "utf8" });
  if (run.status !== 0) console.warn(`Cards left unquantized (python3 with Pillow not available):\n${run.stderr || run.error}`);
}

/**
 * Wire card metadata and PNGs into the same build that writes their pages.
 * @param {{
 * on(event: "eleventy.before", callback: () => void): void,
 * on(event: "eleventy.after", callback: (event: {directories: {output: string}, incremental: boolean}) => Promise<void>): void,
 * addTransform(name: string, transform: (this: {page: {outputPath: string | false, url: string}}, content: string) => string): void
 * }} config
 */
export function addShareCards(config) {
  /** @type {Map<string, string>} */
  const cards = new Map();
  // Watch builds reuse unchanged images, but a fresh build needs no saved cache.
  /** @type {Map<string, string>} */
  const rendered = new Map();
  config.on("eleventy.before", () => {
    cards.clear();
    cards.set("/assets/img/og-card.png", cardHtml(DEFAULT_CARD));
  });
  config.addTransform("share-card", function (content) {
    if (!this.page.outputPath || !this.page.outputPath.endsWith(".html")) return content;
    const dom = new JSDOM(content);
    try {
      const doc = dom.window.document;
      const text = cardText(doc, this.page.url);
      if (!text) return content;
      if (!text.title) throw new Error(`${this.page.url} has no <h1> to put on its card`);
      const image = cardImage(this.page.url);
      cards.set(image, cardHtml({ label: esc(text.label), title: esc(text.title), subtitle: esc(text.subtitle) }));
      const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
      if (!canonical) throw new Error(`${this.page.url} has no canonical URL`);
      const url = new URL(image, canonical).href;
      // Replace only metadata, leaving inline script bytes (and CSP hashes) intact.
      return content.replace(/(<meta (?:property|name)="(?:og|twitter):image(:alt)?" content=")[^"]*(")/g,
        (_match, start, alt, end) => `${start}${esc(alt ? cardAlt(text) : url)}${end}`);
    } finally {
      dom.window.close();
    }
  });
  config.on("eleventy.after", async ({ directories, incremental }) => {
    const changed = [...cards].filter(([image, html]) => rendered.get(image) !== html || !existsSync(join(directories.output, image)));
    if (changed.length) {
      const shots = await render(changed.map(([, html]) => html));
      const targets = changed.map(([image]) => join(directories.output, image));
      mkdirSync(join(directories.output, "assets/img/og"), { recursive: true });
      shots.forEach((png, i) => writeFileSync(targets[i], png));
      squeeze(targets);
      for (const [image, html] of changed) rendered.set(image, html);
    }
    // A full rebuild also removes cards for articles that were deleted or drafted.
    // Incremental builds only know the pages they rebuilt, so retain other cards.
    const cardDir = join(directories.output, "assets/img/og");
    if (!incremental && existsSync(cardDir)) {
      for (const file of readdirSync(cardDir)) {
        const image = `/assets/img/og/${file}`;
        if (file.endsWith(".png") && !cards.has(image)) {
          unlinkSync(join(cardDir, file));
          rendered.delete(image);
        }
      }
    }
    console.log(`[share cards] Rendered ${changed.length} PNGs.`);
  });
}
