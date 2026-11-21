// Each page inlines only the style rules it can use (scripts/prune-css.mjs). A rule
// lost by mistake restyles the live site with no error anywhere, so these check the
// pruning three ways: nothing is lost when every name is in use, the classes scripts
// add at runtime are read (and an unreadable one stops the build), and on every built
// page each rule whose selector matches an element in that page is still inlined.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { readStylesheet } from "./inline-css.mjs";
import { parseBlocks, pruneWithNames, requiredNames, scriptClasses, splitSelectors } from "./prune-css.mjs";
import { builtSite, skipReason } from "./built-site.mjs";

const css = readStylesheet();

/** @param {import("./prune-css.mjs").Node[]} nodes @returns {string[]} */
const styleRules = (nodes) =>
  nodes.flatMap((n) => (n.children ? styleRules(n.children) : n.prelude.startsWith("@") ? [] : [n.prelude]));

test("with every name in use, the stylesheet is kept byte for byte", () => {
  const names = new Set(styleRules(parseBlocks(css)).flatMap((p) => splitSelectors(p).flatMap(requiredNames)));
  assert.equal(pruneWithNames(css, names), css);
});

test("a rule goes only when every selector in its list needs a missing name", () => {
  const sheet = ".a{x:1}.a,.b{x:2}.b .c{x:3}:not(.b){x:4}@media (min-width: 1px){.b{x:5}}@keyframes k{0%{x:6}}";
  assert.equal(pruneWithNames(sheet, new Set([".a"])), ".a{x:1}.a,.b{x:2}:not(.b){x:4}@keyframes k{0%{x:6}}");
  assert.deepEqual(splitSelectors(".a:is(.b, .c),.d"), [".a:is(.b, .c)", ".d"]);
  assert.deepEqual(requiredNames(".a[data-x=\".y\"]:has(.b) #c::after"), [".a", "#c"]);
});

test("classes the scripts add at runtime are read, and an unreadable one stops the build", () => {
  const base = readFileSync("src/_includes/base.njk", "utf8");
  const site = readFileSync("src/assets/js/site.js", "utf8");
  assert.deepEqual(new Set(scriptClasses(`${base}\n${site}`)), new Set(["js", "deeplink", "onsite", "cal-wait", "in", "on"]));
  assert.throws(() => scriptClasses("el.classList.add(name)"), /cannot read/);
  assert.throws(() => scriptClasses('el.className = "open"'), /cannot read/);
  assert.throws(() => scriptClasses('el.setAttribute("class", "open")'), /cannot read/);
});

/** Interaction and tree states a static document cannot be in; dropped before matching. */
const STATE = /::?(?:before|after|marker|placeholder|selection|backdrop|first-letter|first-line|file-selector-button|view-transition[\w-]*(?:\([^)]*\))?|hover|focus-visible|focus-within|focus|active|visited|link|target|checked|open|popover-open|disabled|enabled|placeholder-shown|any-link)(?![\w-])/g;

test("every page keeps each rule that matches one of its elements", { skip: skipReason }, async () => {
  const site = await builtSite();
  const rules = [...new Set(styleRules(parseBlocks(css)))];
  /** @param {string} dir @returns {string[]} */
  const pages = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? pages(join(dir, e.name)) : e.name.endsWith(".html") ? [join(dir, e.name)] : [],
    );
  let checked = 0;
  for (const file of pages(site)) {
    const html = readFileSync(file, "utf8");
    const inlined = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
    const kept = new Set(styleRules(parseBlocks(inlined)));
    const doc = new JSDOM(html).window.document;
    // The classes the inline script and site.js add in the browser.
    doc.documentElement.classList.add("js", "onsite");
    for (const prelude of rules) {
      if (kept.has(prelude)) continue;
      for (const selector of splitSelectors(prelude)) {
        const bare = selector.replace(STATE, "").replace(/(^|[\s>+~(,])(?=[\s>+~),]|$)/g, "$1*");
        let found = null;
        try {
          found = doc.querySelector(bare);
        } catch {
          continue; // A selector jsdom cannot parse; the browser comparison owns it.
        }
        checked++;
        assert.equal(found, null, `${file.slice(site.length)} dropped "${prelude}" but "${selector}" matches`);
      }
    }
  }
  assert.ok(checked > 100, `only ${checked} dropped selectors could be checked`);
});
