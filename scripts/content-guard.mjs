#!/usr/bin/env node
// Content guardrail scanner enforcing AGENTS.md §1 across the public repository
// and rendered site output.
//
// Dependency-free (Node built-ins only).
// Every tracked file in this public repository publishes to GitHub, and `_site/`
// publishes to https://waseemilyas.uk. Automated enforcement covers:
//   - No commercially sensitive detail: currency amounts, rates, fees, contract
//     values, profit margins, headcount, or commercial revenue statements.
//   - No security exposure: internal filesystem paths (/opt, /home, /Users,
//     /Volumes, /private, /root, /srv, /etc, /var, C:\, ~/.agents, ~/.local,
//     ~/.ssh, etc.), IPv4/IPv6 addresses, private/mesh domains (*.ts.net,
//     .internal, .local, .lan, etc.), or unqualified internal host URLs.
//   - No non-allowlisted emails (only @automancer.uk and @waseemilyas.uk).
//   - No credentials or secrets: private key blocks, secret tokens, URL userinfo
//     passwords, or credential assignments in code or comments.
//
// Grandfathered content:
// Pre-existing content predating June 2026 rules (recorded in AGENTS.md §1 as
// a closed carve-out) carries an exact-phrase exemption for the single approved
// sentence in `src/_data/timeline.json` (and the two built pages that render it).
//
// Usage: node scripts/content-guard.mjs [--dir . | --commits < commit-ids]
// Exits 0 on clean scan; exits 1 listing every violation with file and line.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".mp3",
]);

const SKIPPED_DIRS = new Set([".git", "node_modules", "_site", ".audit", "__pycache__"]);

export const ALLOWED_EMAIL_DOMAINS = ["automancer.uk", "waseemilyas.uk"];

/** Exact June 2026 grandfathered sentence in `src/_data/timeline.json` (AGENTS.md §1). */
const GRANDFATHERED_TIMELINE_SENTENCE = "Grew it to approximately 25% of business revenue.";

/**
 * Closed carve-outs per AGENTS.md §1:
 * - `timeline.json` (and built `index.html` / `about/index.html` where it renders)
 *   may carry only `GRANDFATHERED_TIMELINE_SENTENCE`, never new revenue figures.
 * - `AGENTS.md` and `docs/PRODUCT.md` name the forbidden commercial terms in their
 *   own guardrail rule statements.
 * @type {Partial<Record<string, Set<string>>>}
 */
export const GRANDFATHERED_EXEMPTIONS = {
  "_data/timeline.json": new Set(["guard/commercial-revenue"]),
  "src/_data/timeline.json": new Set(["guard/commercial-revenue"]),
  "index.html": new Set(["guard/commercial-revenue"]),
  "_site/index.html": new Set(["guard/commercial-revenue"]),
  "about/index.html": new Set(["guard/commercial-revenue"]),
  "_site/about/index.html": new Set(["guard/commercial-revenue"]),
  "AGENTS.md": new Set(["guard/commercial-terms"]),
  "docs/PRODUCT.md": new Set(["guard/commercial-terms"]),
};

const CODE_FILE_RE = /\.(?:[cm]?js|ts|py|sh)$|^\.githooks\//;

/** @param {string} relPath */
function normalizeRelPath(relPath) {
  return normalize(relPath).replaceAll("\\", "/").replace(/^\.\//, "");
}

/** @param {string} relPath */
function getExemptions(relPath) {
  const norm = normalizeRelPath(relPath);
  const candidates = [norm];
  if (norm.startsWith("src/")) candidates.push(norm.slice(4));
  else candidates.push(`src/${norm}`);
  if (norm.startsWith("_site/")) candidates.push(norm.slice(6));
  const set = new Set();
  for (const key of candidates) {
    const found = GRANDFATHERED_EXEMPTIONS[key];
    if (found) {
      for (const item of found) set.add(item);
    }
  }
  return set;
}

/**
 * True when `index` falls inside an exact copy of `phrase` in `content`.
 * @param {string} content
 * @param {number} index
 * @param {string} phrase
 */
function isWithinExactPhrase(content, index, phrase) {
  let from = 0;
  while (from <= index) {
    const at = content.indexOf(phrase, from);
    if (at === -1) return false;
    if (index >= at && index < at + phrase.length) return true;
    from = at + 1;
  }
  return false;
}

/** @param {string} content @param {number} index */
function lineNumberAtIndex(content, index) {
  return content.slice(0, index).split("\n").length;
}

/**
 * Files in the repository root that are hash-pinned third-party artefacts or the
 * scanner's own rule definitions and planted-violation test suites.
 * @param {string} relPath
 */
export function isExcludedRepoFile(relPath) {
  const norm = normalizeRelPath(relPath);
  return (
    norm === "pnpm-lock.yaml" ||
    norm.startsWith("vendor/") ||
    norm === "scripts/content-guard.mjs" ||
    /^scripts\/[\w-]+\.test\.mjs$/.test(norm)
  );
}

/**
 * Scan a single file's content against content guardrails.
 * Returns an array of violations: { check, file, line, message }.
 * @param {string} relPath
 * @param {string} content
 * @returns {{check: string, file: string, line: number, message: string}[]}
 */
export function checkContent(relPath, content) {
  /** @type {ReturnType<typeof checkContent>} */
  const violations = [];
  const norm = normalizeRelPath(relPath);
  const exemptions = getExemptions(norm);
  const isCodeFile = CODE_FILE_RE.test(norm) && !norm.startsWith("src/") && !norm.startsWith("_site/");

  /** @param {string} ruleId @param {string} message @param {number} index */
  const report = (ruleId, message, index) => {
    if (exemptions.has(ruleId)) {
      if (ruleId === "guard/commercial-revenue") {
        if (isWithinExactPhrase(content, index, GRANDFATHERED_TIMELINE_SENTENCE)) return;
      } else {
        return;
      }
    }
    const line = lineNumberAtIndex(content, index);
    violations.push({
      check: ruleId,
      file: relPath,
      line,
      message: `${message} (line ${line})`,
    });
  };

  // 1. Internal filesystem paths (Unix host roots, sensitive home dot-paths, Windows drives)
  const pathRe =
    /(?:^|[\s"'`<(])(\/(?:opt|home|Users|Volumes|private|root|srv|etc|var)\/[a-zA-Z0-9_.-]+|~\/(?:\.(?:agents|local|ssh|aws|gnupg|openclaw|config|kube|docker|npmrc|netrc)\b[a-zA-Z0-9_./-]*|\.[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_./-]+)|[A-Za-z]:\\[a-zA-Z0-9_.\\]+)/g;
  for (const m of content.matchAll(pathRe)) {
    const hit = m[1] ?? m[0];
    report("guard/filesystem-paths", "internal filesystem path found", m.index + m[0].indexOf(hit));
  }

  // 2. IP addresses (IPv4 and IPv6)
  const ipv4Re =
    /(?<![A-Za-z]\/|\d\.)\b(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\b(?!\.\d)/g;
  for (const m of content.matchAll(ipv4Re)) {
    const after = content.slice(m.index + m[0].length, m.index + m[0].length + 6);
    if (m[0] === "127.0.0.1" && isCodeFile && !/^:[1-9]/.test(after)) continue;
    report("guard/network-ip", "IP address found", m.index);
  }
  const ipv6Re = /\b(?:f[cd][0-9a-f]{2}|fe80|2[0-9a-f]{3}):(?:[0-9a-f]{0,4}:){1,6}[0-9a-f]{1,4}\b/gi;
  for (const m of content.matchAll(ipv6Re)) {
    report("guard/network-ip", "IPv6 address found", m.index);
  }

  // 3. Internal network domains and unqualified internal host URLs
  const domainRe =
    /\b[a-zA-Z0-9.-]+\.(?:ts\.net|tailscale\.net|internal|local|lan|home\.arpa|corp|localdomain)\b/gi;
  for (const m of content.matchAll(domainRe)) {
    report("guard/network-domain", "internal network domain found", m.index);
  }
  const internalUrlRe =
    /\b(?:https?|wss?|ssh):\/\/(?:[^\s/:@"'`<>]+@)?([a-zA-Z][a-zA-Z0-9-]*)(:\d+)?(?=[/?#"'`\s<>)]|$)/gi;
  for (const m of content.matchAll(internalUrlRe)) {
    const host = (m[1] ?? "").toLowerCase();
    const port = m[2] ?? "";
    if (host === "localhost" && !port) continue;
    report("guard/network-domain", "internal network host or endpoint found", m.index);
  }

  // 4. Currency amounts / pricing
  const currencyRe =
    /(?:£|\$|€)\s*\d+(?:,\d{3})*(?:\.\d{1,2}|,\d{2})?(?:\s*[kKmMbB]\b|\b)|\b\d+(?:,\d{3})*(?:\.\d{1,2}|,\d{2})?\s*(?:GBP|USD|EUR)\b/gi;
  for (const m of content.matchAll(currencyRe)) {
    if (isCodeFile && /^\$[0-9]$/.test(m[0])) continue;
    report("guard/currency", "currency amount found", m.index);
  }

  // 5. Commercial rate/fee/margin/headcount terms
  const commTermsRe =
    /\b(?:day[- ]rates?|hourly[- ]rates?|daily[- ]rates?|retainer[- ]fees?|contract[- ]values?|profit[- ]margins?|headcounts?)\b/gi;
  for (const m of content.matchAll(commTermsRe)) {
    report("guard/commercial-terms", "commercial rate/fee/margin term found", m.index);
  }

  // 6. Commercial revenue statement
  const revRe =
    /\b(?:annual|business|client|company|quarterly|recurring|total)\s+revenue\b|\brevenue\s*(?:of|was|is|reached|target|growth)\b/gi;
  for (const m of content.matchAll(revRe)) {
    report("guard/commercial-revenue", "commercial revenue disclosure found", m.index);
  }

  // 7. Non-allowlisted email addresses (ignoring https://dsn@host URL userinfo)
  const emailRe = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  for (const m of content.matchAll(emailRe)) {
    const before = content.slice(Math.max(0, m.index - 64), m.index);
    if (/https?:\/\/[^\s"'`<>@]*$/i.test(before)) continue;
    const email = m[0];
    const lower = email.toLowerCase();
    const isAllowed = ALLOWED_EMAIL_DOMAINS.some(
      (d) => lower.endsWith(`@${d}`) || lower.endsWith(`.${d}`),
    );
    if (!isAllowed) {
      report("guard/email-allowlist", "non-allowlisted email found", m.index);
    }
  }

  // 8. Credentials and secrets
  const privKeyRe = /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/g;
  for (const m of content.matchAll(privKeyRe)) {
    report("guard/credentials", "private key block detected", m.index);
  }
  const tokenRe =
    /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[0-9a-zA-Z]{20,}|github_pat_[0-9a-zA-Z_]{20,}|glpat-[0-9a-zA-Z_-]{20,}|sk-(?:ant-|proj-|live-|test-)?[0-9a-zA-Z_-]{20,}|sntry[su]_[0-9a-zA-Z+/=_.-]{20,}|xox[baprs]-[0-9a-zA-Z-]{20,})\b/g;
  for (const m of content.matchAll(tokenRe)) {
    report("guard/credentials", "secret token marker detected", m.index);
  }
  const urlCredRe = /\bhttps?:\/\/[^\s/:@"'`<>]+:[^\s/@"'`<>]+@[a-zA-Z0-9.-]+/gi;
  for (const m of content.matchAll(urlCredRe)) {
    report("guard/credentials", "URL userinfo credential detected", m.index);
  }
  const credAssignRe =
    /(?:password|passwd|api[-_]?key|secret[-_]?key|client[-_]?secret|access[-_]?token|auth[-_]?token|bearer\s+[a-zA-Z0-9_.-]+)\s*[:=]/gi;
  for (const m of content.matchAll(credAssignRe)) {
    report("guard/credentials", "credential assignment pattern detected", m.index);
  }

  // 9. Comments containing credential or client markers
  const commentRe = /<!--([\s\S]*?)-->|{#([\s\S]*?)#}/g;
  for (const m of content.matchAll(commentRe)) {
    const body = m[1] ?? m[2] ?? "";
    const hit = body.match(
      /\b(?:password|passwd|api[-_]?key|secret[-_]?key|client[-_]?secret|auth[-_]?token|access[-_]?token|internal[-_]?only)\b|\bclient\s*[:=]/i,
    );
    if (hit) {
      report("guard/comment-secrets", "credential or client marker found in comment", m.index);
    }
  }

  return violations;
}

/**
 * List candidate relative file paths under `dir`. At a git repository root, uses
 * git's tracked + unignored file list so `.gitignore` boundaries are respected;
 * elsewhere walks `dir` directly while skipping build/dependency directories.
 * @param {string} dir
 * @returns {{ files: string[], isRepoRoot: boolean }}
 */
function listFiles(dir) {
  const absDir = resolve(dir);
  try {
    const top = execFileSync("git", ["-C", absDir, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (resolve(top) === absDir) {
      const out = execFileSync(
        "git",
        ["-C", absDir, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      const files = [
        ...new Set(
          out
            .split("\0")
            .filter(Boolean)
            .filter((f) => {
              if (BINARY_EXTENSIONS.has(extname(f).toLowerCase()) || isExcludedRepoFile(f)) return false;
              const st = statSync(join(absDir, f), { throwIfNoEntry: false });
              return Boolean(st?.isFile());
            }),
        ),
      ].sort();
      return { files, isRepoRoot: true };
    }
  } catch {
    // Not a git checkout (for example a temporary test fixture or exported archive).
  }

  /** @type {string[]} */
  const files = [];
  /** @param {string} current */
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(join(current, entry.name));
        continue;
      }
      if (!entry.isFile() || BINARY_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      const rel = relative(absDir, join(current, entry.name)).replaceAll("\\", "/");
      files.push(rel);
    }
  };
  walk(absDir);
  files.sort();
  return { files, isRepoRoot: false };
}

/**
 * Scan an entire directory tree (default: the repository root `.`) for content
 * guardrail violations. Pure reads only. Returns { violations, stats }.
 * @param {{ dir?: string }} [options]
 */
export function runContentGuard({ dir = "." } = {}) {
  const violations = [];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return {
      violations: [
        {
          check: "guard/source",
          file: dir,
          line: 1,
          message: `source directory "${dir}" does not exist or is not a directory`,
        },
      ],
      stats: { files: 0 },
    };
  }

  const { files, isRepoRoot } = listFiles(dir);
  for (const file of files) {
    if (!isRepoRoot && dir === "." && isExcludedRepoFile(file)) continue;
    const abs = join(dir, file);
    const content = readFileSync(abs, "utf8");
    const displayPath = dir === "." ? file : dir === "src" ? join(dir, file) : file;
    violations.push(...checkContent(displayPath, content));
  }

  return {
    violations,
    stats: { files: files.length },
  };
}

/** @param {string[]} commits IDs from the pre-push hook's outgoing revision list */
function scanCommits(commits) {
  /** @param {string[]} args */
  const git = (args) => execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
  const violations = [];
  let files = 0;
  for (const commit of commits) {
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) throw new Error("Expected a Git commit ID");
    // Compare merges with each parent so changes made during a merge are checked too.
    const paths = git(["diff-tree", "--root", "-m", "-r", "--no-commit-id", "--name-only",
      "--no-renames", "--diff-filter=AMT", "-z", commit]).split("\0");
    for (const file of new Set(paths)) {
      if (!file || BINARY_EXTENSIONS.has(extname(file).toLowerCase()) || isExcludedRepoFile(file)) continue;
      const content = git(["cat-file", "blob", `${commit}:${file}`]);
      violations.push(...checkContent(file, content).map((violation) => ({
        ...violation,
        message: `${violation.message} in commit ${commit.slice(0, 12)}`,
      })));
      files++;
    }
  }
  return { violations, stats: { files } };
}

// ---------------------------------------------------------------------------
// CLI

function main() {
  const args = process.argv.slice(2);
  /** @param {string} name */
  const flag = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const outgoing = args.includes("--commits");
  let result;
  try {
    result = outgoing
      ? scanCommits(readFileSync(0, "utf8").split(/\s+/).filter(Boolean))
      : runContentGuard({ dir: flag("--dir") ?? "." });
  } catch (error) {
    if (!outgoing) throw error;
    console.error("content-guard: could not read outgoing commits or their files");
    process.exit(1);
  }
  const { violations, stats } = result;

  if (violations.length > 0) {
    console.error(
      `content-guard: FAILED — ${violations.length} standing guardrail violation(s) (AGENTS.md §1)\n`,
    );
    for (const v of violations) {
      console.error(`  [${v.check}] ${v.file}:${v.line}: ${v.message}`);
    }
    process.exit(1);
  }

  console.log(
    `content-guard: OK — ${stats.files} ${outgoing ? "outgoing file versions" : "repository files"} scanned; standing content guardrails pass (AGENTS.md §1)`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main();
}
