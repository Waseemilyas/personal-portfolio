// Eleventy config for WI-PF1 — Waseem Ilyas portfolio.
// Source in src/, static output in _site/. No client framework; pure HTML/CSS/vanilla JS.
import { revision } from "./scripts/revision.mjs";
import { addShareCards } from "./scripts/og-cards.mjs";
import { withPolicy } from "./scripts/csp.mjs";
import monitoring from "./src/_data/monitoring.js";

/**
 * Only the Eleventy boundary used here; page data comes from front matter.
 * @typedef {{data: {order?: number, draft?: boolean}, date: Date}} CollectionItem
 * @param {{
 * on: Parameters<typeof addShareCards>[0]["on"],
 * addGlobalData(name: string, value: string): void,
 * addPassthroughCopy(paths: Record<string, string>): void,
 * addCollection(name: string, collect: (api: {getFilteredByTag(tag: string): CollectionItem[]}) => CollectionItem[]): void,
 * addFilter(name: string, filter: (value: string, ...args: string[]) => string): void,
 * addTransform(name: string, transform: (this: {page: {outputPath: string | false, url: string}}, content: string) => string): void
 * }} eleventyConfig
 */
export default function (eleventyConfig) {
  addShareCards(eleventyConfig);
  eleventyConfig.addGlobalData("siteRevision", revision());

  // Static passthrough: assets, plus the root-level files GitHub Pages needs.
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });
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

  // Every page carries a Content Security Policy that allows only this site's own
  // files, its inline scripts by hash, and Sentry when monitoring is configured.
  eleventyConfig.addTransform("content-security-policy", function (content) {
    const out = this.page.outputPath;
    return typeof out === "string" && out.endsWith(".html")
      ? withPolicy(content, { scriptOrigins: monitoring.cspScriptOrigins, connectOrigins: monitoring.cspConnectOrigins })
      : content;
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"],
  };
}
