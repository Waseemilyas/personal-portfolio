// Social preview cards are built from the rendered pages in Eleventy's normal
// build/watch loop. No generated source images or duplicate text manifest.
// GitHub Actions uses Chrome for Testing. Local builds find Chromium or use CHROME.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";

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

/** @typedef {import("parse5").DefaultTreeAdapterTypes.Node} HtmlNode */
/** @typedef {import("parse5").DefaultTreeAdapterTypes.Element} HtmlElement */

// Cards read a few fields from each rendered page. parse5 is the HTML parser jsdom itself
// uses, without the DOM around it: jsdom costs about 1.5 s to load in every build process,
// parse5 about 50 ms, and it parses a page in about 5 ms instead of 35 ms.

/** @param {HtmlNode} node @returns {node is HtmlElement} */
const isElement = (node) => "tagName" in node;

/** @param {HtmlElement} el @param {string} name */
const attr = (el, name) => el.attrs.find((a) => a.name === name)?.value ?? null;

/** @param {HtmlElement} el @param {string} name */
const hasClass = (el, name) => (attr(el, "class") ?? "").split(/\s+/).includes(name);

/**
 * The first element in document order that matches, like querySelector. With `within`,
 * the element must also sit inside an element that matches `within` (a descendant selector).
 * @param {HtmlNode} node @param {(el: HtmlElement) => boolean} match
 * @param {(el: HtmlElement) => boolean} [within] @returns {HtmlElement | null}
 */
function find(node, match, within, inside = !within) {
  // A <template>'s children sit in its content, which querySelector does not search either.
  for (const child of "childNodes" in node ? node.childNodes : []) {
    if (!isElement(child)) continue;
    if (inside && match(child)) return child;
    const found = find(child, match, within, inside || Boolean(within?.(child)));
    if (found) return found;
  }
  return null;
}

/** Text of an element and its descendants, like textContent. @param {HtmlNode | null} node @returns {string} */
const textOf = (node) => !node ? "" : node.nodeName === "#text" && "value" in node ? node.value
  : "childNodes" in node ? node.childNodes.map(textOf).join("") : "";

/** True for the pages that get a card of their own: notes and case studies. @param {string} url */
const ownCard = (url) => /^\/(notes|work)\/[^/]+\/$/.test(url);

/**
 * The card text for a built page, or null when the page uses the default card.
 * Notes and case studies get their own; everything else shares the default.
 * @param {string} html the rendered page
 * @param {string} url the page's path, e.g. "/notes/some-note/"
 * @returns {CardText | null}
 */
export const cardText = (html, url) => (ownCard(url) ? readCard(parse(html), url) : null);

/** @param {HtmlNode} doc a parsed note or case study @param {string} url @returns {CardText} */
function readCard(doc, url) {
  const casehead = (/** @type {HtmlElement} */ el) => hasClass(el, "casehead");
  const title = clean(textOf(find(doc, (el) => el.tagName === "h1")));
  if (url.startsWith("/notes/")) {
    const time = find(doc, (el) => el.tagName === "time", casehead);
    const iso = time ? attr(time, "datetime") ?? "" : "";
    const d = new Date(iso);
    const date = Number.isNaN(d.getTime()) ? "" : ` · ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    return { label: `Note${date}`, title, subtitle: "" };
  }
  const ref = clean(textOf(find(doc, (el) => hasClass(el, "ref"), casehead)));
  return { label: `Case study${ref ? ` · ${ref}` : ""}`, title, subtitle: clean(textOf(find(doc, (el) => hasClass(el, "kick"), casehead))) };
}

/** The page's canonical URL. @param {HtmlNode} doc */
const canonicalOf = (doc) => {
  const link = find(doc, (el) => el.tagName === "link" && attr(el, "rel") === "canonical");
  return link && attr(link, "href");
};

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

const HOSTED_CHROME = process.env.GITHUB_ACTIONS === "true" && !process.env.CHROME
  ? fileURLToPath(new URL("./chrome-for-testing.sh", import.meta.url))
  : null;

/**
 * Playwright's browsers in its caches (~/.cache on Linux, ~/Library/Caches on a Mac), newest
 * build first: the executables of every `<prefix>-<build>` folder that `paths` names.
 * @param {string} prefix @param {(dir: string) => string[]} paths
 */
function playwrightBrowsers(prefix, paths) {
  const folder = new RegExp(`^${prefix}-(\\d+)$`);
  return [join(homedir(), ".cache/ms-playwright"), join(homedir(), "Library/Caches/ms-playwright")]
    .filter((cache) => existsSync(cache))
    .flatMap((cache) => readdirSync(cache)
      .map((dir) => ({ dir, build: Number(folder.exec(dir)?.[1]) }))
      .filter(({ build }) => build > 0)
      .sort((a, b) => b.build - a.build)
      .flatMap(({ dir }) => paths(join(cache, dir))));
}

/** @param {string} name */
const onPath = (name) => spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).stdout.trim();

const MAC_ARCHES = ["arm64", "x64"];

/**
 * The browser that draws the cards. A headless shell comes first wherever one is installed:
 * it is the build CI pins, starts in about a second and has no desktop parts to stall on.
 * Full Chrome is the fallback; on a Mac, Playwright's full Chromium once never answered and
 * held a build for 12 minutes, while its headless shell drew every card in 2.7 s.
 */
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  if (HOSTED_CHROME) {
    return execFileSync("bash", [HOSTED_CHROME], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      timeout: 120_000,
    }).trim();
  }
  const shell = onPath("chrome-headless-shell");
  if (shell) return shell;
  const candidates = [
    ...playwrightBrowsers("chromium_headless_shell", (dir) => [
      join(dir, "chrome-headless-shell-linux64/chrome-headless-shell"),
      ...MAC_ARCHES.map((arch) => join(dir, `chrome-headless-shell-mac-${arch}/chrome-headless-shell`)),
      join(dir, "chrome-linux/headless_shell"),
      join(dir, "chrome-mac/headless_shell"),
    ]),
    ...["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"].map(onPath).filter(Boolean),
    // macOS keeps browsers in app bundles, off PATH.
    ...["Google Chrome.app/Contents/MacOS/Google Chrome", "Chromium.app/Contents/MacOS/Chromium"]
      .flatMap((app) => [join("/Applications", app), join(homedir(), "Applications", app)]),
    ...playwrightBrowsers("chromium", (dir) => [
      ...MAC_ARCHES.map((arch) =>
        join(dir, `chrome-mac-${arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`)),
      join(dir, "chrome-linux64/chrome"),
      join(dir, "chrome-linux/chrome"),
    ]),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (found) return found;
  throw new Error("No Chromium found: install one (npx playwright install chromium-headless-shell) or set CHROME=/path/to/chrome");
}

/** @param {string} profile */
function removeProfile(profile) {
  // Chromium's children can still finish writing when the browser process exits.
  rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

/**
 * Launch headless Chromium and return its DevTools ws:// address.
 * @param {string} executable @param {number} timeoutMs @param {boolean} sandbox
 * @returns {Promise<{chrome: import("node:child_process").ChildProcess, wsUrl: string, profile: string}>}
 */
function launchChrome(executable, timeoutMs, sandbox) {
  const profile = mkdtempSync(join(tmpdir(), "og-cards-"));
  const chrome = spawn(executable, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    ...(sandbox ? [] : ["--no-sandbox"]),
    "--no-first-run", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  return new Promise((resolve, reject) => {
    let log = "";
    const fail = (/** @type {Error} */ error) => {
      clearTimeout(timer);
      chrome.kill();
      const done = () => { removeProfile(profile); reject(error); };
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
async function render(pages, timing = { start: 0, draw: 0, first: 0 }) {
  const executable = findChrome();
  const began = performance.now();
  // A stalled first launch (seen on hosted CI: only dbus noise on stderr) is
  // retried once with a longer budget before the build is allowed to fail.
  // Hosted CI and some agent machines refuse the user namespaces Chromium's sandbox
  // needs; there the browser runs without it, as it only ever draws our inlined card HTML.
  let sandbox = !process.env.CI;
  /** @type {Awaited<ReturnType<typeof launchChrome>> | undefined} */
  let launched;
  /** @type {unknown} */
  let lastError;
  for (const timeout of [60_000, 120_000]) {
    try { launched = await launchChrome(executable, timeout, sandbox); break; }
    catch (error) {
      lastError = error;
      if (sandbox && String(error).includes("No usable sandbox")) {
        sandbox = false;
        try { launched = await launchChrome(executable, timeout, sandbox); break; }
        catch (unsandboxed) { lastError = unsandboxed; }
      }
      console.warn(`Chromium launch failed, ${timeout === 60_000 ? "retrying once" : "giving up"}:`, lastError);
    }
  }
  if (!launched) throw lastError;
  const { chrome, wsUrl, profile } = launched;
  let socket;
  try {
    const ws = socket = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    timing.start = performance.now() - began;
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
      const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`Chromium timed out: ${method}`)); }, 60_000);
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
      if (shots.length === 1) timing.first = performance.now() - began - timing.start;
    }
    ws.close();
    timing.draw = performance.now() - began - timing.start;
    return shots;
  } finally {
    socket?.close();
    chrome.kill();
    await new Promise((r) => (chrome.pid && chrome.exitCode === null && chrome.signalCode === null ? chrome.once("exit", r) : r(null)));
    removeProfile(profile);
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
  return run.status === 0;
}

// Finished cards are kept by a hash of everything that decides their pixels: the card
// page (its text, styles and inlined fonts), the title-fitting script, the screenshot
// size, the compression and the pinned browser on GitHub Actions. CI and the Pages
// build restore this folder so they only fetch and start Chromium to draw new cards.
// Only compressed cards are kept, so a machine without Pillow
// never hands a full-colour card to one with it. Cards unused for 30 days are removed.
export const CARD_CACHE = "node_modules/.cache/share-cards";
const RENDERER = createHash("sha256")
  .update(`1200x630 srgb\n${FIT_TITLE}\n${QUANTIZE}`)
  .update(HOSTED_CHROME ? readFileSync(HOSTED_CHROME) : "")
  .digest("hex");
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/** The cache file for a card page. @param {string} html */
const cachedCard = (html) => join(CARD_CACHE, `${createHash("sha256").update(RENDERER).update(html).digest("hex").slice(0, 32)}.png`);

/** True when the file is a 1200 × 630 PNG. @param {string} file */
function isCard(file) {
  try {
    const png = readFileSync(file);
    return png.length > 24 && png.toString("latin1", 1, 4) === "PNG" && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630;
  } catch {
    return false;
  }
}

/** Copy the cached card for this page to target; false when none is kept. @param {string} html @param {string} target */
function reuse(html, target) {
  const file = cachedCard(html);
  if (!isCard(file)) return false;
  copyFileSync(file, target);
  const now = new Date();
  utimesSync(file, now, now);
  return true;
}

/** Remove kept cards that no build has used for KEEP_MS. */
function pruneCache() {
  if (!existsSync(CARD_CACHE)) return;
  for (const file of readdirSync(CARD_CACHE)) {
    const path = join(CARD_CACHE, file);
    if (Date.now() - statSync(path).mtimeMs > KEEP_MS) unlinkSync(path);
  }
}

/**
 * Wire card metadata and PNGs into the same build that writes their pages.
 * @param {{
 * on(event: "eleventy.before", callback: () => void): void,
 * on(event: "eleventy.after", callback: (event: {
 *   directories: {input: string, inputFile?: string, inputGlob?: string, output: string},
 *   dryRun: boolean,
 *   incremental: boolean,
 *   outputMode: string,
 *   results: {outputPath: string | false}[]
 * }) => void | Promise<void>): void,
 * addTransform(name: string, transform: (this: {page: {outputPath: string | false, url: string}}, content: string) => string): void
 * }} config
 */
export function addShareCards(config) {
  /** @type {Map<string, string>} */
  const cards = new Map();
  // Watch builds leave unchanged images alone; a fresh build copies them from CARD_CACHE.
  /** @type {Map<string, string>} */
  const rendered = new Map();
  config.on("eleventy.before", () => {
    cards.clear();
    cards.set("/assets/img/og-card.png", cardHtml(DEFAULT_CARD));
  });
  config.addTransform("share-card", function (content) {
    if (!this.page.outputPath || !this.page.outputPath.endsWith(".html")) return content;
    if (!ownCard(this.page.url)) return content;
    const doc = parse(content);
    const text = readCard(doc, this.page.url);
    if (!text.title) throw new Error(`${this.page.url} has no <h1> to put on its card`);
    const image = cardImage(this.page.url);
    cards.set(image, cardHtml({ label: esc(text.label), title: esc(text.title), subtitle: esc(text.subtitle) }));
    const canonical = canonicalOf(doc);
    if (!canonical) throw new Error(`${this.page.url} has no canonical URL`);
    const url = new URL(image, canonical).href;
    // Replace only metadata, leaving inline script bytes (and CSP hashes) intact.
    return content.replace(/(<meta (?:property|name)="(?:og|twitter):image(:alt)?" content=")[^"]*(")/g,
      (_match, start, alt, end) => `${start}${esc(alt ? cardAlt(text) : url)}${end}`);
  });
  config.on("eleventy.after", async ({ directories, incremental }) => {
    const changed = [...cards].filter(([image, html]) => rendered.get(image) !== html || !existsSync(join(directories.output, image)));
    mkdirSync(join(directories.output, "assets/img/og"), { recursive: true });
    const missing = changed.filter(([image, html]) => !reuse(html, join(directories.output, image)));
    const timing = { start: 0, draw: 0, first: 0, squeeze: 0 };
    if (missing.length) {
      const shots = await render(missing.map(([, html]) => html), timing);
      const targets = missing.map(([image]) => join(directories.output, image));
      shots.forEach((png, i) => writeFileSync(targets[i], png));
      const squeezing = performance.now();
      const squeezed = squeeze(targets);
      timing.squeeze = performance.now() - squeezing;
      if (squeezed) {
        mkdirSync(CARD_CACHE, { recursive: true });
        missing.forEach(([, html], i) => copyFileSync(targets[i], cachedCard(html)));
      }
    }
    for (const [image, html] of changed) rendered.set(image, html);
    if (!incremental) pruneCache();
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
    const s = (/** @type {number} */ ms) => (ms / 1000).toFixed(1);
    console.log(`[share cards] Rendered ${missing.length} PNGs, reused ${changed.length - missing.length}.` + (missing.length
      ? ` Chromium start ${s(timing.start)} s, render ${s(timing.draw)} s (first card ${s(timing.first)} s), compress ${s(timing.squeeze)} s.` : ""));
  });
}
