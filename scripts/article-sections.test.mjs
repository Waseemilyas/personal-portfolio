import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { builtSite, skipReason } from "./built-site.mjs";

test("published articles link to their own focusable section headings without scripts", { skip: skipReason }, async () => {
  const out = await builtSite();
  const requiredLinks = new Map([
    ["/work/cs-care/", "#section-outcome"],
    ["/notes/unglamorous-half-of-automation/", "#section-where-ai-earns-its-place"],
  ]);
  for (const index of ["work", "notes"]) {
    const list = new JSDOM(readFileSync(join(out, index, "index.html"), "utf8")).window.document;
    const articles = list.querySelectorAll("main article h2 a[href]");
    assert.ok(articles.length, `${index} has articles to read`);
    for (const article of articles) {
      const route = article.getAttribute("href");
      const doc = new JSDOM(readFileSync(join(out, route, "index.html"), "utf8")).window.document;
      const links = [...doc.querySelectorAll('main nav[aria-label="On this page"] a[href]')];
      const headings = [...doc.querySelectorAll("main .prose h2")];
      const expected = headings.length > 1 || index === "work" ? [...headings] : [];
      if (index === "work") {
        const datasheet = doc.querySelector(".datasheet h2");
        assert.ok(datasheet, `${route}: the datasheet has a heading readers can jump to`);
        expected.push(datasheet);
      }
      const requiredLink = requiredLinks.get(route);
      if (requiredLink) {
        assert.ok(links.some((link) => link.getAttribute("href") === requiredLink), `${route} links to ${requiredLink}`);
        requiredLinks.delete(route);
      }
      assert.deepEqual(links.map((link) => {
        const href = link.getAttribute("href");
        assert.ok(href.startsWith("#"), `${route}: stays on the article`);
        const target = doc.getElementById(decodeURIComponent(href.slice(1)));
        assert.equal(target?.getAttribute("tabindex"), "-1", `${route}${href}: focus can follow the link`);
        assert.equal(link.textContent.trim(), target.textContent.trim(), `${route}${href}: label matches heading`);
        assert.equal([...doc.querySelectorAll("[id]")].filter((el) => el.id === target.id).length, 1);
        return target;
      }), expected, `${route}: section links follow reading order`);
    }
  }
  assert.equal(requiredLinks.size, 0, "the section links can be reached from Work and Notes");
});
