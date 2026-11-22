// The reader's usual next step is an article: a case study from Home or Work, a note
// from Notes, or the Next link at the foot of an article. Supporting browsers fetch
// those pages early (an `eager` prefetch), so the tap no longer waits on the network.
// The rule picks links by CSS selector, so a renamed class would silently drop the
// early fetch and bring the wait back. Hold every article link on those pages to it.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { builtScriptUrl, builtSite, skipReason } from "./built-site.mjs";

/** @param {string} outDir @param {string} route */
const page = (outDir, route) =>
  new JSDOM(readFileSync(join(outDir, route, "index.html"), "utf8")).window.document;

/** The selectors of the page's eager prefetch rules. @param {Document} doc */
function eagerSelectors(doc) {
  const rules = [...doc.querySelectorAll('script[type="speculationrules"]')].map(
    (s) => /** @type {{ prefetch?: { eagerness?: string, where?: { and?: { selector_matches?: string }[] } }[] }} */ (JSON.parse(s.textContent ?? "")),
  );
  return rules.flatMap((r) => r.prefetch ?? []).filter((p) => p.eagerness === "eager")
    .flatMap((p) => p.where?.and ?? []).flatMap((c) => (c.selector_matches ? [c.selector_matches] : []));
}

test("listing pages fetch every article they link to early", { skip: skipReason }, async () => {
  const outDir = await builtSite();
  const article = /^\/(work\/cs-[\w-]+|notes\/(?!feed)[\w-]+)\/$/;
  /** @type {[string, string][]} route and the region whose article links readers open */
  const listings = [["", "section[aria-labelledby=\"work\"]"], ["work", "main"], ["notes", "main"]];
  for (const [route, region] of listings) {
    const doc = page(outDir, route);
    const selectors = eagerSelectors(doc);
    assert.ok(selectors.length, `/${route}: has an eager prefetch rule`);
    const links = [...doc.querySelectorAll(`${region} a[href]`)].filter((a) => article.test(a.getAttribute("href") ?? ""));
    assert.ok(links.length >= 3, `/${route}: lists at least three articles`);
    for (const a of links) {
      assert.ok(selectors.some((s) => a.matches(s)), `/${route}: ${a.getAttribute("href")} is fetched early`);
    }
  }
  const cs = page(outDir, "work/cs-care");
  const next = cs.querySelector("a.nextread");
  assert.ok(next && eagerSelectors(cs).some((s) => next.matches(s)), "an article's Next link is fetched early");
});

test("the article prefetch fallback waits for a settled touch link or desktop intent", { skip: skipReason }, async () => {
  const outDir = await builtSite();
  const html = readFileSync(join(outDir, "work/index.html"), "utf8");
  const script = readFileSync(join(outDir, builtScriptUrl(html)), "utf8");

  for (const mode of ["touch", "desktop", "native speculation", "reduced data"]) {
    const dom = new JSDOM(html, {
      url: "https://waseemilyas.uk/work/",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });
    const { window } = dom;
    try {
      // Let jsdom finish loading. Drive only the entries the browser would report.
      await new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
      window.matchMedia = (media) => ({
        matches: media === "(prefers-reduced-motion: reduce)" ||
          (media === "(any-pointer: coarse)" && mode === "touch") ||
          (media === "(prefers-reduced-data: reduce)" && mode === "reduced data"),
      });
      window.HTMLScriptElement.supports = () => mode === "native speculation";
      window.DOMTokenList.prototype.supports = () => true;
      const observed = new Set();
      const requested = [];
      let notify;
      window.IntersectionObserver = class {
        constructor(callback) { notify = (entries) => callback(entries, this); }
        observe(link) { observed.add(link); }
      };
      const pending = new Map();
      let timerID = 0;
      window.setTimeout = (callback) => {
        pending.set(++timerID, callback);
        return timerID;
      };
      window.clearTimeout = (id) => pending.delete(id);
      const runPending = () => {
        for (const [id, callback] of pending) {
          pending.delete(id);
          callback();
        }
      };
      window.fetch = async (url) => {
        requested.push(url);
        return new Response("");
      };
      window.eval(script);
      assert.deepEqual(requested, [], mode);
      const [article, another] = window.document.querySelectorAll(".workcard h2 a");
      assert.ok(article instanceof window.HTMLAnchorElement && another instanceof window.HTMLAnchorElement);
      const enter = () => article.dispatchEvent(new window.Event("pointerenter"));
      if (mode !== "touch") {
        assert.equal(observed.size, 0, mode);
        enter();
        if (mode === "desktop") {
          assert.deepEqual(requested, [article.href], "a hover loads only that article");
          article.focus();
          enter();
          assert.deepEqual(requested, [article.href], "focus and a second hover reuse the request");
          another.focus();
          assert.deepEqual(requested, [article.href, another.href], "keyboard focus loads the focused article");
        } else {
          article.focus();
          assert.deepEqual(requested, [], mode);
        }
        continue;
      }
      assert.ok(observed.has(article));
      assert.ok([...observed].every((link) => link.matches(".workcard h2 a")));
      const entry = (target, intersectionRatio) => ({ target, intersectionRatio, isIntersecting: intersectionRatio > 0 });
      notify([entry(article, 0.1)]);
      runPending();
      assert.deepEqual(requested, [], "a sliver of a link does not start a download");
      notify([entry(article, 1)]);
      assert.deepEqual(requested, [], "a link passing through the viewport does not fetch immediately");
      notify([entry(article, 0)]);
      runPending();
      assert.deepEqual(requested, [], "leaving the viewport cancels the pending download");
      notify([entry(another, 1), entry(article, 1)]);
      assert.deepEqual(requested, []);
      runPending();
      assert.deepEqual(requested, [article.href], "only the first visible link fetches during the pause");
      notify([entry(article, 0)]);
      runPending();
      assert.deepEqual(requested, [article.href, another.href], "the next link fetches once the first leaves");
      notify([entry(article, 1)]);
      runPending();
      assert.deepEqual(requested, [article.href, another.href], "scrolling back never fetches a link twice");
    } finally {
      window.close();
    }
  }
});
