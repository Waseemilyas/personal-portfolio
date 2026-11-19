// The site stylesheet, inlined into every page's <head>.
//
// A linked stylesheet blocks the first paint until a second request returns. On a
// phone on a slow mobile connection that is a whole extra round trip before anything
// shows. GitHub Pages also caches every file for only ten minutes, so a returning
// visitor waits for a blocking revalidation of the stylesheet on each page after that.
// Inlining it removes both waits. The stylesheet is small once its comments and
// spare whitespace are gone, and the page still fits the connection's first round trip.
//
// /assets/css/styles.css is still published, so a page cached from before this
// change still finds its stylesheet. The CSP lists the block by its SHA-256 hash
// (scripts/csp.mjs); site-check fails the build if any inline style is not listed.
import { readFileSync } from "node:fs";

export const STYLESHEET = "src/assets/css/styles.css";
export const LINK = '<link rel="stylesheet" href="/assets/css/styles.css">';

/**
 * Remove comments and spare whitespace. The stylesheet has no strings or URLs that
 * contain comment markers or runs of spaces (the test checks this stays true), so
 * this cannot change a value. Spaces around ":" are kept: in a selector they are a
 * descendant combinator.
 * @param {string} css
 */
export function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};,])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

/** @param {string} [path] */
export const readStylesheet = (path = STYLESHEET) => minifyCss(readFileSync(path, "utf8"));

/**
 * Replace the page's stylesheet link with the stylesheet itself.
 * @param {string} html a rendered page
 * @param {string} css the minified stylesheet
 */
export function inlineStylesheet(html, css) {
  if (!html.includes(LINK)) return html;
  if (/<\/style/i.test(css)) throw new Error("inline CSS: the stylesheet must not contain </style");
  return html.replace(LINK, () => `<style>${css}</style>`);
}
