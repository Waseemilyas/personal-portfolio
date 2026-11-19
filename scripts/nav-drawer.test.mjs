// Interactive control for the mobile navigation drawer.
//
// Headless screenshots cannot click, so the hamburger's aria-expanded toggle
// and the Escape-close behaviour need a driven test. It builds the real site, loads the real built index.html plus the real
// built site.js inside jsdom (mobile-width matchMedia stub), and drives the
// drawer like a user: open by click, close by Escape.
//
// Published contract asserted here: aria-expanded tracks the drawer, the
// closed drawer is aria-hidden (out of the accessibility tree), and Escape
// closes the drawer and returns focus to the toggle.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const skipReason = existsSync("node_modules/@11ty/eleventy/cmd.cjs")
  ? false
  : "eleventy not installed — run pnpm install";

test("mobile nav drawer: click opens, Escape closes and refocuses the toggle", { skip: skipReason }, async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { mkdtempSync, rmSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const execFileP = promisify(execFile);

  // Build the real site (same pattern as revision.test.mjs's build control).
  const outDir = mkdtempSync(join(tmpdir(), "portfolio-nav-drawer-"));
  try {
    await execFileP(
      process.execPath,
      ["node_modules/@11ty/eleventy/cmd.cjs", "--output", outDir],
      { timeout: 180_000 }
    );

    // jsdom does not implement matchMedia; the stub reports a mobile-width
    // viewport so the drawer is active (and rm, so no IntersectionObserver
    // is needed). The external /assets/js/site.js is root-relative, so
    // jsdom cannot fetch it — we eval the built file into the page instead.
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM(readFileSync(join(outDir, "index.html"), "utf8"), {
      runScripts: "dangerously",
      url: "https://waseemilyas.uk/",
      beforeParse(window) {
        window.matchMedia = (media) => ({
          matches: true,
          media,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
        });
      },
    });
    dom.window.eval(readFileSync(join(outDir, "assets/js/site.js"), "utf8"));

    const { document } = dom.window;
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.getElementById("primary-nav");
    assert.ok(toggle && nav, "the built page carries the nav toggle and primary nav");

    // Initial state: drawer closed, out of the a11y tree on mobile widths.
    assert.equal(nav.getAttribute("data-open"), "false");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(nav.getAttribute("aria-hidden"), "true");

    // Clicking the toggle opens the drawer and flips aria-expanded.
    toggle.click();
    assert.equal(nav.getAttribute("data-open"), "true");
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.equal(nav.getAttribute("aria-hidden"), null);

    // Escape closes it again and returns focus to the toggle.
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));
    assert.equal(nav.getAttribute("data-open"), "false");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(nav.getAttribute("aria-hidden"), "true");
    assert.equal(document.activeElement, toggle, "Escape returns focus to the toggle");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
