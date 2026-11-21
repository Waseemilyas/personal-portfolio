// The Work page lets a reader compare the case studies before opening any: each row
// shows the case's role, craft and outcome. Those values must be the case page's own
// datasheet words, so the index can never claim something the case does not, and a
// renamed datasheet key must not leave a row silently without them. The title is the
// row's only link, so a screen reader hears the title, not the whole row.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { builtSite, skipReason } from "./built-site.mjs";

/** @param {string} outDir @param {string} route */
const page = (outDir, route) =>
  new JSDOM(readFileSync(join(outDir, route, "index.html"), "utf8")).window.document;

/** @param {Element | null} el */
const text = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

test("Work rows carry each case's role, craft and outcome from its datasheet", { skip: skipReason }, async () => {
  const outDir = await builtSite();
  const rows = [...page(outDir, "work").querySelectorAll(".worklist .workcard-spec")];
  assert.ok(rows.length >= 3, "the Work page lists the case studies");
  for (const row of rows) {
    const links = row.querySelectorAll("a[href]");
    assert.equal(links.length, 1, "the title is the row's only link");
    const href = links[0].getAttribute("href") ?? "";
    const title = text(row.querySelector("h2"));
    assert.equal(text(links[0]), title, `${href}: the link's name is the title alone`);

    const cs = page(outDir, href);
    assert.equal(text(cs.querySelector("h1")), title, `${href}: the row's title is the case's title`);
    /** @type {Map<string, string>} */
    const sheet = new Map();
    for (const dt of cs.querySelectorAll(".datasheet dt")) sheet.set(text(dt).toUpperCase(), text(dt.nextElementSibling));

    const shown = [...row.querySelectorAll(".workspec dt")].map((dt) => [text(dt).toUpperCase(), text(dt.nextElementSibling)]);
    assert.deepEqual(shown.map(([k]) => k), ["ROLE", "CRAFT", "OUTCOME"], `${href}: role, craft and outcome are shown`);
    for (const [k, v] of shown) {
      assert.ok(v.length > 0, `${href}: ${k} has a value`);
      assert.equal(v, sheet.get(k), `${href}: ${k} matches the case's datasheet`);
    }
  }
});
