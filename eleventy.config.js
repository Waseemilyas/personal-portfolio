// Eleventy config for WI-PF1 — Waseem Ilyas portfolio.
// Source in src/, static output in _site/. No client framework; pure HTML/CSS/vanilla JS.
import { lstatSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { revision } from "./scripts/revision.mjs";
import { addShareCards } from "./scripts/og-cards.mjs";
import { scriptIntegrity, withPolicy } from "./scripts/csp.mjs";
import { STYLESHEET, inlineStylesheet, readStylesheet } from "./scripts/inline-css.mjs";
import { pruneCss } from "./scripts/prune-css.mjs";
import { minifyInlineScripts, minifySiteScript, siteScriptFile } from "./scripts/minify-js.mjs";
import { publicAssets } from "./scripts/public-assets.mjs";
import { articleSections } from "./scripts/article-sections.mjs";
import { commitDate, expiresFor } from "./scripts/security-txt.mjs";
import monitoring from "./src/_data/monitoring.js";

const INPUT = "src";
const OUTPUT = "_site";
const SITE_SCRIPT_URL = "/assets/js/site.js";
const SITE_SCRIPT = `${INPUT}${SITE_SCRIPT_URL}`;

/**
 * Only the Eleventy boundary used here; page data comes from front matter.
 * @typedef {{data: {order?: number, draft?: boolean}, date: Date}} CollectionItem
 * @param {{
 * on(event: "eleventy.before", callback: (build: {
 *   directories: {output: string}, dryRun: boolean, outputMode: string
 * }) => void): void,
 * on(event: "eleventy.after", callback: (build: {
 *   directories: {input: string, inputFile?: string, inputGlob?: string, output: string},
 *   dryRun: boolean, incremental: boolean, outputMode: string,
 *   results: {outputPath: string | false}[]
 * }) => Promise<void>): void,
 * addGlobalData(name: string, value: string): void,
 * addPassthroughCopy(paths: Record<string, string>): void,
 * addCollection(name: string, collect: (api: {getFilteredByTag(tag: string): CollectionItem[]}) => CollectionItem[]): void,
 * addFilter<T>(name: string, filter: (value: string, ...args: string[]) => T): void,
 * getFilter(name: "slugify"): (value: string) => string,
 * addTransform(name: string, transform: (this: {page: {outputPath: string | false, url: string}}, content: string) => string): void,
 * addWatchTarget(path: string): void
 * }} eleventyConfig
 */
export default function (eleventyConfig) {
  const writeShareCards = addShareCards(eleventyConfig);
  eleventyConfig.addGlobalData("siteRevision", revision());
  eleventyConfig.addGlobalData("securityTxtExpires", expiresFor(commitDate()));

  eleventyConfig.addPassthroughCopy(publicAssets);

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

  const slugify = eleventyConfig.getFilter("slugify");
  eleventyConfig.addFilter("articleSections", (html) => articleSections(html, slugify));

  // Every email link opens with a subject, so mail that came from the site can be
  // counted and found in the inbox without any tracking on the site itself.
  eleventyConfig.addFilter("mailto", (email, subject = "Hello from waseemilyas.uk") =>
    `mailto:${email}?subject=${encodeURIComponent(subject)}`
  );

  // Every page carries the stylesheet inline, so nothing blocks its first paint
  // (scripts/inline-css.mjs), less the rules it cannot use (scripts/prune-css.mjs).
  // Read once per build; a stylesheet or script edit rebuilds pages.
  let css = "";
  let siteScript = "";
  let siteScriptIntegrity = "";
  let published = { file: "", code: "", map: "" };
  eleventyConfig.on("eleventy.before", ({ directories, dryRun, outputMode }) => {
    css = readStylesheet();
    siteScript = readFileSync(SITE_SCRIPT, "utf8");
    published = minifySiteScript(siteScript);
    siteScriptIntegrity = scriptIntegrity(published.code);
    if (dryRun || outputMode !== "fs") return;
    // Put both files in place before Eleventy writes any page that references them.
    const file = join(directories.output, published.file);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, published.code);
    writeFileSync(`${file}.map`, published.map);
  });
  eleventyConfig.addWatchTarget(STYLESHEET);
  eleventyConfig.addWatchTarget(SITE_SCRIPT);
  eleventyConfig.addTransform("inline-stylesheet", function (content) {
    const out = this.page.outputPath;
    if (typeof out !== "string" || !out.endsWith(".html")) return content;
    return inlineStylesheet(content, pruneCss(css, content, siteScript));
  });

  // After pruning (which reads the scripts' class names from their source text) and
  // before the policy (which hashes the bytes the page ships).
  eleventyConfig.addTransform("minify-inline-scripts", function (content) {
    const out = this.page.outputPath;
    if (typeof out !== "string" || !out.endsWith(".html")) return content;
    return minifyInlineScripts(content);
  });

  eleventyConfig.addTransform("content-security-policy", function (content) {
    const out = this.page.outputPath;
    if (typeof out !== "string" || !out.endsWith(".html")) return content;
    const html = content.replace(
      `<script src="${SITE_SCRIPT_URL}" defer></script>`,
      `<script id="site-script" src="/${published.file}" integrity="${siteScriptIntegrity}" defer></script>`,
    );
    return withPolicy(html, {
      connectOrigins: monitoring.cspConnectOrigins,
      externalScriptIntegrities: [
        siteScriptIntegrity,
        ...(monitoring.sentrySdkIntegrity ? [monitoring.sentrySdkIntegrity] : []),
      ],
    });
  });

  eleventyConfig.on("eleventy.after", async ({ directories, dryRun, incremental, outputMode, results }) => {
    if (dryRun || outputMode !== "fs") return;

    // Only a complete build can decide which pages and cards are obsolete.
    // Eleventy's event omits CLI template format overrides.
    const complete = !incremental && !directories.inputFile && !directories.inputGlob &&
      resolve(directories.input) === resolve(INPUT) &&
      !process.argv.some((arg) => /^--formats(?:=|$)/.test(arg));
    await writeShareCards(directories.output, complete);

    if (!complete || results.length === 0) return;
    const output = resolve(directories.output);
    // Untouched pages may still need these files after a partial build.
    const scriptDir = dirname(published.file);
    for (const entry of readdirSync(join(output, scriptDir), { withFileTypes: true })) {
      const file = `${scriptDir}/${entry.name.replace(/\.map$/, "")}`;
      if (entry.isFile() && file !== published.file && (siteScriptFile.test(file) || `/${file}` === SITE_SCRIPT_URL)) {
        unlinkSync(join(output, scriptDir, entry.name));
      }
    }

    // Eleventy reports every page in a complete build and leaves old HTML on disk.
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
