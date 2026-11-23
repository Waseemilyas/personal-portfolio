// A reader can pass a note or case study on: the share sheet where the browser has
// one, one-click copy where it can copy, and a manual copy of the same address
// with no script, no clipboard, or when sharing is refused.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { builtScriptUrl, builtSite, skipReason } from "./built-site.mjs";

const pages = [
  { file: "notes/unglamorous-half-of-automation/index.html", url: "https://waseemilyas.uk/notes/unglamorous-half-of-automation/", heading: "Share this note", feed: true },
  { file: "work/cs-care/index.html", url: "https://waseemilyas.uk/work/cs-care/", heading: "Share this case study", feed: false },
];

/** @param {number} ms */
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

test("notes and case studies: share, copy and manual copy all hand over the canonical address", { skip: skipReason }, async () => {
  const outDir = await builtSite();

  for (const { file, url, heading, feed } of pages) {
    const html = readFileSync(join(outDir, file), "utf8");
    const script = readFileSync(join(outDir, builtScriptUrl(html)), "utf8");

    /**
     * @param {{ share?: ((data: ShareData) => Promise<void>) | null, writeText?: ((text: string) => Promise<void>) | null, enableScript?: boolean }} options
     */
    const load = ({ share = null, writeText = null, enableScript = true } = {}) => {
      const dom = new JSDOM(html, {
        runScripts: "dangerously",
        pretendToBeVisual: true,
        url: `${url}?utm_source=somewhere#how-you-know-it-worked`,
        beforeParse(window) {
          window.matchMedia = (media) => ({ matches: true, media, addEventListener() {}, removeEventListener() {} });
          Object.defineProperty(window, "isSecureContext", { value: true });
          if (writeText) Object.defineProperty(window.navigator, "clipboard", { value: { writeText } });
          if (share) Object.defineProperty(window.navigator, "share", { value: share });
        },
      });
      if (enableScript) dom.window.eval(script);
      return dom.window;
    };

    // No script, or a script with neither API: the native disclosure holds the address.
    for (const enableScript of [false, true]) {
      const window = load({ enableScript });
      const { document } = window;
      const section = document.querySelector(".reading-share");
      assert.ok(section, `${file}: the share section is built`);
      assert.equal(section.querySelector("h2")?.textContent, heading);
      assert.equal(section.querySelector(".share-url")?.textContent, url.replace("https://", ""));
      assert.ok(section.querySelector("button.share-link")?.hidden, `${file}: no one-click control without an API`);
      const manual = section.querySelector(".copy-email-manual");
      assert.ok(manual && !manual.hidden && !manual.open);
      manual.querySelector("summary")?.click();
      assert.ok(manual.open, `${file}: the manual disclosure opens without a script`);
      const field = manual.querySelector("input");
      assert.ok(field?.readOnly);
      assert.equal(field.value, url, `${file}: the canonical address, never the visitor's query or fragment`);
      assert.equal(Boolean(section.querySelector('.share-feed a[href="/notes/feed.xml"]')), feed);
      window.close();
    }

    // A share sheet: the button opens it with the article's title and canonical address.
    /** @type {ShareData[]} */
    const shared = [];
    /** @type {string[]} */
    const copied = [];
    const sharing = load({ share: async (data) => { shared.push({ title: data.title, url: data.url }); }, writeText: async (text) => { copied.push(text); } });
    const shareButton = sharing.document.querySelector("button.share-link");
    assert.ok(shareButton && !shareButton.hidden);
    assert.equal(shareButton.textContent, "Share link");
    assert.ok(sharing.document.querySelector(".reading-share .copy-email-manual")?.hidden);
    shareButton.click();
    await tick();
    assert.deepEqual(shared, [{ title: sharing.document.querySelector("main h1")?.textContent?.trim(), url }]);
    assert.deepEqual(copied, [], "sharing does not also copy");
    sharing.close();

    // Closing the share sheet changes nothing on the page.
    const dismissed = load({ share: async () => { throw new DOMException("Share canceled", "AbortError"); } });
    const dismissedButton = dismissed.document.querySelector("button.share-link");
    dismissedButton?.click();
    await tick();
    assert.ok(dismissedButton && !dismissedButton.hidden);
    assert.ok(dismissed.document.querySelector(".reading-share .copy-email-manual")?.hidden);
    assert.equal(dismissed.document.querySelector('.share-row [role="status"]')?.textContent, "");
    dismissed.close();

    // A refused share falls back to the manual copy, focused and selected.
    const refused = load({ share: async () => { throw new DOMException("Not allowed", "NotAllowedError"); } });
    const refusedButton = refused.document.querySelector("button.share-link");
    refusedButton?.focus();
    refusedButton?.click();
    await tick();
    const refusedManual = refused.document.querySelector(".reading-share .copy-email-manual");
    assert.ok(refusedManual?.open && !refusedManual.hidden && refusedButton?.hidden);
    const refusedField = refusedManual.querySelector("input");
    assert.equal(refused.document.activeElement, refusedField);
    assert.match(refused.document.querySelector('.share-row [role="status"]')?.textContent ?? "", /Could not open sharing/);
    refused.close();

    // No share sheet but a clipboard: the button copies the address and says so.
    const copying = load({ writeText: async (text) => { copied.push(text); } });
    const copyButton = copying.document.querySelector("button.share-link");
    assert.equal(copyButton?.textContent, "Copy link");
    copyButton?.click();
    await tick();
    assert.deepEqual(copied, [url]);
    assert.equal(copyButton?.textContent, "Copied ✓");
    assert.equal(copying.document.querySelector('.share-row [role="status"]')?.textContent, "Link copied.");
    // The email row beside it keeps its own control and wording.
    const emailButton = copying.document.querySelector(".email-row button.copy-email");
    emailButton?.click();
    await tick();
    assert.equal(copied.at(-1), copying.document.querySelector(".email-row a.email-big")?.textContent?.trim());
    assert.equal(copying.document.querySelector('.email-row [role="status"]')?.textContent, "Email address copied.");
    copying.close();
  }

  // The notes index points readers at the feed.
  const index = readFileSync(join(outDir, "notes/index.html"), "utf8");
  assert.match(index, /class="note-feed"><a href="\/notes\/feed.xml" type="application\/atom\+xml">/);
});
