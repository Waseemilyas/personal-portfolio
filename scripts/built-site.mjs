// One production-shaped build of the site, shared by every test that reads it.
// `pnpm test` and `pnpm check <tests>` load scripts/test-setup.mjs, which names one
// empty directory for the whole run: the first test that asks builds into it and
// later test files read the same build. A test file run on its own builds into a
// temporary directory of its own and removes it on exit.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const ELEVENTY = "node_modules/@11ty/eleventy/cmd.cjs";
const DONE = ".build-complete";

/** A test DSN, so the build carries error reporting as production does. Nothing is sent to it. */
export const TEST_DSN = "https://0123456789abcdef0123456789abcdef@o1.ingest.de.sentry.io/1";

/** False when the site can be built, or the reason a build test is skipped. */
export const skipReason = existsSync(ELEVENTY) ? false : "eleventy not installed — run pnpm install";

/** The version of the shared script this page loads. @param {string} html */
export function builtScriptUrl(html) {
  const url = /<script id="site-script" src="([^"]+)"/.exec(html)?.[1];
  assert.ok(url, "the page references its site script");
  return url;
}

/** @type {Promise<string> | undefined} */
let pending;

/** The built site's directory, building it first if this run has not yet. */
export function builtSite() {
  pending ??= build().catch((error) => {
    pending = undefined;
    throw error;
  });
  return pending;
}

async function build() {
  let outDir = process.env.PORTFOLIO_TEST_SITE;
  if (!outDir) {
    const own = mkdtempSync(join(tmpdir(), "portfolio-test-site-"));
    process.on("exit", () => rmSync(own, { recursive: true, force: true }));
    outDir = own;
  }
  if (existsSync(join(outDir, DONE))) return outDir;
  await promisify(execFile)(process.execPath, [ELEVENTY, "--output", outDir], {
    timeout: 180_000,
    env: { ...process.env, SENTRY_DSN: TEST_DSN },
  });
  writeFileSync(join(outDir, DONE), "");
  return outDir;
}
