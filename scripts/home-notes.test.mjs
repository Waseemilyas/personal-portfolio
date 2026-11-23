// Home shows the newest notes so a first visit sees the writing without opening
// Notes. Its rows must be the Notes index's own first rows, in the same order and
// with the same dates and reading times, so Home never shows a draft, an older
// note in place of a newer one, or a date the note page does not carry.

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

test("Home lists the newest notes as the Notes index does", { skip: skipReason }, async () => {
  const outDir = await builtSite();
  const home = page(outDir, "");
  const index = page(outDir, "notes");

  const section = home.querySelector("section[aria-labelledby=\"notes-title\"]");
  assert.ok(section, "Home has a Notes section");
  const rows = [...section.querySelectorAll(".worklist a.notecard")];
  const expected = [...index.querySelectorAll(".note-item")].slice(0, 3);
  assert.ok(expected.length >= 1, "the Notes index lists notes");
  assert.equal(rows.length, expected.length, "Home shows up to three notes");

  rows.forEach((row, i) => {
    const item = expected[i];
    const link = item.querySelector("h2 a");
    assert.equal(row.getAttribute("href"), link?.getAttribute("href"), `row ${i + 1} opens the same note`);
    assert.equal(text(row.querySelector("h3")), text(link), `row ${i + 1} has the note's title`);
    assert.equal(
      row.querySelector("time")?.getAttribute("datetime"),
      item.querySelector("time")?.getAttribute("datetime"),
      `row ${i + 1} has the note's date`,
    );
    assert.ok(text(item.querySelector(".date")).endsWith(text(row.querySelector(".read-time"))), `row ${i + 1} has the note's reading time`);
  });

  assert.equal(section.querySelector(".section-more a")?.getAttribute("href"), "/notes/", "the section links to every note");
});
