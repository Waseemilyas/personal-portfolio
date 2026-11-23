// Focused node:test suite for scripts/content-guard.mjs.
//
// Verifies that AGENTS.md §1 content guardrails are strictly enforced,
// that each guard fires on synthetic planted violations, and that the
// grandfathered carve-out behaves as documented.
//
// Fixtures use only obviously synthetic placeholders (synthetic domains,
// example networks, fake IDs). No private or real client details ever appear.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkContent,
  runContentGuard,
} from "./content-guard.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "content-guard.mjs");
const HOOK = new URL("../.githooks/pre-push", import.meta.url);

function makeFixture(t) {
  const root = mkdtempSync(join(os.tmpdir(), "content-guard-fixture-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  mkdirSync(join(root, "src", "_data"), { recursive: true });
  mkdirSync(join(root, "src", "notes"), { recursive: true });

  writeFileSync(
    join(root, "src", "index.njk"),
    "<h1>Waseem Ilyas</h1><p>Contact: waseem@automancer.uk</p>\n"
  );
  writeFileSync(
    join(root, "src", "notes", "index.njk"),
    "<h2>Notes</h2><p>Reflections on automation.</p>\n"
  );
  writeFileSync(
    join(root, "src", "_data", "site.json"),
    JSON.stringify({ email: "waseem@automancer.uk" }, null, 2)
  );

  return { root, srcDir: join(root, "src") };
}

// ---------------------------------------------------------------------------
// positive controls

test("clean fixture passes with zero violations", () => {
  const fx = makeFixture(test);
  const { violations, stats } = runContentGuard({ dir: fx.srcDir });
  assert.deepEqual(violations, []);
  assert.equal(stats.files, 3);
});

test("repository tree passes content guard across docs, skills, workflows and src/", () => {
  const { violations, stats } = runContentGuard();
  assert.deepEqual(violations, []);
  assert.ok(stats.files >= 80, `expected whole-repo coverage, scanned ${stats.files}`);
});

// ---------------------------------------------------------------------------
// negative controls — synthetic planted violations

test("planted currency violations fail guard/currency", () => {
  for (const amount of ["£500", "$1,200", "€350", "450 GBP", "1000 USD", "£10k"]) {
    const violations = checkContent("test.njk", `<p>Cost was ${amount}</p>`);
    assert.equal(
      violations.length,
      1,
      `expected 1 violation for "${amount}", got: ${JSON.stringify(violations)}`
    );
    assert.equal(violations[0].check, "guard/currency");
    assert.match(violations[0].message, /currency amount found/);
  }
});

test("planted filesystem paths fail guard/filesystem-paths", () => {
  for (const path of [
    "/opt/internal-tool/cache",
    "/home/synthetic-user/repo",
    "/Users/synthetic-dev/secrets",
    "/Volumes/SyntheticDisk/work",
    "/private/var/synthetic-sock",
    "/etc/synthetic-config.conf",
    "~/.agents/skills/synthetic-helper/run.sh",
    "~/.local/share/synthetic-runner/state",
    "~/.ssh/id_ed25519",
    "C:\\Users\\synthetic\\data",
  ]) {
    const violations = checkContent("test.njk", `<p>Located at ${path}</p>`);
    assert.equal(
      violations.length,
      1,
      `expected 1 violation for "${path}", got: ${JSON.stringify(violations)}`
    );
    assert.equal(violations[0].check, "guard/filesystem-paths");
    assert.match(violations[0].message, /internal filesystem path/);
  }
});

test("planted IPv4 and IPv6 addresses fail guard/network-ip while browser versions pass", () => {
  for (const ip of ["192.168.1.105", "fd7a:115c:a1e0::1", "fe80::1ff:fe23:4567:890a", "2001:db8:85a3::1"]) {
    const violations = checkContent("test.njk", `<p>Server at ${ip}</p>`);
    assert.equal(violations.length, 1, `expected violation for ${ip}`);
    assert.equal(violations[0].check, "guard/network-ip");
  }
  assert.deepEqual(checkContent("scripts/probe.mjs", 'const ua = "Chrome/131.0.0.0 Safari/537.36";'), []);
});

test("planted internal mesh/VPN domains and unqualified host URLs fail guard/network-domain", () => {
  for (const target of [
    "http://server.ts.net",
    "http://database.internal",
    "http://gateway.local",
    "http://router.lan",
    "http://synthetic-router:8100/status/data",
    "ssh://synthetic-host",
    "http://localhost:4790/mcp",
  ]) {
    const violations = checkContent("SKILL.md", `Check ${target} first`);
    assert.equal(
      violations.length,
      1,
      `expected 1 violation for "${target}", got: ${JSON.stringify(violations)}`
    );
    assert.equal(violations[0].check, "guard/network-domain");
  }
  assert.deepEqual(checkContent("SKILL.md", "Visit https://waseemilyas.uk and http://localhost/"), []);
});

test("planted non-allowlisted email fails guard/email-allowlist", () => {
  const violations = checkContent(
    "contact.njk",
    "<p>Reach client staff at person@synthetic-enterprise.example</p>"
  );
  assert.equal(violations.length, 1);
  assert.equal(violations[0].check, "guard/email-allowlist");
  assert.match(violations[0].message, /non-allowlisted email found/);
  assert.ok(!violations[0].message.includes("person@synthetic-enterprise.example"));
});

test("allowlisted emails and public Sentry DSN URLs pass guard/email-allowlist", () => {
  const content =
    '<p>waseem@automancer.uk and contact@waseemilyas.uk</p><script>const dsn = "https://0123456789abcdef0123456789abcdef@o1.ingest.de.sentry.io/1";</script>';
  const violations = checkContent("contact.njk", content);
  assert.deepEqual(violations, []);
});

test("planted private key marker fails guard/credentials", () => {
  const keyHeader = "-----BEGIN " + "PRIVATE KEY-----";
  const violations = checkContent("config.txt", `${keyHeader}\nABCDEF==\n`);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].check, "guard/credentials");
  assert.match(violations[0].message, /private key block detected/);
});

test("planted secret tokens and URL passwords fail guard/credentials", () => {
  const fakePat = "ghp_" + "Zq8kL2mNpQ7rStUvWxYz0AbCdEfGhIjKlMnOp";
  const fakeFinePat = "github_pat_" + "11ABCDEFG0123456789abcdef_GHIJKLMN";
  const fakeSk = "sk-ant-" + "synthetic0123456789abcdefghij";
  const fakeUrlCred = "https://synthetic-user:" + "synthetic-pass@example.test/api";
  for (const secret of [fakePat, fakeFinePat, fakeSk, fakeUrlCred]) {
    const violations = checkContent("setup.sh", `export TARGET="${secret}"`);
    assert.equal(violations.length, 1, `expected credential violation for ${secret.slice(0, 8)}`);
    assert.equal(violations[0].check, "guard/credentials");
  }
});

test("planted credential assignment fails guard/credentials", () => {
  const snippet = "pass" + "word: \"synthetic-val\"";
  const violations = checkContent("sample.js", `const cfg = { ${snippet} };`);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].check, "guard/credentials");
  assert.match(violations[0].message, /credential assignment pattern/);
});

test("planted credential/client markers in comments fail guard/comment-secrets", () => {
  const fakeComment1 = "<!-- " + "internal-only draft notes" + " -->";
  const fakeComment2 = `{# client: Synthetic Client Name #}`;

  const v1 = checkContent("page.njk", fakeComment1);
  assert.equal(v1.length, 1);
  assert.equal(v1[0].check, "guard/comment-secrets");

  const v2 = checkContent("page.njk", fakeComment2);
  assert.equal(v2.length, 1);
  assert.equal(v2[0].check, "guard/comment-secrets");
});

test("planted commercial rate and margin terms fail guard/commercial-terms", () => {
  for (const phrase of [
    "standard day rate applies",
    "the daily rate was fixed",
    "hourly rate of work",
    "monthly retainer fee",
    "contract value under discussion",
    "operating profit margin",
  ]) {
    const violations = checkContent("work.md", `<p>${phrase}</p>`);
    assert.equal(
      violations.length,
      1,
      `expected violation for phrase "${phrase}", got: ${JSON.stringify(violations)}`
    );
    assert.equal(violations[0].check, "guard/commercial-terms");
    assert.match(violations[0].message, /commercial rate\/fee\/margin term/);
  }
});

test("planted commercial revenue disclosures fail guard/commercial-revenue", () => {
  for (const phrase of [
    "annual revenue reached high targets",
    "company revenue reported quarterly",
    "client revenue grew significantly",
  ]) {
    const violations = checkContent("about.md", `<p>${phrase}</p>`);
    assert.equal(
      violations.length,
      1,
      `expected violation for phrase "${phrase}", got: ${JSON.stringify(violations)}`
    );
    assert.equal(violations[0].check, "guard/commercial-revenue");
    assert.match(violations[0].message, /commercial revenue disclosure/);
  }
});

// ---------------------------------------------------------------------------
// grandfathered carve-out (AGENTS.md §1)

test("grandfathered timeline.json allows pre-existing business revenue", () => {
  const text = JSON.stringify({
    milestones: [{ body: "Grew it to approximately 25% of business revenue." }],
  });
  const violations = checkContent("src/_data/timeline.json", text);
  assert.deepEqual(violations, []);
});

test("non-exempted violations in grandfathered timeline.json STILL fail", () => {
  const text = JSON.stringify({
    milestones: [
      {
        body: "Grew it to approximately 25% of business revenue.",
        path: "/opt/automancer/secret-path",
      },
    ],
  });
  const violations = checkContent("src/_data/timeline.json", text);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].check, "guard/filesystem-paths");
});

test("new commercial revenue statements in grandfathered timeline.json STILL fail", () => {
  const text = JSON.stringify({
    milestones: [
      { body: "Grew it to approximately 25% of business revenue." },
      { body: "Annual revenue reached new highs." },
    ],
  });
  const violations = checkContent("src/_data/timeline.json", text);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].check, "guard/commercial-revenue");
});

test("missing directory, empty file and unclosed comment are handled cleanly", (t) => {
  const missing = runContentGuard({ dir: join(os.tmpdir(), "content-guard-missing-dir-does-not-exist") });
  assert.equal(missing.violations.length, 1);
  assert.equal(missing.violations[0].check, "guard/source");
  assert.equal(missing.stats.files, 0);

  const emptyDir = mkdtempSync(join(os.tmpdir(), "content-guard-empty-"));
  t.after(() => rmSync(emptyDir, { recursive: true, force: true }));
  assert.deepEqual(runContentGuard({ dir: emptyDir }), { violations: [], stats: { files: 0 } });
  assert.deepEqual(checkContent("empty.njk", ""), []);
  assert.deepEqual(checkContent("malformed.njk", "<!-- unclosed comment"), []);
});

// ---------------------------------------------------------------------------
// CLI behaviour

test("CLI exits 0 on valid directory", () => {
  const fx = makeFixture(test);
  const r = spawnSync(process.execPath, [SCRIPT, "--dir", fx.srcDir], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /content-guard: OK/);
  assert.match(r.stdout, /3 repository files scanned/);
});

test("CLI exits 1 and names violation on dirty directory", () => {
  const fx = makeFixture(test);
  writeFileSync(join(fx.srcDir, "bad.njk"), "<p>Price is £450</p>\n");
  const r = spawnSync(process.execPath, [SCRIPT, "--dir", fx.srcDir], {
    encoding: "utf8",
  });
  assert.equal(r.status, 1);
  const out = `${r.stderr}${r.stdout}`;
  assert.match(out, /content-guard: FAILED/);
  assert.match(out, /\[guard\/currency\]/);
  assert.ok(!out.includes("£450"));
});

test("pre-push refuses a private detail even if a later commit removes it", (t) => {
  const root = mkdtempSync(join(os.tmpdir(), "content-guard-push-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = join(root, "remote.git");
  const options = { cwd: root, encoding: "utf8" };
  const git = (...args) => execFileSync("git", args, { ...options, stdio: "pipe" }).trim();
  git("init", "--quiet", "--initial-branch=main");
  git("init", "--quiet", "--bare", remote);
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.test");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", "hooks");
  git("remote", "add", "origin", remote);
  for (const dir of ["bin", "hooks", "scripts"]) mkdirSync(join(root, dir));
  copyFileSync(HOOK, join(root, "hooks", "pre-push"));
  copyFileSync(SCRIPT, join(root, "scripts", "content-guard.mjs"));
  // The test exercises the privacy hook independently of the secret scanner.
  writeFileSync(join(root, "bin", "gitleaks"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const push = (branch) => spawnSync("git", ["push", "origin", `HEAD:refs/heads/${branch}`], {
    ...options,
    env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}` },
  });
  const commit = (message, body) => {
    writeFileSync(join(root, "case study.md"), body);
    git("add", "case study.md");
    git("commit", "--quiet", "-m", message);
  };

  commit("Publish the case study", "A public case study.\n");
  const clean = git("rev-parse", "HEAD");
  const initial = push("main");
  assert.equal(initial.status, 0, initial.stderr);
  const privateDetail = "person@synthetic-enterprise.example";
  commit("Edit the case study", `A public case study.\n${privateDetail}\n`);
  commit("Remove the detail", "An updated public case study.\n");

  for (const branch of ["main", "preview"]) {
    const rejected = push(branch);
    assert.equal(rejected.status, 1, "both updates and new branches must be checked");
    assert.match(rejected.stderr, /\[guard\/email-allowlist\] case study\.md:2:/);
    assert.ok(!rejected.stderr.includes(privateDetail), "diagnostics must omit the protected text");
  }
  assert.equal(git("ls-remote", "--heads", "origin"), `${clean}\trefs/heads/main`);
});
