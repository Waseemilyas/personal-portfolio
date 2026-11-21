// The built site ships minified scripts (scripts/minify-js.mjs). A minifier that
// renamed the error loader's Trusted Types policy, or touched a data block, would
// silently stop error reports or link prefetching on the live site; fail here instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { builtScriptUrl, builtSite, skipReason } from "./built-site.mjs";
import { inlineScripts, trustedTypePolicies } from "./csp.mjs";

test("pages ship minified scripts with their policy name and data blocks intact", { skip: skipReason }, async () => {
  const site = await builtSite();
  const html = readFileSync(join(site, "index.html"), "utf8");
  const scripts = inlineScripts(html).filter((body) => !body.trimStart().startsWith("{"));
  assert.ok(scripts.length >= 2, "expected the class snippet and the error loader");
  for (const body of scripts) assert.doesNotMatch(body, /\n|\/\/ |\/\*/, "inline script is not minified");
  assert.deepEqual(trustedTypePolicies(html), ["sdk-loader"]);

  const data = [...html.matchAll(/<script type="(application\/ld\+json|speculationrules)">([\s\S]*?)<\/script>/g)];
  assert.ok(data.length >= 2);
  for (const [, , body] of data) assert.doesNotThrow(() => JSON.parse(body ?? ""));

  const script = builtScriptUrl(html);
  const published = readFileSync(join(site, script), "utf8");
  assert.ok(published.endsWith(`\n//# sourceMappingURL=${basename(script)}.map\n`));
  const map = JSON.parse(readFileSync(join(site, `${script}.map`), "utf8"));
  assert.deepEqual(map.sourcesContent, [readFileSync("src/assets/js/site.js", "utf8")]);
});
