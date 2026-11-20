// The minifier is a few regular expressions, safe only while the stylesheet has no
// string or url() whose text a comment or whitespace rule would change. A change that
// breaks this would quietly restyle the live site, so fail here instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STYLESHEET, inlineStylesheet, LINK, minifyCss } from "./inline-css.mjs";

const source = readFileSync(STYLESHEET, "utf8");

test("every string and url() in the stylesheet survives minifying unchanged", () => {
  const min = minifyCss(source);
  const literals = source.replace(/\/\*[\s\S]*?\*\//g, "").match(/"[^"]*"|'[^']*'|url\([^)]*\)/g) ?? [];
  assert.ok(literals.length > 0);
  for (const literal of literals) assert.ok(min.includes(literal), `${literal} changed`);
  // scripts/prune-css.mjs finds rules by counting braces.
  for (const literal of literals) assert.doesNotMatch(literal, /[{}]/, `${literal} has a brace`);
});

test("a selector's descendant pseudo-class keeps its space", () => {
  assert.equal(minifyCss(".a :focus { color: red; }\n/* note */ .b{ x: 1 }"), ".a :focus{color: red}.b{x: 1}");
});

test("the page's stylesheet link is replaced by the stylesheet", () => {
  assert.equal(inlineStylesheet(`<head>${LINK}</head>`, "a{b:c}"), "<head><style>a{b:c}</style></head>");
  assert.throws(() => inlineStylesheet(LINK, "</style><script>"));
});
