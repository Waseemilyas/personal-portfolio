// The Pages build job runs every package it installs before it uploads the site, so a
// swapped package could rewrite any page, policy hashes included. npm packages are held by
// the lockfile's integrity hashes and Chrome by its SHA-256 (chrome-for-testing.sh). Python
// packages must be held the same way: by version alone, pip installs any file PyPI serves
// for that version, including one added to the release after it was published.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const REQUIREMENTS = "scripts/requirements.txt";

test("workflows install Python packages only from the hash-locked requirements", () => {
  const dir = new URL("../.github/workflows/", import.meta.url);
  const installs = readdirSync(dir).filter((f) => f.endsWith(".yml")).flatMap((file) =>
    readFileSync(new URL(file, dir), "utf8").split("\n")
      .filter((line) => /\bpip3?\s+install\b|\buv\s+pip\s+install\b|\bpipx?\s+run\b/.test(line))
      .map((line) => ({ file, line: line.trim() })));
  assert.ok(installs.length >= 2, "expected the CI and Pages share-card installs");
  // Quoted: unquoted, YAML reads ":all: -r" as a mapping and GitHub rejects the workflow.
  const expected = `run: 'python3 -m pip install --require-hashes --only-binary=:all: -r ${REQUIREMENTS}'`;
  for (const { file, line } of installs) assert.equal(line, expected, `${file}: install Python packages only as ${expected}`);
});

test("every Python requirement pins one version and its file hashes", () => {
  const text = readFileSync(new URL(`../${REQUIREMENTS}`, import.meta.url), "utf8");
  const requirements = text.replace(/\\\n/g, " ").split("\n").map((line) => line.replace(/#.*/, "").trim()).filter(Boolean);
  assert.ok(requirements.length >= 1);
  for (const requirement of requirements) {
    const [spec, ...options] = requirement.split(/\s+/);
    assert.match(spec, /^[A-Za-z0-9._-]+==[A-Za-z0-9.]+$/, `pin an exact version: ${spec}`);
    assert.ok(options.length >= 1, `list the file hashes for ${spec}`);
    for (const option of options) assert.match(option, /^--hash=sha256:[0-9a-f]{64}$/, `${spec}: ${option}`);
  }
});
