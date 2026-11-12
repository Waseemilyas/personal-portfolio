#!/usr/bin/env node
// Contract checks for the built site in `_site/`. Read-only; exits 1 listing every violation.
//
//   revision    revision.txt is exactly the build SHA plus a newline; every page's
//               <meta name="waseemilyas-revision"> carries it
//   headings    one <h1> per page, no skipped levels
//   metadata    one description, one canonical (= the page's own URL) and one of each
//               og:title/description/url/type/image/image:width/height; og:url = canonical
//   jsonld      every application/ld+json block parses and has an @context
//   links       every same-site href/src resolves to a built file (a directory to its index.html)
//   text        no TODO/FIXME/lorem/[object Object]; no empty <h1-h3> or <p>
//   og-image    the og:image PNG header reports 1200x630, matching og:image:width/height
//   xml         sitemap.xml (urlset) and notes/feed.xml (Atom) parse as XML with the right root
//   sitemap     built pages and sitemap URLs match both ways (404.html is not listed)
//   drafts      a `draft: true` post has no built page and no sitemap/feed reference
//   csp         one Content Security Policy meta, first after <meta charset>, default-src 'none',
//               no 'unsafe-*', listing the hash of every inline script; no inline handlers
//               or style attributes (the policy would block them); a Referrer-Policy meta
//
// Usage: node scripts/site-check.mjs [--site-dir _site] [--posts-dir src/notes/posts]
//        [--site-url https://waseemilyas.uk] [--revision <sha>]

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

import { inlineScripts, scriptHash } from "./csp.mjs";
import { revision as buildRevision } from "./revision.mjs";

const OG_SIZE = { width: 1200, height: 630 };
const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const ATOM_NS = "http://www.w3.org/2005/Atom";

/** @param {string} file built path, e.g. "work/index.html" */
const urlPath = (file) =>
  file === "index.html" ? "/" : file.endsWith("/index.html") ? `/${file.slice(0, -10)}` : `/${file}`;

/** PNG width and height from the IHDR header; null when it is not a PNG. @param {Buffer} b */
function pngSize(b) {
  const isPng = b.length >= 24 && b.toString("latin1", 1, 4) === "PNG" && b.toString("latin1", 12, 16) === "IHDR";
  return isPng ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null;
}

/** Parse XML strictly: malformed input throws. @param {string} xml */
const parseXml = (xml) => new JSDOM(xml, { contentType: "application/xml" }).window.document;

/**
 * @param {object} options
 * @param {string} options.revision
 * @param {string} [options.siteDir]
 * @param {string} [options.postsDir]
 * @param {string} [options.siteUrl]
 * @returns {string[]} one line per violation, "check: file: message"
 */
export function runSiteChecks({
  revision,
  siteDir = "_site",
  postsDir = "src/notes/posts",
  siteUrl = "https://waseemilyas.uk",
}) {
  /** @type {string[]} */
  const failures = [];
  /** @param {string} check @param {string} file @param {string} message */
  const fail = (check, file, message) => failures.push(`${check}: ${file}: ${message}`);

  if (!existsSync(join(siteDir, "index.html"))) return [`build: ${siteDir}: no built site, run the build first`];
  /** @param {string} p */
  const exists = (p) => existsSync(join(siteDir, p));
  const read = (/** @type {string} */ p) => readFileSync(join(siteDir, p), "utf8");
  const origin = new URL(siteUrl).origin;

  if (!exists("revision.txt") || read("revision.txt") !== `${revision}\n`) {
    fail("revision", "revision.txt", `must be exactly ${revision} plus one newline`);
  }

  const pages = readdirSync(siteDir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".html")).sort();
  for (const page of pages) {
    const html = read(page);
    const doc = new JSDOM(html).window.document;
    const pagePath = urlPath(page);
    /** @param {string} check @param {string} message */
    const bad = (check, message) => fail(check, page, message);
    /** @param {string} selector */
    const metaContent = (selector) => [...doc.querySelectorAll(selector)].map((m) => m.getAttribute("content")?.trim() ?? "");

    const stamp = metaContent('meta[name="waseemilyas-revision"]');
    if (stamp.length !== 1 || stamp[0] !== revision) bad("revision", "revision meta missing, repeated or not this build");

    const levels = [...doc.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]));
    if (levels.filter((l) => l === 1).length !== 1) bad("headings", "expected exactly one <h1>");
    levels.forEach((l, i) => l > (levels[i - 1] ?? 1) + 1 && bad("headings", `heading ${i + 1} jumps to h${l}`));

    const canonical = [...doc.querySelectorAll('link[rel="canonical"]')].map((l) => l.getAttribute("href"));
    if (canonical.length !== 1 || canonical[0] !== siteUrl + pagePath) bad("metadata", `canonical must be ${siteUrl + pagePath}`);
    const once = (/** @type {string} */ selector) => {
      const found = metaContent(selector);
      if (found.length !== 1 || !found[0]) bad("metadata", `expected exactly one non-empty ${selector}`);
      return found[0];
    };
    once('meta[name="description"]');
    for (const p of ["title", "description", "type", "image", "image:width", "image:height"]) once(`meta[property="og:${p}"]`);
    if (once('meta[property="og:url"]') !== canonical[0]) bad("metadata", "og:url differs from canonical");

    const blocks = [...doc.querySelectorAll('script[type="application/ld+json"]')];
    if (!blocks.length) bad("jsonld", "no application/ld+json block");
    for (const block of blocks) {
      try {
        if (!("@context" in JSON.parse(block.textContent ?? ""))) bad("jsonld", "block has no @context");
      } catch {
        bad("jsonld", "block is not valid JSON");
      }
    }

    for (const el of doc.querySelectorAll("[href],[src]")) {
      const target = el.getAttribute("href") ?? el.getAttribute("src") ?? "";
      const url = new URL(target, siteUrl + pagePath);
      if (url.origin !== origin) continue;
      const path = decodeURIComponent(url.pathname).slice(1);
      const found = path === "" || path.endsWith("/") ? exists(`${path}index.html`) : exists(path) || exists(`${path}/index.html`);
      if (!found) {
        bad("links", `"${target}" has no built file`);
      }
    }

    for (const literal of ["TODO", "FIXME", "[object Object]"]) if (html.includes(literal)) bad("text", `contains "${literal}"`);
    if (/\blorem ipsum\b/i.test(html)) bad("text", 'contains "lorem ipsum"');
    for (const el of doc.querySelectorAll("h1,h2,h3,p")) {
      if (!el.textContent?.trim() && !el.querySelector("img,svg,canvas,picture,video,audio,iframe")) bad("text", `empty <${el.tagName.toLowerCase()}>`);
    }

    const csp = metaContent('meta[http-equiv="Content-Security-Policy"]');
    const policy = csp[0] ?? "";
    const scriptSrc = policy.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src ")) ?? "";
    const headStart = doc.head.firstElementChild;
    if (csp.length !== 1) bad("csp", "expected exactly one Content-Security-Policy meta");
    else if (headStart?.getAttribute("charset") == null || headStart.nextElementSibling?.getAttribute("http-equiv") !== "Content-Security-Policy") {
      bad("csp", "the policy must be the first element after <meta charset>");
    }
    if (!policy.startsWith("default-src 'none';")) bad("csp", "policy must start with default-src 'none'");
    if (/'unsafe-|\*/.test(policy)) bad("csp", "policy must not use 'unsafe-*' or wildcards");
    for (const source of inlineScripts(html)) {
      if (!scriptSrc.split(" ").includes(scriptHash(source))) bad("csp", `inline script "${source.trim().slice(0, 40)}" is not in script-src`);
    }
    for (const el of doc.querySelectorAll("*")) {
      for (const a of el.getAttributeNames()) {
        if (a === "style" || /^on[a-z]+$/.test(a)) bad("csp", `<${el.tagName.toLowerCase()} ${a}> would be blocked by the policy`);
      }
    }
    if (metaContent('meta[name="referrer"]').length !== 1) bad("csp", "expected exactly one referrer meta");

    const ogImage = metaContent('meta[property="og:image"]')[0];
    if (ogImage?.startsWith(`${siteUrl}/`) && exists(ogImage.slice(siteUrl.length + 1))) {
      const size = pngSize(readFileSync(join(siteDir, ogImage.slice(siteUrl.length + 1))));
      const declared = ["width", "height"].map((d) => Number(metaContent(`meta[property="og:image:${d}"]`)[0]));
      if (size?.width !== OG_SIZE.width || size?.height !== OG_SIZE.height || declared[0] !== size.width || declared[1] !== size.height) {
        bad("og-image", `PNG must be ${OG_SIZE.width}x${OG_SIZE.height} and match og:image:width/height`);
      }
    } else {
      bad("og-image", "og:image is not a built file of this site");
    }
  }

  /** @type {Record<string, string[]>} */
  const referenced = {};
  for (const [file, root, ns, locator] of [
    ["sitemap.xml", "urlset", SITEMAP_NS, "loc"],
    ["notes/feed.xml", "feed", ATOM_NS, "link[href], id"],
  ]) {
    try {
      const doc = parseXml(read(file));
      const el = doc.documentElement;
      if (el.localName !== root || el.namespaceURI !== ns) fail("xml", file, `root must be <${root}> in ${ns}`);
      referenced[file] = [...doc.querySelectorAll(locator)].map((n) => n.getAttribute("href") ?? n.textContent ?? "");
    } catch (err) {
      fail("xml", file, `missing or not well-formed XML (${/** @type {Error} */ (err).message.split("\n")[0]})`);
    }
  }

  const listed = (referenced["sitemap.xml"] ?? []).map((u) => u.replace(origin, ""));
  for (const u of referenced["sitemap.xml"] ?? []) {
    if (!u.startsWith(`${siteUrl}/`)) fail("sitemap", "sitemap.xml", `${u} is outside ${siteUrl}`);
  }
  for (const page of pages) {
    if (page !== "404.html" && !listed.includes(urlPath(page))) fail("sitemap", page, "built page is not in sitemap.xml");
  }
  for (const path of listed) {
    if (!pages.includes(path === "/" ? "index.html" : path.endsWith("/") ? `${path.slice(1)}index.html` : path.slice(1))) {
      fail("sitemap", "sitemap.xml", `${path} has no built page`);
    }
  }

  /** @type {string[]} */
  let drafts = [];
  if (existsSync(postsDir)) {
    drafts = readdirSync(postsDir)
      .filter((f) => f.endsWith(".md") && /^\s*draft:\s*true\s*$/m.test(readFileSync(join(postsDir, f), "utf8").match(/^---\r?\n([^]*?)\r?\n---/)?.[1] ?? ""))
      .map((f) => f.slice(0, -3));
  } else {
    fail("drafts", postsDir, "posts directory not found");
  }
  for (const slug of drafts) {
    const route = `/notes/${slug}/`;
    if (exists(`notes/${slug}`)) fail("drafts", route, "draft has a built page");
    for (const [file, urls] of Object.entries(referenced)) {
      if (urls.some((u) => u.replace(origin, "").replace(/\/$/, "") === route.slice(0, -1))) fail("drafts", file, `references draft ${route}`);
    }
  }
  return failures;
}

function main() {
  const args = process.argv.slice(2);
  const flag = (/** @type {string} */ name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const failures = runSiteChecks({
    revision: flag("--revision") ?? buildRevision(),
    siteDir: flag("--site-dir"),
    postsDir: flag("--posts-dir"),
    siteUrl: flag("--site-url"),
  });
  if (failures.length) {
    console.error(`site-check: FAILED, ${failures.length} violation(s)\n\n${failures.map((f) => `  ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log("site-check: OK");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
