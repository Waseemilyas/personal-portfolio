#!/usr/bin/env node
// Quick tier: lint, strict JavaScript types, privacy scan, and only named tests.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
const tests = process.argv.slice(2);
for (const file of tests) {
  if (!/^scripts\/[\w-]+\.test\.mjs$/.test(file) || !existsSync(file)) {
    throw new Error(`Name an existing scripts/*.test.mjs file: ${file}`);
  }
}
for (const args of [["run", "lint"], ["run", "typecheck"], ["exec", "node", "scripts/content-guard.mjs"],
  ...(tests.length ? [["exec", "node", "--test", "--test-concurrency=1", "--test-global-setup=scripts/test-setup.mjs", ...tests]] : [])]) {
  const result = spawnSync("pnpm", args, { stdio: "inherit", timeout: 600_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
