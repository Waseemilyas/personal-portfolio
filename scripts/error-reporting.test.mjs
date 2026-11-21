// Error reporting, driven against a real production-shaped build in jsdom. A normal
// visit must fetch nothing for Sentry (no third party learns of the visit), and the
// first error must still load the pinned SDK from this site and reach Sentry's
// ingest. Either half failing is silent in production: a privacy leak nobody sees,
// or errors nobody hears about.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { JSDOM, VirtualConsole, requestInterceptor } from "jsdom";
import { builtScriptUrl, builtSite, skipReason } from "./built-site.mjs";
import monitoring from "../src/_data/monitoring.js";

const site = "https://waseemilyas.uk";
const sample = {
  missingPath: "sample-missing-path",
  query: "sample-query-value",
  fragment: "sample-fragment-value",
  referrer: "sample-referrer-path",
  sourceQuery: "sample-source-query",
  history: "sample-history-value",
  console: "sample-console-value",
  rejection: "sample-rejection-value",
  rejectionText: "sample-rejection-text",
  exceptionText: "sample-exception-value",
  causeText: "sample-cause-value",
  exceptionName: "SamplePrivateErrorName",
  stackLabel: "samplePrivateStackLabel",
  stackPath: "sample-private-stack-path",
  blocked: "sample-blocked-resource-path",
};

test("error reporting sends errors and source lines without visitor browsing data", { skip: skipReason }, async () => {
  // The shared build carries the test DSN (scripts/built-site.mjs), as production carries its own.
  const outDir = await builtSite();
  let dom;
  try {
    // Pages serves this document at the requested path, even if that path is private.
    const html = readFileSync(join(outDir, "404.html"), "utf8");

    const siteScript = builtScriptUrl(html);

    /** @type {string[]} */
    const loaded = [];
    // Serve this build's scripts; answer anything else locally, never from the network.
    const siteOnly = requestInterceptor((request) => {
      loaded.push(request.url);
      const { origin, pathname, searchParams } = new URL(request.url);
      if (origin === site && pathname.startsWith("/assets/js/")) {
        const script = pathname === siteScript && searchParams.has("case")
          ? `window.fail = function (message, name, cause, extraFrames) {
              setTimeout(function () {
                const error = new TypeError(message, cause && { cause: new Error(cause) });
                if (name) error.name = name;
                if (extraFrames) error.stack += extraFrames;
                throw error;
              });
            };`
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
          // The SDK sends a URL string and a string envelope; anything else records as "".
          const body = typeof init?.body === "string" ? init.body : "";
          sent.push({ url: typeof url === "string" ? url : url instanceof URL ? url.href : url.url, body, referrerPolicy: init?.referrerPolicy });
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
    script.src = `${siteScript}?case=${sample.sourceQuery}`;
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
      window.document.head.append(script);
    });
    const events = () => sent.flatMap(({ body }) => {
      const [, item, payload] = body.split("\n");
      return JSON.parse(item).type === "event" ? [JSON.parse(payload)] : [];
    });
    const waitFor = async (count) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const event = events()[count - 1];
        if (event) return event;
        await delay(50);
      }
      assert.fail("Expected Sentry event was not sent");
    };

    window.fail(sample.exceptionText, undefined, sample.causeText,
      `\n    at ${sample.stackLabel} (${site}${siteScript}:91:7)` +
      `\n    at wrapped (${site}/assets/js/${sample.stackPath}.js:8:2)`);
    const first = await waitFor(1);
    window.history.pushState({}, "", `?${sample.history}`);
    window.console.warn(sample.console);
    window.fail("later portfolio test error", sample.exceptionName);
    const later = await waitFor(2);
    window.dispatchEvent(Object.assign(new window.Event("unhandledrejection"), { reason: { details: sample.rejection } }));
    await waitFor(3);
    window.dispatchEvent(Object.assign(new window.Event("unhandledrejection"), { reason: sample.rejectionText }));
    await waitFor(4);
    const block = () => window.dispatchEvent(Object.assign(new window.Event("securitypolicyviolation"), {
      effectiveDirective: "img-src",
      blockedURI: `https://example.test/${sample.blocked}?size=1`,
    }));
    block();
    block();
    const policy = await waitFor(5);

    assert.deepEqual(reporting(), [`${site}/assets/js/${monitoring.sdkFile}`],
      "the first error loads only the pinned SDK, from this site");
    const sdk = window.document.querySelector(`script[src="/assets/js/${monitoring.sdkFile}"]`);
    const sdkIntegrity = sdk.integrity;
    const policyMeta = window.document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    assert.match(sdkIntegrity, /^sha384-/);
    assert.ok(policyMeta.content.split("; ").find((rule) => rule.startsWith("script-src "))?.split(" ").includes(`'${sdkIntegrity}'`),
      "the policy authorises the SDK by the same integrity hash as its loader");
    for (const marker of Object.values(sample)) {
      assert.ok(sent.every(({ body }) => !body.includes(marker)), `visitor data reached the ingest: ${marker}`);
    }
    assert.equal(sent.length, 5, "send only the five diagnostic events, with no sessions or duplicate warnings");
    assert.ok(sent.every((s) => s.url.startsWith("https://o1.ingest.de.sentry.io/api/1/envelope/")), "reports go only to the DSN's ingest");
    assert.ok(sent.every((s) => s.referrerPolicy === "no-referrer"), "omit the transport referrer too");
    assert.deepEqual(first.request, { url: `${site}/404.html` });
    assert.equal(first.release, window.document.querySelector('meta[name="waseemilyas-revision"]').content);
    const error = first.exception.values.find(({ type }) => type === "TypeError");
    assert.ok(error?.stacktrace?.frames.some((frame) => frame.filename === site + siteScript && frame.lineno > 0));
    assert.ok(first.exception.values.some(({ type }) => type === "Error"), "keep the category of a linked cause");
    assert.equal(later.exception.values[0].type, "Error");
    assert.ok(events().slice(2, 4).every((event) => event.exception.values.some(({ type }) => type === "UnhandledRejection")));
    assert.equal(policy.message, "CSP blocked img-src resource");
    // SDK 11 lets Sentry infer the sender's IP and attaches call-site stacks unless told not to.
    assert.ok(events().every((event) => event.sdk.settings.infer_ip === "never" && !event.user), "never infer the visitor's IP");
    assert.equal(policy.exception, undefined, "a policy warning carries no synthetic stack");
    assert.equal(policy.level, "warning");
  } finally {
    dom?.window.close();
  }
});
