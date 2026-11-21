// The domain check is the only thing that notices a weakened CAA policy or a certificate
// renewal it blocks, so each rule gets one red case against the known-good live state.
import test from "node:test";
import assert from "node:assert/strict";

import { evaluate, findDsn, parseCaa } from "./domain-check.mjs";

const now = new Date("2026-11-20T00:00:00Z");
const STRICT = ['0 issue "letsencrypt.org"', '0 issuewild ";"'];
/** @param {Partial<import("./domain-check.mjs").Facts>} change */
const facts = (change = {}) => ({
  domain: "example.test",
  now,
  dns: [{ resolver: "r", ad: true, caaAd: true, caa: STRICT }],
  certs: [{ host: "example.test", issuer: "Let's Encrypt", validTo: new Date("2027-01-20T00:00:00Z") }],
  redirects: [{ url: "http://example.test/", status: 301, location: "https://example.test/" }],
  ingest: { page: "https://example.test/", dsn: true, own: 200, foreign: 403 },
  ...change,
});
const dnsWith = (/** @type {Partial<import("./domain-check.mjs").DnsFacts>} */ change) =>
  facts({ dns: [{ resolver: "r", ad: true, caaAd: true, caa: STRICT, ...change }] });
const fails = (/** @type {import("./domain-check.mjs").Facts} */ f, /** @type {RegExp} */ pattern) => {
  const failures = evaluate(f);
  assert.ok(failures.some((x) => pattern.test(x)), `expected ${pattern} in ${JSON.stringify(failures)}`);
};

test("the live policy passes", () => assert.deepEqual(evaluate(facts()), []));

test("parses resolver CAA text, parameters included", () => {
  assert.deepEqual(parseCaa('128 issue "letsencrypt.org; validationmethods=http-01"'),
    { flags: 128, tag: "issue", value: "letsencrypt.org; validationmethods=http-01" });
});

test("CAA rules", () => {
  fails(dnsWith({ caa: [] }), /no CAA records, so any CA/);
  // What Cloudflare publishes while Universal SSL is on.
  fails(dnsWith({ caa: [...STRICT, '0 issue "pki.goog; cansignhttpexchanges=yes"', '0 issue "ssl.com"'] }),
    /also lets pki\.goog, ssl\.com issue/);
  fails(dnsWith({ caa: ['0 issue "digicert.com"', '0 issuewild ";"'] }), /does not let letsencrypt\.org issue/);
  fails(dnsWith({ caa: ['0 issue "letsencrypt.org"'] }), /forbid wildcard/);
  fails(dnsWith({ caa: [...STRICT, '0 issuewild "letsencrypt.org"'] }), /forbid wildcard/);
  fails(dnsWith({ caa: [...STRICT, '128 tbs "x"'] }), /critical tbs/);
  fails(dnsWith({ caa: ["garbage"] }), /unreadable CAA/);
});

test("DNSSEC, certificate and redirect rules", () => {
  fails(dnsWith({ ad: false }), /not DNSSEC-authenticated/);
  fails(dnsWith({ caaAd: false }), /CAA answer is not DNSSEC-authenticated/);
  fails(facts({ certs: [{ host: "example.test", issuer: "Sectigo Limited", validTo: new Date("2027-01-20") }] }),
    /from Sectigo Limited, which the CAA does not allow/);
  fails(facts({ certs: [{ host: "example.test", issuer: "Let's Encrypt", validTo: new Date("2026-12-01T00:00:00Z") }] }),
    /expires in 11 days/);
  fails(facts({ redirects: [{ url: "http://example.test/", status: 200, location: "" }] }), /answered 200, not a permanent/);
  fails(facts({ redirects: [{ url: "http://example.test/", status: 302, location: "https://example.test/" }] }), /answered 302/);
});

test("error-report origin rules", () => {
  const ingest = (/** @type {Partial<import("./domain-check.mjs").IngestFacts>} */ change) =>
    facts({ ingest: { page: "https://example.test/", dsn: true, own: 200, foreign: 403, ...change } });
  // Sentry's default Allowed Domains is "*": any website can file reports against the public DSN.
  fails(ingest({ foreign: 200 }), /200 to a report from another website, not 403/);
  fails(ingest({ own: 403 }), /site's own error reports are refused/);
  fails(ingest({ dsn: false, own: undefined, foreign: undefined }), /carries no Sentry DSN/);
});

test("finds the DSN in the minified error loader", () => {
  const key = "ab".repeat(16); // a dummy public key in the DSN shape
  const dsn = findDsn(`<script>Sentry.init({dsn:"https://${key}@o1.ingest.de.sentry.io/42",release:"x"})</script>`);
  assert.equal(dsn?.username, key);
  assert.equal(dsn?.pathname, "/42");
  assert.equal(findDsn('<script>fetch("https://example.test/")</script>'), null);
});
