// Error reporting, driven against a real production-shaped build in jsdom. A normal
// visit must fetch nothing for Sentry (no third party learns of the visit), and the
// first error must still load the pinned SDK from this site and reach Sentry's
// ingest. Either half failing is silent in production: a privacy leak nobody sees,
// or errors nobody hears about.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const skipReason = existsSync("node_modules/@11ty/eleventy/cmd.cjs")
  ? false
  : "eleventy not installed — run pnpm install";

const DSN = "https://0123456789abcdef0123456789abcdef@o1.ingest.de.sentry.io/1";

test("error reporting: nothing loads until an error, then the pinned SDK reports it", { skip: skipReason }, async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { mkdtempSync, rmSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { JSDOM, VirtualConsole, requestInterceptor } = await import("jsdom");

  const outDir = mkdtempSync(join(tmpdir(), "portfolio-error-reporting-"));
  try {
    await promisify(execFile)(process.execPath, ["node_modules/@11ty/eleventy/cmd.cjs", "--output", outDir], {
      timeout: 60000,
      env: { ...process.env, SENTRY_DSN: DSN },
    });
    const html = readFileSync(join(outDir, "index.html"), "utf8");

    /** @type {string[]} */
    const loaded = [];
    // Serve this build's scripts; answer anything else locally, never from the network.
    const siteOnly = requestInterceptor((request) => {
      loaded.push(request.url);
      const { origin, pathname } = new URL(request.url);
      if (origin === "https://waseemilyas.uk" && pathname.startsWith("/assets/js/")) {
        return new Response(readFileSync(join(outDir, pathname)), { headers: { "Content-Type": "text/javascript" } });
      }
      return new Response("", { status: 404 });
    });
    /** @type {{ url: string, body: string }[]} */
    const sent = [];
    const ready = new Promise((resolve) => {
      const dom = new JSDOM(html, {
        url: "https://waseemilyas.uk/",
        runScripts: "dangerously",
        resources: { interceptors: [siteOnly] },
        virtualConsole: new VirtualConsole(),
        beforeParse(window) {
          window.matchMedia = (media) => ({ matches: true, media, addEventListener() {}, removeEventListener() {} });
          // @ts-ignore jsdom has no fetch; record what the SDK sends instead of sending it.
          window.fetch = async (url, init) => {
            sent.push({ url: String(url), body: String(init?.body ?? "") });
            return { status: 200, headers: { get: () => null } };
          };
        },
      });
      dom.window.addEventListener("load", () => resolve(dom.window));
    });
    const window = /** @type {any} */ (await ready);
    const reporting = () => loaded.filter((u) => /sentry/.test(u) || !u.startsWith("https://waseemilyas.uk/"));
    assert.deepEqual(reporting(), [], "a normal visit fetches nothing for error reporting and nothing off-site");

    window.eval('setTimeout(function () { throw new Error("portfolio test error"); })');
    const deadline = Date.now() + 5000;
    while (!sent.some((s) => s.body.includes("portfolio test error")) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));

    assert.deepEqual(reporting(), ["https://waseemilyas.uk/assets/js/sentry-10.78.0.min.js"],
      "the first error loads only the pinned SDK, from this site");
    // The SDK also sends release-health session envelopes, as it did under the loader.
    const events = sent.filter((s) => s.body.includes('{"type":"event"}'));
    assert.equal(events.length, 1, "one error report reaches Sentry");
    assert.ok(sent.every((s) => s.url.startsWith("https://o1.ingest.de.sentry.io/api/1/envelope/")), "reports go only to the DSN's ingest");
    assert.match(events[0].body, /portfolio test error/);
    window.close();
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
