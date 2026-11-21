// Minify the JavaScript visitors download: site.js, and the inline scripts every page
// carries in its <head> (the class-setting snippet and, in production, the
// error-reporting loader). The sources keep their comments and readable names; the
// built site ships esbuild's minified output.
//
// The output never uses syntax newer than the sources already do (site.js uses
// optional chaining and ??, which is ES2020), so minifying cannot narrow the browsers
// the site runs in. site.js is published with a source map, so error reports that
// carry its line and column numbers still resolve to the readable source.
//
// Content Security Policy hashes and the site.js integrity are computed from the
// minified bytes, after this step (eleventy.config.js orders the transforms).
import { createHash } from "node:crypto";
import { transformSync } from "esbuild";
import { inlineScripts } from "./csp.mjs";

const TARGET = "es2020";
export const siteScriptFile = /^assets\/js\/site-[a-f0-9]{20}\.js$/;

/**
 * @param {string} source a classic (non-module) script
 * @param {{ sourcefile?: string, sourcemap?: boolean }} [options]
 * @returns {{ code: string, map: string }}
 */
export function minifyScript(source, { sourcefile, sourcemap = false } = {}) {
  const { code, map } = transformSync(source, {
    loader: "js",
    minify: true,
    target: TARGET,
    legalComments: "none",
    ...(sourcefile ? { sourcefile } : {}),
    ...(sourcemap ? { sourcemap: "external", sourcesContent: true } : {}),
  });
  return { code: code.trimEnd(), map };
}

/**
 * Name the minified script and map together so a page always loads the pair it was built with.
 * @param {string} source
 */
export function minifySiteScript(source) {
  const { code, map } = minifyScript(source, { sourcefile: "site.js", sourcemap: true });
  const hash = createHash("sha256").update(code).update("\0").update(map).digest("hex").slice(0, 20);
  const name = `site-${hash}.js`;
  return { file: `assets/js/${name}`, code: `${code}\n//# sourceMappingURL=${name}.map\n`, map };
}

/**
 * Replace the body of every inline script the browser executes with its minified form.
 * JSON-LD and speculation rules are data, not script, and are left as they are.
 * @param {string} html a rendered page
 */
export function minifyInlineScripts(html) {
  const executable = new Set(inlineScripts(html));
  return html.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi, (whole, open, body, close) => {
    if (!body.trim() || !executable.has(body) || /\btype\s*=\s*["']?speculationrules/i.test(open)) return whole;
    const { code } = minifyScript(body);
    if (code.includes("</script")) throw new Error("minify-js: minified inline script contains </script");
    return `${open}${code}${close}`;
  });
}
