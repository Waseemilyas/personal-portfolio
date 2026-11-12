// Browser error reporting to Sentry, served entirely from this site.
//
// The Sentry SDK is a pinned copy in vendor/, published as /assets/js/<file>, and
// the page downloads it only after an error. Nothing third-party loads on a normal
// visit, and no Sentry dashboard setting can change the code visitors run (the
// remote loader script could switch on session replay or tracing). Error reports
// still go to Sentry's ingest origin, which the Content Security Policy allows.
//
// To update the SDK: download https://browser.sentry-cdn.com/<version>/bundle.min.js
// into vendor/sentry-<version>.min.js unchanged, and set SDK_FILE and SDK_SHA384
// (openssl dgst -sha384 -binary <file> | base64). The build refuses a copy whose
// bytes do not match the pinned hash.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const SDK_FILE = "sentry-10.78.0.min.js";
/** SHA-384 of the unmodified Sentry CDN bundle (errors only, no tracing or replay). */
const SDK_SHA384 = "5/nIGpuat0ibsfxpyjRqSdTH87b7gz39FKNgRmCjSBU1CZ4e0MjlG40zWTQEYtXw";

const sdkBytes = readFileSync(new URL(`../../vendor/${SDK_FILE}`, import.meta.url));
const actual = createHash("sha384").update(sdkBytes).digest("base64");
if (actual !== SDK_SHA384) {
  throw new Error(`vendor/${SDK_FILE} does not match its pinned SHA-384; restore the unmodified Sentry bundle`);
}

const dsn = process.env.SENTRY_DSN || "";

let sentrySdkUrl = "";
let sentrySdkIntegrity = "";
let sentryDsnJson = "";
/** Origins the page needs for Sentry, listed in the Content Security Policy. */
let cspConnectOrigins = /** @type {string[]} */ ([]);
if (dsn) {
  try {
    const dsnUrl = new URL(dsn);
    const hostnameParts = dsnUrl.hostname.split(".");
    const ingestIndex = hostnameParts.indexOf("ingest");
    const sentryIngestHost =
      ingestIndex > 0 &&
      ["sentry", "io"].every((part, index) =>
        hostnameParts[hostnameParts.length - 2 + index] === part,
      );
    if (dsnUrl.protocol === "https:" && dsnUrl.username && sentryIngestHost) {
      sentrySdkUrl = `/assets/js/${SDK_FILE}`;
      sentrySdkIntegrity = `sha384-${SDK_SHA384}`;
      sentryDsnJson = JSON.stringify(dsnUrl.href);
      cspConnectOrigins = [dsnUrl.origin];
    }
  } catch {
    // An unset or malformed build secret must never stop a static-site deploy.
  }
}

// Default export only: Eleventy exposes a data file with named exports as its module namespace.
export default { sdkFile: SDK_FILE, sentrySdkUrl, sentrySdkIntegrity, sentryDsnJson, cspConnectOrigins };
