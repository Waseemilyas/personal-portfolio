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
import { builtSite, skipReason } from "./built-site.mjs";

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
