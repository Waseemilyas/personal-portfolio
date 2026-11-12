// Content Security Policy for every built page.
//
// GitHub Pages cannot send response headers, so the policy is a <meta http-equiv>
// placed straight after <meta charset>, before any script, style or font loads.
// Inline scripts are allowed only by the SHA-256 of their exact text, computed from
// the rendered page, so editing one can never silently break it. 'unsafe-inline'
// and 'unsafe-eval' are never used. The meta form cannot carry frame-ancestors or
// report-uri; violations are reported to Sentry from the page instead.
import { createHash } from "node:crypto";

/** Script types a browser executes; anything else (JSON-LD) is a data block CSP ignores. */
const EXECUTABLE = new Set(["", "text/javascript", "application/javascript", "module"]);

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

/** @param {string} source */
export const scriptHash = (source) => `'sha256-${createHash("sha256").update(source, "utf8").digest("base64")}'`;

/**
 * @param {string} html a rendered page
 * @param {{ scriptOrigins?: string[], connectOrigins?: string[] }} [allow] third-party origins
 * @returns {string} the policy for this page
 */
export function policyFor(html, { scriptOrigins = [], connectOrigins = [] } = {}) {
  const hashes = [...new Set(inlineScripts(html).map(scriptHash))];
  return [
    "default-src 'none'",
    ["script-src 'self'", ...hashes, ...scriptOrigins].join(" "),
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    "media-src 'self'",
    "manifest-src 'self'",
    ["connect-src 'self'", ...connectOrigins].join(" "),
    "base-uri 'none'",
    "form-action 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Insert the page's policy as the first element after <meta charset>.
 * @param {string} html
 * @param {{ scriptOrigins?: string[], connectOrigins?: string[] }} [allow]
 */
export function withPolicy(html, allow) {
  const charset = /<meta charset="utf-8">/i;
  if (!charset.test(html)) throw new Error('CSP: page has no <meta charset="utf-8"> to anchor the policy');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policyFor(html, allow)}">`;
  return html.replace(charset, (m) => `${m}\n${meta}`);
}
