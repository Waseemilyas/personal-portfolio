// Eleventy config for WI-PF1 — Waseem Ilyas portfolio.
// Source in src/, static output in _site/. No client framework; pure HTML/CSS/vanilla JS.
import { lstatSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { revision } from "./scripts/revision.mjs";
import { addShareCards } from "./scripts/og-cards.mjs";
import { scriptIntegrity, withPolicy } from "./scripts/csp.mjs";
import { STYLESHEET, inlineStylesheet, readStylesheet } from "./scripts/inline-css.mjs";
import monitoring from "./src/_data/monitoring.js";

const INPUT = "src";
const OUTPUT = "_site";
const SITE_SCRIPT_URL = "/assets/js/site.js";
const SITE_SCRIPT = `${INPUT}${SITE_SCRIPT_URL}`;

/**
 * Only the Eleventy boundary used here; page data comes from front matter.
 * @typedef {{data: {order?: number, draft?: boolean}, date: Date}} CollectionItem
 * @param {{
 * on: Parameters<typeof addShareCards>[0]["on"],
 * addGlobalData(name: string, value: string): void,
 * addPassthroughCopy(paths: Record<string, string>): void,
 * addCollection(name: string, collect: (api: {getFilteredByTag(tag: string): CollectionItem[]}) => CollectionItem[]): void,
 * addFilter(name: string, filter: (value: string, ...args: string[]) => string): void,
 * addTransform(name: string, transform: (this: {page: {outputPath: string | false, url: string}}, content: string) => string): void,
 * addWatchTarget(path: string): void
 * }} eleventyConfig
 */
export default function (eleventyConfig) {
  addShareCards(eleventyConfig);
  eleventyConfig.addGlobalData("siteRevision", revision());

  // Static passthrough: assets, plus the root-level files GitHub Pages needs.
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });
  // The pinned Sentry SDK, fetched by pages only after an error (src/_data/monitoring.js).
  eleventyConfig.addPassthroughCopy({ [`vendor/${monitoring.sdkFile}`]: `assets/js/${monitoring.sdkFile}` });
  // Prayer-time audio fetched over HTTP by Home Assistant; intentional, do not remove (see audio/README.md).
  eleventyConfig.addPassthroughCopy({ "audio/*.mp3": "audio" });

  // Case studies collection (datasheet narratives in src/work/).
  eleventyConfig.addCollection("casestudies", (api) =>
    api.getFilteredByTag("casestudy").sort((a, b) => (a.data.order || 0) - (b.data.order || 0))
  );

  // Notes collection — published (non-draft) posts, newest first.
  eleventyConfig.addCollection("notes", (api) =>
    api
      .getFilteredByTag("note")
      .filter((item) => !item.data.draft)
      .sort((a, b) => b.date.getTime() - a.date.getTime())
  );

  // Readable date filter for notes/feed.
  eleventyConfig.addFilter("isoDate", (d) => new Date(d).toISOString());
  eleventyConfig.addFilter("readableDate", (d) =>
    new Date(d).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })
  );

  // Every email link opens with a subject, so mail that came from the site can be
  // counted and found in the inbox without any tracking on the site itself.
  eleventyConfig.addFilter("mailto", (email, subject = "Hello from waseemilyas.uk") =>
    `mailto:${email}?subject=${encodeURIComponent(subject)}`
  );

  // Every page carries the stylesheet inline, so nothing blocks its first paint
  // (scripts/inline-css.mjs). Read once per build; a stylesheet edit rebuilds pages.
  let css = "";
  let siteScriptIntegrity = "";
  eleventyConfig.on("eleventy.before", () => {
    css = readStylesheet();
    siteScriptIntegrity = scriptIntegrity(readFileSync(SITE_SCRIPT));
  });
  eleventyConfig.addWatchTarget(STYLESHEET);
  eleventyConfig.addWatchTarget(SITE_SCRIPT);
  eleventyConfig.addTransform("inline-stylesheet", function (content) {
    const out = this.page.outputPath;
    return typeof out === "string" && out.endsWith(".html") ? inlineStylesheet(content, css) : content;
  });

  // The digest in the URL keeps a new page from reusing a cached copy of an older script.
  // The same digest in the tag and policy makes the browser check the bytes before running it.
  eleventyConfig.addTransform("content-security-policy", function (content) {
    const out = this.page.outputPath;
    if (typeof out !== "string" || !out.endsWith(".html")) return content;
    const html = content.replace(
      `<script src="${SITE_SCRIPT_URL}" defer></script>`,
      `<script src="${SITE_SCRIPT_URL}?v=${encodeURIComponent(siteScriptIntegrity)}" integrity="${siteScriptIntegrity}" defer></script>`,
    );
    return withPolicy(html, {
      connectOrigins: monitoring.cspConnectOrigins,
      scriptIntegrities: [siteScriptIntegrity, ...(monitoring.sentrySdkIntegrity ? [monitoring.sentrySdkIntegrity] : [])],
    });
  });

  // In a full build Eleventy reports every rendered page, but leaves obsolete HTML on disk.
  // Reconcile the generated pages after Eleventy finishes writing its templates.
  eleventyConfig.on("eleventy.after", ({ directories, incremental, outputMode, results }) => {
    if (incremental || outputMode !== "fs" || results.length === 0) return;
    if (directories.inputFile || directories.inputGlob || resolve(directories.input) !== resolve(INPUT)) return;
    // Eleventy 3.1 omits CLI template format overrides from the event.
    if (process.argv.some((arg) => /^--formats(?:=|$)/.test(arg))) return;
    const output = resolve(directories.output);
    if (output !== resolve(OUTPUT)) return;
    if (!lstatSync(output, { throwIfNoEntry: false })?.isDirectory()) return;

    const pages = new Set(results.map(({ outputPath }) => outputPath && resolve(outputPath)));
    for (const entry of readdirSync(output, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
      const file = join(entry.parentPath, entry.name);
      if (pages.has(file)) continue;

      unlinkSync(file);
      for (let dir = entry.parentPath; dir !== output && readdirSync(dir).length === 0; dir = dirname(dir)) {
        rmdirSync(dir);
      }
    }
  });

  return {
    dir: {
      input: INPUT,
      includes: "_includes",
      data: "_data",
      output: OUTPUT,
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"],
  };
}
