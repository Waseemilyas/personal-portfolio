// Content Security Policy for every built page.
//
// GitHub Pages cannot send response headers, so the policy is a <meta http-equiv>
// placed straight after <meta charset>, before any script, style or font loads.
// Inline scripts and the inlined stylesheet (scripts/inline-css.mjs) are allowed only
// by the SHA-256 of their exact text, computed from the rendered page, so editing one
// can never silently break it. 'unsafe-inline'
// and 'unsafe-eval' are never used, and no third-party origin may run script: an
// outside library is pinned and served from this site (as the Sentry SDK is). The
// meta form cannot carry frame-ancestors or report-uri; violations are reported to
// Sentry from the page instead.
//
// Trusted Types are enforced: no page script may hand a plain string to an HTML or
// script sink (innerHTML, document.write, a script's src or text, eval-like timers).
// The only policies allowed are the ones the page's own hashed inline scripts create
// by name, so injected code cannot mint its own; a page that creates none gets
// trusted-types 'none'.
import { createHash } from "node:crypto";

/** Script types a browser executes; anything else (JSON-LD) is a data block CSP ignores. */
const EXECUTABLE = new Set(["", "text/javascript", "application/javascript", "module", "speculationrules"]);

/** @param {string} attrs raw attribute text of a <script> tag @param {string} name */
const attr = (attrs, name) => attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));

/**
 * Exact text of every inline script the browser would execute.
 * @param {string} html
 * @returns {string[]}
 */
export function inlineScripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(([, attrs]) => {
      if (attr(attrs, "src")) return false;
      const type = attr(attrs, "type");
      return EXECUTABLE.has((type ? (type[2] ?? type[3] ?? type[4] ?? "") : "").trim().toLowerCase());
    })
    .map(([, , body]) => body ?? "");
}

/**
 * Exact text of every inline <style> block.
 * @param {string} html
 * @returns {string[]}
 */
export function inlineStyles(html) {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map(([, body]) => body ?? "");
}

/**
 * Names of the Trusted Types policies the page's inline scripts create.
 * @param {string} html
 * @returns {string[]}
 */
export function trustedTypePolicies(html) {
  const names = inlineScripts(html).flatMap((body) =>
    [...body.matchAll(/\btrustedTypes\.createPolicy\(\s*["']([\w-]+)["']/g)].map(([, name]) => name ?? ""),
  );
  return [...new Set(names)];
}

/** @param {string} source */
export const scriptHash = (source) => `'sha256-${createHash("sha256").update(source, "utf8").digest("base64")}'`;

/**
 * @param {string} html a rendered page
 * @param {{ connectOrigins?: string[] }} [allow] third-party origins the page may send data to
 * @returns {string} the policy for this page
 */
export function policyFor(html, { connectOrigins = [] } = {}) {
  const hashes = [...new Set(inlineScripts(html).map(scriptHash))];
  const styleHashes = [...new Set(inlineStyles(html).map(scriptHash))];
  const policies = trustedTypePolicies(html);
  return [
    "default-src 'none'",
    ["script-src 'self'", ...hashes].join(" "),
    ["style-src 'self'", ...styleHashes].join(" "),
    "img-src 'self'",
    "font-src 'self'",
    "media-src 'self'",
    "manifest-src 'self'",
    ["connect-src 'self'", ...connectOrigins].join(" "),
    "base-uri 'none'",
    "form-action 'none'",
    "upgrade-insecure-requests",
    "require-trusted-types-for 'script'",
    `trusted-types ${policies.length ? policies.join(" ") : "'none'"}`,
  ].join("; ");
}

/**
 * Insert the page's policy as the first element after <meta charset>.
 * @param {string} html
 * @param {{ connectOrigins?: string[] }} [allow]
 */
export function withPolicy(html, allow) {
  const charset = /<meta charset="utf-8">/i;
  if (!charset.test(html)) throw new Error('CSP: page has no <meta charset="utf-8"> to anchor the policy');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policyFor(html, allow)}">`;
  return html.replace(charset, (m) => `${m}\n${meta}`);
}
