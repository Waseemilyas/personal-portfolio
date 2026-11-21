// /.well-known/security.txt (RFC 9116): where to report a security problem with the site.
//
// The build writes it (src/security.txt.njk) with an Expires date VALID_DAYS after the
// built commit, so every release renews it and two builds of one commit match byte for
// byte. RFC 9116 asks for less than a year. site-check checks the built file, and
// domain-check checks the live one daily, failing MIN_DAYS before it lapses, which only
// happens if nothing is released for about five months. Node built-ins only: the daily
// domain job checks out this file and domain-check.mjs alone.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PATH = ".well-known/security.txt";
export const VALID_DAYS = 180;

/**
 * The time of the commit this code was checked out at, so two builds of one commit match.
 * Git runs beside this file, not in the build's working directory, which a test may have
 * copied elsewhere. A tree with no git history (an exported archive) uses the build clock.
 */
export function commitDate() {
  try {
    const cwd = fileURLToPath(new URL(".", import.meta.url));
    return new Date(execFileSync("git", ["log", "-1", "--format=%cI"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
  } catch {
    return new Date();
  }
}

/** The Expires value for a build of a commit made at `committed`. */
export function expiresFor(/** @type {Date} */ committed) {
  return new Date(committed.getTime() + VALID_DAYS * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Every rule of RFC 9116 the file breaks, as plain sentences.
 * @param {string} text the file's contents
 * @param {{ url: string, email?: string, now: Date, minDays?: number }} expected
 *   email: the exact address Contact must give; without it any mailto: or https: contact does
 */
export function securityTxtProblems(text, { url, email, now, minDays = 0 }) {
  const problems = [];
  /** @type {Record<string, string[]>} */
  const fields = {};
  for (const line of text.split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const m = /^([A-Za-z-]+): (\S.*)$/.exec(line);
    if (!m) {
      problems.push(`unreadable line "${line}"`);
      continue;
    }
    (fields[m[1].toLowerCase()] ??= []).push(m[2]);
  }
  if (!text.endsWith("\n")) problems.push("does not end with a newline");
  const contact = fields.contact ?? [];
  if (email ? !contact.includes(`mailto:${email}`) : !contact.some((c) => /^(mailto|https):/.test(c))) {
    problems.push(`has no Contact: ${email ? `mailto:${email}` : "mailto: or https: address"}`);
  }
  if ((fields.canonical ?? []).join() !== url) problems.push(`Canonical must be exactly ${url}`);
  const expires = fields.expires ?? [];
  const at = new Date(expires[0] ?? "");
  if (expires.length !== 1 || Number.isNaN(at.getTime())) {
    problems.push("must have exactly one Expires date");
  } else {
    const days = Math.floor((at.getTime() - now.getTime()) / 86_400_000);
    if (days > 365) problems.push(`Expires is ${days} days away; RFC 9116 asks for less than a year`);
    if (days < minDays) problems.push(`Expires in ${days} days; release the site to renew it`);
  }
  return problems;
}
