// A visitor using webmail can copy the real address even when automatic copy
// is unavailable or the browser refuses it.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { builtSite, skipReason } from "./built-site.mjs";

test("contact page: automatic copy confirms success and manual copy survives refusal or missing APIs", { skip: skipReason }, async () => {
  const outDir = await builtSite();
  const html = readFileSync(join(outDir, "contact/index.html"), "utf8");
  const script = readFileSync(join(outDir, "assets/js/site.js"), "utf8");

  /** @param {((text: string) => Promise<void>) | null} writeText */
  const load = (writeText, enableScript = true) => {
    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      pretendToBeVisual: true,
      url: "https://waseemilyas.uk/contact/",
      beforeParse(window) {
        window.matchMedia = (media) => ({ matches: true, media, addEventListener() {}, removeEventListener() {} });
        Object.defineProperty(window, "isSecureContext", { value: true });
        if (writeText) Object.defineProperty(window.navigator, "clipboard", { value: { writeText } });
      },
    });
    if (enableScript) dom.window.eval(script);
    return dom.window;
  };

  for (const enableScript of [false, true]) {
    const window = load(null, enableScript);
    const { document } = window;
    assert.ok(document.querySelector("button.copy-email")?.hidden);
    const manual = document.querySelector(".copy-email-manual");
    assert.ok(manual && !manual.hidden && !manual.open, "manual copy is available before activation");
    manual.querySelector("summary")?.click();
    assert.ok(manual.open, "the native disclosure opens without a clipboard API");
    const field = manual.querySelector("input");
    assert.ok(field?.readOnly);
    assert.equal(field.value, document.querySelector("a.email-big")?.textContent?.trim());
    window.close();
  }

  /** @type {string[]} */
  const copied = [];
  const success = load(async (text) => { copied.push(text); });
  const doc = success.document;
  const button = doc.querySelector("button.copy-email");
  const link = doc.querySelector("a.email-big");
  assert.ok(button && !button.hidden, "the button is shown where the browser can copy");
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(copied, [link?.textContent?.trim()], "it copies exactly the address shown");
  assert.equal(button.textContent, "Copied ✓");
  assert.equal(doc.querySelector('.email-row [role="status"]')?.textContent, "Email address copied.");
  assert.ok(doc.querySelector(".copy-email-manual")?.hidden);
  success.close();

  const failing = load(async () => { throw new Error("denied"); });
  const failedButton = failing.document.querySelector("button.copy-email");
  failedButton?.focus();
  failedButton?.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const manual = failing.document.querySelector(".copy-email-manual");
  assert.ok(manual?.open && !manual.hidden, "a denied copy reveals the manual path");
  const field = manual.querySelector("input");
  assert.ok(field);
  assert.equal(failing.document.activeElement, field);
  assert.equal(field.value.slice(field.selectionStart, field.selectionEnd), field.value);
  assert.match(failing.document.querySelector('.email-row [role="status"]')?.textContent ?? "", /Could not copy/);
  failing.close();
});
