// Inline only the rules a page can use.
//
// Every page carries the stylesheet inline (scripts/inline-css.mjs), so the first
// paint waits for no second request. The whole stylesheet is about 42 KB, most of it
// for other pages: the capability map lives on Home, the case-study header on case
// studies, the 404 index on the 404 page. On most pages that pushed the compressed
// HTML past the 14.6 KB a new connection may send in its first round trip, so a
// phone on a slow network waited one more round trip before it could paint.
//
// A style rule is left out of a page only when every selector in its list needs a
// class or id that the page never uses. A class or id counts as used when it appears
// in the page's HTML or as a word in any script the page runs (site.js adds `in`,
// `on`, `cal-wait`, `js` and `onsite` at runtime), so state a script sets later is
// always kept. Classes inside :not(), :is(), :where() and :has() never count as
// required, element and attribute selectors are always kept, and @font-face,
// @keyframes, @view-transition and every other at-rule except @media, @supports and
// @container (whose rules are pruned the same way) are kept whole. Rule order is
// unchanged, so the cascade is the same as the full stylesheet's for every element
// the page can contain.
//
// /assets/css/styles.css is still published whole.

/**
 * @typedef {{ prelude: string, body: string, children?: Node[] }} Node
 */

/** At-rules whose body is a list of rules that can be pruned like the top level. */
const GROUPING = /^@(media|supports|container|layer)\b/;

/**
 * Split minified CSS (scripts/inline-css.mjs minifyCss) into top-level blocks.
 * The stylesheet has no braces inside strings or url() (inline-css.test.mjs keeps
 * its strings simple), so counting braces is enough.
 * @param {string} css
 * @returns {Node[]}
 */
export function parseBlocks(css) {
  /** @type {Node[]} */
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    const semi = css.indexOf(";", i);
    if (open === -1) {
      const rest = css.slice(i).trim();
      if (rest) out.push({ prelude: rest, body: "" });
      break;
    }
    // A statement at-rule such as @import or @charset ends at ";" before any "{".
    if (semi !== -1 && semi < open && css.slice(i, semi).trim().startsWith("@")) {
      out.push({ prelude: css.slice(i, semi + 1), body: "" });
      i = semi + 1;
      continue;
    }
    let depth = 1;
    let j = open + 1;
    for (; j < css.length && depth > 0; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
    }
    if (depth !== 0) throw new Error("prune-css: unbalanced braces in the stylesheet");
    const prelude = css.slice(i, open).trim();
    const body = css.slice(open + 1, j - 1);
    /** @type {Node} */
    const node = { prelude, body };
    if (GROUPING.test(prelude)) node.children = parseBlocks(body);
    out.push(node);
    i = j;
  }
  return out;
}

/**
 * Split a selector list on top-level commas only, so `:is(a, b)` stays whole.
 * @param {string} list
 */
export function splitSelectors(list) {
  /** @type {string[]} */
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(list.slice(start));
  return parts.map((s) => s.trim()).filter(Boolean);
}

/**
 * The classes and ids a selector needs, outside any parentheses or attribute brackets.
 * @param {string} selector
 * @returns {string[]} names, each prefixed "." or "#"
 */
export function requiredNames(selector) {
  let flat = "";
  let depth = 0;
  for (const c of selector) {
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0) flat += c;
  }
  return flat.match(/[.#](?:\\.|[\w-])+/g) ?? [];
}

/**
 * Whether a style rule could match an element on a page with these names.
 * @param {string} prelude the rule's selector list
 * @param {Set<string>} names names used by the page, each prefixed "." or "#"
 */
export function selectorListCanMatch(prelude, names) {
  return splitSelectors(prelude).some((selector) =>
    requiredNames(selector).every((name) => names.has(name.replace(/\\/g, ""))),
  );
}

/**
 * @param {Node[]} nodes
 * @param {Set<string>} names
 * @returns {string}
 */
function emit(nodes, names) {
  let out = "";
  for (const node of nodes) {
    if (node.children) {
      const inner = emit(node.children, names);
      if (inner) out += `${node.prelude}{${inner}}`;
    } else if (node.prelude.startsWith("@")) {
      out += node.body === "" && node.prelude.endsWith(";") ? node.prelude : `${node.prelude}{${node.body}}`;
    } else if (selectorListCanMatch(node.prelude, names)) {
      out += `${node.prelude}{${node.body}}`;
    }
  }
  return out;
}

/**
 * The class names a script can add at runtime: the string literals passed to
 * classList.add, replace or toggle, and those appended with `className +=`. Any other
 * way of writing a class (assigning className, setAttribute("class"), classList with
 * a computed name) throws, so a new script cannot add a class the pruned stylesheet
 * silently lost.
 * @param {string} source script source
 * @returns {string[]}
 */
export function scriptClasses(source) {
  /** @type {string[]} */
  const found = [];
  let rest = source.replace(
    /\.classList\.(add|replace|toggle|remove)\(\s*((?:(["'`])[^"'`]*\3\s*(?:,\s*)?)*)/g,
    (call, method, args) => {
      const strings = Array.from(String(args).matchAll(/(["'`])([^"'`]*)\1/g), (m) => m[2]);
      if (strings.length === 0) throw new Error(`prune-css: a script sets a class this build cannot read: ${call}`);
      for (const s of method === "toggle" ? strings.slice(0, 1) : strings) found.push(...s.split(/\s+/).filter(Boolean));
      return "";
    },
  );
  rest = rest.replace(/\.className\s*\+=\s*(["'])([^"']*)\1/g, (_, _q, value) => {
    found.push(...String(value).split(/\s+/).filter(Boolean));
    return "";
  });
  const unread = rest.match(/.{0,40}(?:\bclassList\b|\bclassName\b|setAttribute\(\s*["'`]class["'`]|\bclass(?:Name)?\s*:).{0,40}/);
  if (unread) throw new Error(`prune-css: a script sets a class this build cannot read: ${unread[0]}`);
  return found;
}

/**
 * The classes and ids a page can use: every class and id attribute in its HTML, and
 * every class its scripts (inline and the site script) can add.
 * @param {string} html the rendered page
 * @param {string} scripts the source of the external scripts the page loads
 * @returns {Set<string>}
 */
export function usedNames(html, scripts) {
  const names = new Set();
  for (const m of html.matchAll(/\sclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    for (const c of (m[1] ?? m[2] ?? m[3] ?? "").split(/\s+/)) if (c) names.add(`.${c}`);
  }
  for (const m of html.matchAll(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const id = m[1] ?? m[2] ?? m[3] ?? "";
    if (id) names.add(`#${id}`);
  }
  const inline = Array.from(html.matchAll(/<script\b(?![^>]*type="(?:application\/ld\+json|speculationrules)")[^>]*>([\s\S]*?)<\/script>/gi), (m) => m[1]).join("\n");
  for (const c of scriptClasses(`${inline}\n${scripts}`)) names.add(`.${c}`);
  return names;
}

/**
 * The stylesheet with every rule this page cannot use left out.
 * @param {string} css minified stylesheet
 * @param {string} html the rendered page
 * @param {string} scripts the source of the external scripts the page loads
 */
export function pruneCss(css, html, scripts) {
  return pruneWithNames(css, usedNames(html, scripts));
}

/**
 * The stylesheet with every rule that needs a name outside `names` left out.
 * @param {string} css minified stylesheet
 * @param {Set<string>} names classes and ids, each prefixed "." or "#"
 */
export const pruneWithNames = (css, names) => emit(parseBlocks(css), names);
