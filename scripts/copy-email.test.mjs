// The contact page's "Copy address" button, driven against the real built page and
// site.js in jsdom. A visitor with no mail app set up relies on it: the mail link
// does nothing for them, so a button that never appears or copies the wrong text
// leaves them with no way to reach Waseem but selecting the address by hand.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { builtSite, skipReason } from "./built-site.mjs";

test("contact page: copy button appears with JavaScript, copies the address and says so", { skip: skipReason }, async () => {
  const outDir = await builtSite();
  const html = readFileSync(join(outDir, "contact/index.html"), "utf8");
  const script = readFileSync(join(outDir, "assets/js/site.js"), "utf8");

  /** @param {((text: string) => Promise<void>) | null} writeText */
  const load = (writeText) => {
    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      url: "https://waseemilyas.uk/contact/",
      beforeParse(window) {
        window.matchMedia = (media) => ({ matches: true, media, addEventListener() {}, removeEventListener() {} });
        Object.defineProperty(window, "isSecureContext", { value: true });
        if (writeText) Object.defineProperty(window.navigator, "clipboard", { value: { writeText } });
      },
    });
    dom.window.eval(script);
    return dom.window.document;
  };

  const without = load(null).querySelector("button.copy-email");
  assert.ok(without?.hidden, "with no clipboard the button stays hidden");

  /** @type {string[]} */
  const copied = [];
  const doc = load(async (text) => { copied.push(text); });
  const button = doc.querySelector("button.copy-email");
  const link = doc.querySelector("a.email-big");
  assert.ok(button && !button.hidden, "the button is shown where the browser can copy");
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(copied, [link?.textContent?.trim()], "it copies exactly the address shown");
  assert.equal(button.textContent, "Copied ✓");
  assert.equal(doc.querySelector('.email-row [role="status"]')?.textContent, "Email address copied.");

  const failing = load(async () => { throw new Error("denied"); });
  failing.querySelector("button.copy-email")?.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(failing.querySelector('.email-row [role="status"]')?.textContent ?? "", /Could not copy/);
});
