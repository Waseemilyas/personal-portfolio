// A site gate that silently stops failing publishes a broken site, so each contract
// in site-check.mjs gets one red case against a small known-good built site.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { withPolicy } from "./csp.mjs";
import { runSiteChecks } from "./site-check.mjs";

const SITE = "https://example.test";
const REV = "a".repeat(40);

const png = (width, height) => {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
};

const page = (path, body = "<h1>Title</h1><p>Text</p>") => withPolicy(`<!doctype html><html><head>
<meta charset="utf-8"><meta name="referrer" content="strict-origin-when-cross-origin">
<script>document.documentElement.className+=' js';</script>
<meta name="description" content="d"><link rel="canonical" href="${SITE}${path}">
<meta name="waseemilyas-revision" content="${REV}">
<meta property="og:title" content="t"><meta property="og:description" content="d"><meta property="og:type" content="website">
<meta property="og:url" content="${SITE}${path}"><meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<script type="application/ld+json">{"@context":"https://schema.org"}</script></head>
<body>${body}</body></html>`);

const sitemap = (...paths) =>
  `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${SITE}${p}</loc></url>`).join("")}</urlset>`;
const feed = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><id>${SITE}/notes/</id></feed>`;

/** @param {(files: Record<string, string | Buffer>) => void} [mutate] */
function check(mutate = () => {}) {
  /** @type {Record<string, string | Buffer>} */
  const files = {
    "index.html": page("/", '<h1>Home</h1><a href="/about/">About</a>'),
    "about/index.html": page("/about/"),
    "404.html": page("/404.html"),
    "sitemap.xml": sitemap("/", "/about/"),
    "notes/feed.xml": feed,
    "revision.txt": `${REV}\n`,
    "og.png": png(1200, 630),
  };
  mutate(files);
  const root = mkdtempSync(join(tmpdir(), "site-check-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, "site", name)), { recursive: true });
      writeFileSync(join(root, "site", name), content);
    }
    mkdirSync(join(root, "posts"));
    writeFileSync(join(root, "posts", "wip.md"), "---\ntitle: x\ndraft: true\n---\nbody\n");
    return runSiteChecks({ revision: REV, siteDir: join(root, "site"), postsDir: join(root, "posts"), siteUrl: SITE });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a good site passes", () => assert.deepEqual(check(), []));

const bad = {
  "two h1": [(f) => (f["about/index.html"] = page("/about/", "<h1>A</h1><h1>B</h1>")), "headings"],
  "broken link": [(f) => (f["about/index.html"] = page("/about/", '<h1>A</h1><a href="/gone/">x</a>')), "links"],
  "wrong canonical": [(f) => (f["about/index.html"] = page("/about/").replace(`${SITE}/about/"`, `${SITE}/other/"`)), "metadata"],
  "empty paragraph": [(f) => (f["about/index.html"] = page("/about/", "<h1>A</h1><p> </p>")), "text"],
  "feed that is not XML": [(f) => (f["notes/feed.xml"] = feed.replace("</feed>", "")), "xml"],
  "page missing from sitemap": [(f) => (f["sitemap.xml"] = sitemap("/")), "sitemap"],
  "draft listed in sitemap": [(f) => (f["sitemap.xml"] = sitemap("/", "/about/", "/notes/wip/")), "drafts"],
  "og image of the wrong size": [(f) => (f["og.png"] = png(600, 315)), "og-image"],
  "inline script added after the policy": [(f) => (f["index.html"] = page("/").replace("</body>", "<script>steal()</script></body>")), "csp"],
  "inline event handler": [(f) => (f["about/index.html"] = page("/about/", '<h1 onclick="x()">A</h1>')), "csp"],
  "policy missing": [(f) => (f["about/index.html"] = page("/about/").replace(/<meta http-equiv[^>]*>/, "")), "csp"],
  "stale revision.txt": [(f) => (f["revision.txt"] = `${"b".repeat(40)}\n`), "revision"],
};
for (const [name, [mutate, check_]] of Object.entries(bad)) {
  test(`fails on: ${name}`, () => {
    assert.ok(check(mutate).some((line) => line.startsWith(`${check_}:`)), `expected a ${check_} violation`);
  });
}
