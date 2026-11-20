// The 404 page, driven against the real built page and site.js in jsdom. A visitor
// who follows a mangled link lands here: if the index misses a page, or the matcher
// opens or offers the wrong one, they leave believing the page is gone.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { builtSite, skipReason } from "./built-site.mjs";

/** @param {string} outDir @param {string} path */
function load(outDir, path) {
  const html = readFileSync(join(outDir, "404.html"), "utf8");
  const script = readFileSync(join(outDir, "assets/js/site.js"), "utf8");
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
  const listed = [...dom.window.document.querySelectorAll("[data-page-index] a")].map((a) => a.getAttribute("href")).sort();
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
