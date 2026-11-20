// Loaded once per test run (`node --test --test-global-setup`): every test file
// shares one build of the site in this directory (scripts/built-site.mjs).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function globalSetup() {
  process.env.PORTFOLIO_TEST_SITE = mkdtempSync(join(tmpdir(), "portfolio-test-site-"));
}

export function globalTeardown() {
  const dir = process.env.PORTFOLIO_TEST_SITE;
  if (dir) rmSync(dir, { recursive: true, force: true });
}
