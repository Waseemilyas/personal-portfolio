// A site gate that silently stops failing publishes a broken site, so each contract
// in site-check.mjs gets one red case against a small known-good built site.
import test from "node:test";
import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { scriptIntegrity, withPolicy } from "./csp.mjs";
import { publicAssets } from "./public-assets.mjs";
import { expiresFor } from "./security-txt.mjs";
import { runSiteChecks } from "./site-check.mjs";

const SITE = "https://example.test";
const REV = "a".repeat(40);
const SITE_SCRIPT_FILE = `assets/js/site-${"0".repeat(20)}.js`;
const SITE_SCRIPT = `void 0;\n//# sourceMappingURL=${basename(SITE_SCRIPT_FILE)}.map\n`;
const securityTxt = (expires = expiresFor(new Date())) =>
  `Contact: mailto:waseem@automancer.uk\nExpires: ${expires}\nCanonical: ${SITE}/.well-known/security.txt\n`;
const SITE_SCRIPT_INTEGRITY = scriptIntegrity(SITE_SCRIPT);

const png = (width, height) => {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
};

const page = (path, body = "<h1>Title</h1><p>Text</p>", head = "") => withPolicy(`<!doctype html><html><head>
<meta charset="utf-8"><meta name="referrer" content="strict-origin-when-cross-origin">
<script>document.documentElement.className+=' js';</script><style>body{margin:0}</style>
<meta name="description" content="d"><link rel="canonical" href="${SITE}${path}">
<meta name="waseemilyas-revision" content="${REV}">
<meta property="og:title" content="t"><meta property="og:description" content="d">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<script type="application/ld+json">{"@context":"https://schema.org"}</script>${head || `<meta property="og:type" content="website">
<meta property="og:image" content="${SITE}/assets/img/og-card.png"><meta property="og:image:alt" content="Default card.">`}</head>
<body>${body}<script id="site-script" src="/${SITE_SCRIPT_FILE}" integrity="${SITE_SCRIPT_INTEGRITY}" defer></script></body></html>`,
{ externalScriptIntegrities: [SITE_SCRIPT_INTEGRITY] });

// A note shares its own card, whose alt text repeats the note's label and title.
const NOTE_BODY = '<div class="casehead"><h1>A note</h1><p class="note-meta"><time datetime="2026-08-08T00:00:00.000Z">8 August 2026</time> · 1 min read</p></div>';
const notePage = ({ body = NOTE_BODY, type = "article", alt = "Note · 8 AUG 2026. A note.", headline = "A note" } = {}) =>
  page("/notes/n/", body, `<meta property="og:type" content="${type}">
<meta property="og:image" content="${SITE}/assets/img/og/notes-n.png"><meta property="og:image:alt" content="${alt}">
<meta property="article:published_time" content="2026-08-08T00:00:00.000Z">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"${headline}","datePublished":"2026-08-08"}</script>`);

const sitemap = (...paths) =>
  `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${SITE}${p}</loc></url>`).join("")}</urlset>`;
const feed = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><id>${SITE}/notes/</id></feed>`;

/**
 * @param {(files: Record<string, string | Buffer>) => void} [mutate]
 * @param {(siteDir: string) => void} [mutateTree]
 */
function check(mutate = () => {}, mutateTree = () => {}) {
  /** @type {Record<string, string | Buffer>} */
  const files = {
    ...Object.fromEntries(Object.values(publicAssets).map((file) => [file, "Public asset fixture"])),
    "index.html": page("/", '<h1>Home</h1><a href="/about/">About</a><a href="mailto:waseem@automancer.uk?subject=Hello">me</a>'),
    "about/index.html": page("/about/"),
    "notes/n/index.html": notePage(),
    "assets/img/og/notes-n.png": png(1200, 630),
    "404.html": page("/404.html"),
    "sitemap.xml": sitemap("/", "/about/", "/notes/n/"),
    "notes/feed.xml": feed,
    "revision.txt": `${REV}\n`,
    ".well-known/security.txt": securityTxt(),
    "assets/img/og-card.png": png(1200, 630),
    [SITE_SCRIPT_FILE]: SITE_SCRIPT,
    [`${SITE_SCRIPT_FILE}.map`]: "{}",
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
    mutateTree(join(root, "site"));
    return runSiteChecks({ revision: REV, siteDir: join(root, "site"), postsDir: join(root, "posts"), siteUrl: SITE });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a good site passes", () => assert.deepEqual(check(), []));

test("rejects undeclared files, including unused share cards", () => {
  const failures = check((files) => {
    files["about/preview.txt"] = "Draft preview fixture";
    files["assets/img/og/notes-wip.png"] = png(1200, 630);
  });
  assert.deepEqual(failures, [
    "artifact: about/preview.txt: file is outside the public site inventory",
    "artifact: assets/img/og/notes-wip.png: file is outside the public site inventory",
  ]);
});

test("rejects links at public file and directory paths", () => {
  const failures = check(undefined, (siteDir) => {
    renameSync(join(siteDir, "about"), join(siteDir, "../about"));
    symlinkSync("../about", join(siteDir, "about"), "dir");
    renameSync(join(siteDir, "revision.txt"), join(siteDir, "../revision.txt"));
    linkSync(join(siteDir, "../revision.txt"), join(siteDir, "revision.txt"));
  });
  assert.deepEqual(failures, [
    "artifact: about: expected a regular file with exactly one hard link",
    "artifact: revision.txt: expected a regular file with exactly one hard link",
  ]);
});

test("requires the unlinked public audio", () => {
  assert.deepEqual(check((files) => { delete files["audio/adhan.mp3"]; }), [
    "artifact: audio/adhan.mp3: required public file is missing",
  ]);
});

/** @type {Record<string, [(files: Record<string, string | Buffer>) => unknown, string]>} */
const bad = {
  "two h1": [(f) => (f["about/index.html"] = page("/about/", "<h1>A</h1><h1>B</h1>")), "headings"],
  "broken link": [(f) => (f["about/index.html"] = page("/about/", '<h1>A</h1><a href="/gone/">x</a>')), "links"],
  "wrong canonical": [(f) => (f["about/index.html"] = page("/about/").replace(`${SITE}/about/"`, `${SITE}/other/"`)), "metadata"],
  "empty paragraph": [(f) => (f["about/index.html"] = page("/about/", "<h1>A</h1><p> </p>")), "text"],
  "feed that is not XML": [(f) => (f["notes/feed.xml"] = feed.replace("</feed>", "")), "xml"],
  "page missing from sitemap": [(f) => (f["sitemap.xml"] = sitemap("/", "/notes/n/")), "sitemap"],
  "draft listed in sitemap": [(f) => (f["sitemap.xml"] = sitemap("/", "/about/", "/notes/n/", "/notes/wip/")), "drafts"],
  "og image of the wrong size": [(f) => (f["assets/img/og-card.png"] = png(600, 315)), "og-image"],
  "inline script added after the policy": [(f) => (f["index.html"] = page("/").replace("</body>", "<script>steal()</script></body>")), "csp"],
  "unapproved speculation rules": [(f) => (f["index.html"] = page("/").replace("</body>", '<script type="speculationrules">{"prefetch":[{"urls":["https://outside.test/"]}]}</script></body>')), "csp"],
  "inline event handler": [(f) => (f["about/index.html"] = page("/about/", '<h1 onclick="x()">A</h1>')), "csp"],
  "outside script origin allowed": [(f) => (f["about/index.html"] = page("/about/").replace("script-src ", "script-src https://cdn.example ")), "csp"],
  "all same-origin scripts allowed": [(f) => (f["about/index.html"] = page("/about/").replace("script-src ", "script-src 'self' ")), "csp"],
  "an exact script URL allowed alongside its hash": [(f) => (f["about/index.html"] = page("/about/").replace("script-src ", `script-src ${SITE}/${SITE_SCRIPT_FILE} `)), "csp"],
  "script element policy overrides the hashes": [(f) => (f["about/index.html"] = page("/about/").replace("script-src ", "script-src-elem 'self'; script-src ")), "csp"],
  "source map missing": [(f) => { delete f[`${SITE_SCRIPT_FILE}.map`]; }, "artifact"],
  "external script missing integrity": [(f) => (f["about/index.html"] = page("/about/").replace(` integrity="${SITE_SCRIPT_INTEGRITY}"`, "")), "csp"],
  "external script bytes changed after the policy": [(f) => (f[SITE_SCRIPT_FILE] = "void 1;"), "csp"],
  "inline style edited after the policy": [(f) => (f["index.html"] = page("/").replace("<style>", "<style>h1{color:red}")), "csp"],
  "all same-origin styles allowed": [(f) => (f["about/index.html"] = page("/about/").replace("style-src ", "style-src 'self' ")), "csp"],
  "style element policy overrides the hashes": [(f) => (f["about/index.html"] = page("/about/").replace("style-src ", "style-src-elem 'self'; style-src ")), "csp"],
  "style attribute policy overrides the hashes": [(f) => (f["about/index.html"] = page("/about/").replace("style-src ", "style-src-attr 'self'; style-src ")), "csp"],
  "worker policy is missing": [(f) => (f["about/index.html"] = page("/about/").replace("; worker-src 'none'", "")), "csp"],
  "render-blocking stylesheet link": [(f) => (f["about/index.html"] = page("/about/").replace("</head>", '<link rel="stylesheet" href="/x.css"></head>')), "csp"],
  "Trusted Types not enforced": [(f) => (f["about/index.html"] = page("/about/").replace("; require-trusted-types-for 'script'", "")), "csp"],
  "Trusted Types policy the page never creates": [(f) => (f["about/index.html"] = page("/about/").replace("trusted-types 'none'", "trusted-types injected")), "csp"],
  "default Trusted Types policy": [(f) => (f["about/index.html"] = page("/about/").replace("trusted-types 'none'", "trusted-types default")), "csp"],
  "policy missing": [(f) => (f["about/index.html"] = page("/about/").replace(/<meta http-equiv[^>]*>/, "")), "csp"],
  "share image without alt text": [(f) => (f["about/index.html"] = page("/about/").replace(/<meta property="og:image:alt"[^>]*>/, "")), "social"],
  "note retitled without a new card": [(f) => (f["notes/n/index.html"] = notePage({ body: NOTE_BODY.replace("A note", "A renamed note"), headline: "A renamed note" })), "social"],
  "note sharing the default card": [(f) => (f["notes/n/index.html"] = notePage().replace("/assets/img/og/notes-n.png", "/assets/img/og-card.png")), "social"],
  "note not marked as an article": [(f) => (f["notes/n/index.html"] = notePage({ type: "website" })), "social"],
  "note without a BlogPosting": [(f) => (f["notes/n/index.html"] = notePage({ headline: "Something else" })), "social"],
  "email link without a subject": [(f) => (f["about/index.html"] = page("/about/", '<h1>A</h1><a href="mailto:waseem@automancer.uk">me</a>')), "contact"],
  "internal host URL in rendered page": [(f) => (f["about/index.html"] = page("/about/", "<h1>A</h1><p>http://internal-router:8100/status</p>")), "privacy"],
  "non-allowlisted email in rendered page": [(f) => (f["about/index.html"] = page("/about/", "<h1>A</h1><p>person@synthetic-enterprise.example</p>")), "privacy"],
  "stale revision.txt": [(f) => (f["revision.txt"] = `${"b".repeat(40)}\n`), "revision"],
  "expired security.txt": [(f) => (f[".well-known/security.txt"] = securityTxt("2026-01-01T00:00:00Z")), "security"],
};
for (const [name, [mutate, check_]] of Object.entries(bad)) {
  test(`fails on: ${name}`, () => {
    assert.ok(check(mutate).some((line) => line.startsWith(`${check_}:`)), `expected a ${check_} violation`);
  });
}
