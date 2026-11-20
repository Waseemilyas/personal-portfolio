// Interactive control for the mobile navigation drawer.
//
// Headless screenshots cannot click, so the hamburger's aria-expanded toggle
// and the Escape-close behaviour need a driven test. It builds the real site, loads the real built index.html plus the real
// built site.js inside jsdom (mobile-width matchMedia stub), and drives the
// drawer like a user: open by click, close by Escape.
//
// Published contract asserted here: the served markup makes the menu a native
// popover (so a browser opens it before or without site.js) and carries no
// static aria-expanded that would be wrong once it opens. jsdom has no popover
// support, so the rest drives the script's fallback for such browsers:
// aria-expanded tracks the drawer, the closed drawer is aria-hidden (out of the
// accessibility tree), and Escape closes it and returns focus to the toggle.
// Real browsers' native menu, with and without scripts, is the verify-portfolio walk.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { builtSite, skipReason } from "./built-site.mjs";

test("mobile nav drawer: click opens, Escape or leaving the drawer closes it", { skip: skipReason }, async () => {
  const outDir = await builtSite();

  // jsdom does not implement matchMedia; the stub reports a mobile-width
  // viewport so the drawer is active (and rm, so no IntersectionObserver
  // is needed). The external /assets/js/site.js is root-relative, so
  // jsdom cannot fetch it — we eval the built file into the page instead.
  // jsdom applies the inlined stylesheet but evaluates no media query, so the
  // desktop rule would hide the toggle and block its focus. Real browsers are
  // covered by the verify-portfolio walk; here the page is driven unstyled.
  const html = readFileSync(join(outDir, "index.html"), "utf8").replace(/<style>[\s\S]*?<\/style>/g, "");
  const served = new JSDOM(html).window.document;
  assert.equal(served.querySelector(".nav-toggle")?.getAttribute("popovertarget"), "primary-nav");
  assert.ok(served.getElementById("primary-nav")?.hasAttribute("popover"), "the primary nav is a popover");
  assert.equal(served.querySelector(".nav-toggle")?.hasAttribute("aria-expanded"), false,
    "no static aria-expanded: browsers derive it from the popover until the script mirrors it");
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://waseemilyas.uk/",
    beforeParse(window) {
      window.matchMedia = (media) => ({
        matches: true,
        media,
        addEventListener() {},
        removeEventListener() {},
      });
    },
  });
  dom.window.eval(readFileSync(join(outDir, "assets/js/site.js"), "utf8"));

  const { document } = dom.window;
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("primary-nav");
  assert.ok(toggle && nav, "the built page carries the nav toggle and primary nav");

  // Without popover support the script takes the drawer over.
  assert.equal(nav.hasAttribute("popover"), false);
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

  // With the menu open, moving focus into the page closes it and keeps that focus.
  toggle.click();
  nav.querySelector(".cta").focus();
  const firstLink = document.querySelector("main a");
  firstLink.focus();
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(nav.getAttribute("aria-hidden"), "true");
  assert.equal(document.activeElement, firstLink);
});
