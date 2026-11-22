// The 404 page, driven against the real built page and site.js in jsdom. A visitor
// who follows a mangled link lands here: if the index misses a page, or the matcher
// opens or offers the wrong one, they leave believing the page is gone.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";
import { builtScriptUrl, builtSite, skipReason } from "./built-site.mjs";
import { inlineScripts } from "./csp.mjs";

/** @param {string} outDir @param {string} path */
function load(outDir, path) {
  const html = readFileSync(join(outDir, "404.html"), "utf8");
  const script = readFileSync(join(outDir, builtScriptUrl(html)), "utf8");
  // jsdom cannot navigate; location.replace only reports that it tried.
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: `https://waseemilyas.uk${path}`,
    virtualConsole,
    beforeParse(window) {
      window.matchMedia = (media) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} });
    },
  });
  dom.window.eval(script);
  const match = dom.window.document.querySelector("[data-not-found-match]");
  if (!(match instanceof dom.window.HTMLElement)) throw new Error("no match slot on the 404 page");
  return {
    document: dom.window.document,
    offered: match.hidden ? null : {
      ref: match.querySelector(".ref")?.textContent,
      href: match.querySelector("a")?.getAttribute("href"),
      title: match.querySelector(".nf-title")?.textContent,
    },
  };
}

test("404 page lists every published page, without JavaScript", { skip: skipReason }, async () => {
  const outDir = await builtSite();
  const sitemap = readFileSync(join(outDir, "sitemap.xml"), "utf8");
  const published = [...sitemap.matchAll(/<loc>https:\/\/waseemilyas\.uk([^<]*)<\/loc>/g)].map((m) => m[1]).sort();
  const dom = new JSDOM(readFileSync(join(outDir, "404.html"), "utf8"));
  const listed = [...dom.window.document.querySelectorAll("[data-page-index] a")].map((a) => a.getAttribute("href") ?? "").sort();
  assert.deepEqual(listed, published);
  assert.ok(dom.window.document.querySelector("[data-not-found-match]")?.hasAttribute("hidden"), "no suggestion shows without the script");
});

test("404 page opens a page the address only mangled", { skip: skipReason }, async () => {
  const outDir = await builtSite();
  for (const [path, want] of [
    ["/work/cs-care)", "/work/cs-care/"],
    ["/Work/", "/work/"],
    ["/about.html", "/about/"],
    ["/Contact/index.html", "/contact/"],
    ["/notes/unglamorous-half-of-automation.", "/notes/unglamorous-half-of-automation/"],
    ["/notes/what-an-operations-platform-is-made-of/%E2%80%A6", "/notes/what-an-operations-platform-is-made-of/"],
  ]) {
    assert.deepEqual(load(outDir, path).offered?.ref, "OPENING", path);
    assert.equal(load(outDir, `${path}#top`).offered?.href, `${want}#top`, path);
  }
});

test("404 page offers the closest page and opens nothing by guesswork", { skip: skipReason }, async () => {
  const outDir = await builtSite();
  for (const [path, want] of [
    ["/notes/unglamorus-half-of-automation/", "/notes/unglamorous-half-of-automation/"],
    ["/abuot/", "/about/"],
    ["/notes/buy-build-or/", "/notes/buy-build-or-the-missing-ten-percent/"],
    ["/work/unglamorous-half-of-automation/", "/notes/unglamorous-half-of-automation/"],
    ["/work/cs-care/extra/", "/work/cs-care/"],
    ["/work/cs-old-name/", "/work/"],
    ["/blog/", "/notes/"],
  ]) {
    const { offered } = load(outDir, path);
    assert.equal(offered?.ref, "CLOSEST", path);
    assert.equal(offered?.href, want, path);
    assert.ok(offered?.title, path);
  }
  for (const path of ["/wp-admin/", "/404.html", "/x"]) {
    assert.equal(load(outDir, path).offered, null, path);
  }
});

/**
 * Run the 404 page's head redirect against an address, the way a browser would before
 * anything else on the page loads. Returns where it sent the visitor, if anywhere.
 * @param {string} source @param {string} address
 */
function headRedirect(source, address) {
  const url = new URL(address, "https://waseemilyas.uk");
  /** @type {string[]} */
  const replaced = [];
  /** @type {Record<string, string>} */
  const attributes = {};
  const location = { pathname: url.pathname, search: url.search, hash: url.hash, replace: (/** @type {string} */ to) => replaced.push(to) };
  const document = { documentElement: { setAttribute: (/** @type {string} */ name, /** @type {string} */ value) => { attributes[name] = value; } } };
  runInNewContext(source, { location, document });
  assert.ok(replaced.length <= 1, address);
  return { to: replaced[0] ?? null, asked: attributes["data-asked"] };
}

test("404 page opens a mangled address from its head, before it loads anything else", { skip: skipReason }, async () => {
  const outDir = await builtSite();
  const html = readFileSync(join(outDir, "404.html"), "utf8");
  const source = inlineScripts(html).find((body) => body.includes("data-asked"));
  assert.ok(source, "the 404 page has a head redirect");
  const at = html.indexOf(source);
  for (const later of ["<link", "<style", "<title", "<script src"]) {
    assert.ok(html.indexOf(later) === -1 || at < html.indexOf(later), `the redirect runs before the first ${later}`);
  }
  for (const page of ["about/", "work/cs-care/", "notes/unglamorous-half-of-automation/"]) {
    assert.ok(!readFileSync(join(outDir, page, "index.html"), "utf8").includes("data-asked"), `${page} carries no redirect`);
  }

  for (const [path, want] of [
    ["/work/cs-care)", "/work/cs-care/"],
    ["/Work/", "/work/"],
    ["/about.html", "/about/"],
    ["/Contact/index.html", "/contact/"],
    ["/notes/unglamorous-half-of-automation.", "/notes/unglamorous-half-of-automation/"],
    ["/notes/what-an-operations-platform-is-made-of/%E2%80%A6", "/notes/what-an-operations-platform-is-made-of/"],
    ["/work//cs-auto", "/work/cs-auto/"],
  ]) {
    assert.equal(headRedirect(source, path).to, want, path);
    assert.equal(headRedirect(source, `${path}?ref=chat#outcome`).to, `${want}?ref=chat#outcome`, path);
  }
  for (const path of ["/notes/unglamorus-half-of-automation/", "/blog/", "/wp-admin/", "/404.html", "/x", "/%E0%A4%A"]) {
    const { to, asked } = headRedirect(source, path);
    assert.equal(to, null, path);
    assert.ok(asked?.endsWith("/"), `${path} leaves its normalised address for site.js`);
  }
});
