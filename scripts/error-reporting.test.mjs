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
const site = "https://waseemilyas.uk";
const probeScript = "/assets/js/probe.js";
const sample = {
  missingPath: "sample-missing-path",
  query: "sample-query-value",
  fragment: "sample-fragment-value",
  referrer: "sample-referrer-path",
  sourceQuery: "sample-source-query",
  history: "sample-history-value",
  console: "sample-console-value",
  rejection: "sample-rejection-value",
  blocked: "sample-blocked-resource-path",
};

test("error reporting sends errors and source lines without visitor browsing data", { skip: skipReason }, async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { mkdtempSync, rmSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { setTimeout: delay } = await import("node:timers/promises");
  const { JSDOM, VirtualConsole, requestInterceptor } = await import("jsdom");

  const outDir = mkdtempSync(join(tmpdir(), "portfolio-error-reporting-"));
  let dom;
  try {
    await promisify(execFile)(process.execPath, ["node_modules/@11ty/eleventy/cmd.cjs", "--output", outDir], {
      timeout: 180_000,
      env: { ...process.env, SENTRY_DSN: DSN },
    });
    // Pages serves this document at the requested path, even if that path is private.
    const html = readFileSync(join(outDir, "404.html"), "utf8");

    /** @type {string[]} */
    const loaded = [];
    // Serve this build's scripts; answer anything else locally, never from the network.
    const siteOnly = requestInterceptor((request) => {
      loaded.push(request.url);
      const { origin, pathname } = new URL(request.url);
      if (origin === site && pathname.startsWith("/assets/js/")) {
        const script = pathname === probeScript
          ? "window.fail = function (message) { setTimeout(function () { throw new TypeError(message); }); };"
          : readFileSync(join(outDir, pathname));
        return new Response(script, { headers: { "Content-Type": "text/javascript" } });
      }
      return new Response("", { status: 404 });
    });
    /** @type {{ url: string, body: string, referrerPolicy: string }[]} */
    const sent = [];
    dom = new JSDOM(html, {
      url: `${site}/${sample.missingPath}/?utm_campaign=${sample.query}#${sample.fragment}`,
      referrer: `https://example.test/${sample.referrer}`,
      runScripts: "dangerously",
      resources: { interceptors: [siteOnly] },
      virtualConsole: new VirtualConsole(),
      beforeParse(window) {
        window.matchMedia = (media) => ({ matches: true, media, addEventListener() {}, removeEventListener() {} });
        // @ts-ignore jsdom has no fetch; record what the SDK sends instead of sending it.
        window.fetch = async (url, init) => {
          sent.push({ url: String(url), body: String(init?.body ?? ""), referrerPolicy: init?.referrerPolicy });
          return { status: 200, headers: { get: () => null } };
        };
      },
    });
    const window = /** @type {any} */ (dom.window);
    await new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
    const reporting = () => loaded.filter((u) => /sentry/.test(u) || !u.startsWith(`${site}/`));
    assert.deepEqual(reporting(), [], "a normal visit fetches nothing for error reporting and nothing off-site");
    assert.deepEqual(sent, [], "a normal visit sends no monitoring traffic");

    const script = window.document.createElement("script");
    script.src = `${probeScript}?case=${sample.sourceQuery}`;
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
      window.document.head.append(script);
    });
    const events = () => sent.flatMap(({ body }) => {
      const [, item, payload] = body.split("\n");
      return JSON.parse(item).type === "event" ? [JSON.parse(payload)] : [];
    });
    const waitFor = async (predicate) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const event = events().find(predicate);
        if (event) return event;
        await delay(50);
      }
      assert.fail("Expected Sentry event was not sent");
    };

    window.fail("first portfolio test error");
    const first = await waitFor((event) => event.exception?.values[0]?.value === "first portfolio test error");
    window.history.pushState({}, "", `?${sample.history}`);
    window.console.warn(sample.console);
    window.fail("later portfolio test error");
    await waitFor((event) => event.exception?.values[0]?.value === "later portfolio test error");
    window.dispatchEvent(Object.assign(new window.Event("unhandledrejection"), { reason: { details: sample.rejection } }));
    await waitFor((event) => event.exception?.values[0]?.type === "UnhandledRejection");
    const block = () => window.dispatchEvent(Object.assign(new window.Event("securitypolicyviolation"), {
      effectiveDirective: "img-src",
      blockedURI: `https://example.test/${sample.blocked}?size=1`,
    }));
    block();
    block();
    const policy = await waitFor((event) => event.message?.startsWith("CSP blocked img-src"));

    assert.deepEqual(reporting(), ["https://waseemilyas.uk/assets/js/sentry-10.78.0.min.js"],
      "the first error loads only the pinned SDK, from this site");
    for (const marker of Object.values(sample)) {
      assert.ok(sent.every(({ body }) => !body.includes(marker)), `visitor data reached the ingest: ${marker}`);
    }
    assert.equal(sent.length, 4, "send only the four diagnostic events, with no sessions or duplicate warnings");
    assert.ok(sent.every((s) => s.url.startsWith("https://o1.ingest.de.sentry.io/api/1/envelope/")), "reports go only to the DSN's ingest");
    assert.ok(sent.every((s) => s.referrerPolicy === "no-referrer"), "omit the transport referrer too");
    assert.deepEqual(first.request, { url: `${site}/404.html` });
    assert.equal(first.release, window.document.querySelector('meta[name="waseemilyas-revision"]').content);
    assert.equal(first.exception.values[0].type, "TypeError");
    assert.ok(first.exception.values[0].stacktrace.frames.some((frame) => frame.filename === site + probeScript && frame.lineno > 0));
    assert.equal(policy.message, "CSP blocked img-src resource");
    assert.equal(policy.level, "warning");
  } finally {
    dom?.window.close();
    rmSync(outDir, { recursive: true, force: true });
  }
});
