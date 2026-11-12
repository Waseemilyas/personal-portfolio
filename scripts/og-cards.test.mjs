// A normal build must publish a new or retitled article with its matching preview,
// and must never turn a draft into a public image. Exercise the real build path.
import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { JSDOM } from "jsdom";

test("a normal build creates and refreshes share cards without publishing drafts", { timeout: 90_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "portfolio-cards-"));
  const input = join(root, "src"), output = join(root, "_site");
  const note = join(input, "notes/posts/build-probe.md");
  const command = resolve("node_modules/@11ty/eleventy/cmd.cjs");
  const config = resolve("eleventy.config.js");
  let buildLog = "";
  const build = () => {
    const run = spawnSync(process.execPath, [command, `--config=${config}`], { cwd: root, env: { ...process.env, SITE_REVISION: "a".repeat(40) }, encoding: "utf8", timeout: 30_000 });
    buildLog = run.stdout + run.stderr;
    assert.equal(run.status, 0, buildLog);
  };
  const text = (title, draft = false) => `---\ntitle: '${title}'\ndate: 2026-08-08\nsummary: Build fixture.\ndraft: ${draft}\n---\nBuild fixture.\n`;
  const metadata = () => new JSDOM(readFileSync(join(output, "notes/build-probe/index.html"), "utf8")).window.document;
  try {
    // Use the normal src/ and _site/ paths in an isolated working directory.
    cpSync("package.json", join(root, "package.json"));
    cpSync("src", input, { recursive: true });
    cpSync("vendor", join(root, "vendor"), { recursive: true });
    writeFileSync(note, text("A new note"));
    writeFileSync(join(input, "notes/posts/draft-probe.md"), text("Never publish this draft", true));
    build();
    const image = join(output, "assets/img/og/notes-build-probe.png");
    assert.ok(existsSync(image), "a new note needs its own generated image after one build\n" + buildLog);
    const before = readFileSync(image);
    assert.equal(before.readUInt32BE(16), 1200);
    assert.equal(before.readUInt32BE(20), 630);
    assert.equal(metadata().querySelector('meta[property="og:image:alt"]').content, "Note · 8 AUG 2026. A new note.");
    assert.ok(!existsSync(join(output, "assets/img/og/notes-draft-probe.png")), "draft text must not become a public card");
    writeFileSync(note, text('A renamed note & "quoted" title'));
    build();
    const doc = metadata();
    assert.equal(doc.querySelector('meta[property="og:image:alt"]').content, 'Note · 8 AUG 2026. A renamed note & "quoted" title.');
    assert.equal(doc.querySelector('meta[name="twitter:image:alt"]').content, doc.querySelector('meta[property="og:image:alt"]').content);
    assert.ok(doc.querySelector('meta[property="og:image"]').content.endsWith("/assets/img/og/notes-build-probe.png"));
    assert.notDeepEqual(readFileSync(image), before, "retitling must refresh image pixels as well as metadata");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
