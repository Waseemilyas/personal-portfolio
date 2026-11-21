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
import { transformSync } from "esbuild";
import { inlineScripts } from "./csp.mjs";

const TARGET = "es2020";

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
 * site.js as published: minified, ending in a link to its source map.
 * @param {string} source
 * @param {string} mapName the map's file name, beside site.js
 */
export function minifySiteScript(source, mapName) {
  const { code, map } = minifyScript(source, { sourcefile: "site.js", sourcemap: true });
  return { code: `${code}\n//# sourceMappingURL=${mapName}\n`, map };
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
