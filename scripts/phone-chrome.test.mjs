// The phone layout of the site's chrome: work cards and footer navigation.
// Product context says most visitors arrive on a phone and decide within a
// minute, so two things must not silently regress:
//
// - A selected-work card must still read as a link on a phone. Below 620px the
//   card is one column; if its "Read →" affordance is hidden there, the entry
//   looks like plain text and a first-time visitor has no cue it opens.
// - Inline 44px tap targets must not stretch the lines they sit in. A link
//   inside a footer line or a paragraph keeps its 44px target while the text
//   baseline stays even, so the neighbouring lines do not jump apart.
//
// jsdom has no layout engine, so these read the built stylesheet's cascade —
// the same rules the browser walks in verify-portfolio — and fail if either
// property is lost. The browser walk owns the rendered proof.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { builtSite, skipReason } from "./built-site.mjs";

const builtCss = async () => readFileSync(join(await builtSite(), "assets/css/styles.css"), "utf8");

/** Rule bodies whose selector list contains `selector`, ignoring `exclude`. */
function ruleBodies(css, selector, exclude = []) {
  // Strip comments first: a comment between rules is part of the next
  // rule's selector text for a naive regex, which would swallow it.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const bodies = [];
  for (const match of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(",").map((s) => s.trim());
    if (selectors.includes(selector) && !selectors.some((s) => exclude.includes(s))) bodies.push(match[2]);
  }
  return bodies;
}

/** The text of the `@media (max-width: 620px)` blocks. */
function phoneQueries(css) {
  return [...css.matchAll(/@media \(max-width: 620px\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((m) => m[1]).join("\n");
}

test("phone: a work card keeps its Read affordance and compact padding", { skip: skipReason }, async () => {
  const css = await builtCss();
  const phone = phoneQueries(css);
  assert.ok(phone.length > 0, "the stylesheet has a 620px phone query");
  for (const body of ruleBodies(phone, ".workcard .go")) {
    assert.doesNotMatch(body, /display:\s*none/, "the Read arrow must not be hidden on a phone");
  }
  // Desktop hover motion nudges the arrow; a phone has no hover, so the arrow
  // itself must carry the signal colour in the phone query.
  const go = ruleBodies(phone, ".workcard .go").join(" ");
  assert.match(go, /var\(--signal\)/, "the phone Read arrow is painted in the signal colour");
  const card = ruleBodies(phone, ".workcard").join(" ");
  assert.match(card, /padding:\s*1rem/, "phone cards use the compact 1rem padding, not the desktop 1.4rem");
});

test("phone: footer navigation groups in two columns with full-width rows", { skip: skipReason }, async () => {
  const css = await builtCss();
  const phone = phoneQueries(css);
  const fnav = ruleBodies(phone, ".foot .fnav").join(" ");
  assert.match(fnav, /grid-template-columns:\s*repeat\(2,/, "footer nav reads in two columns on a phone");
  assert.doesNotMatch(fnav, /space-between/, "nothing is pushed to opposite edges");
  const link = ruleBodies(phone, ".foot .fnav a").join(" ");
  assert.match(link, /min-block-size:\s*2\.75rem/, "each footer link is a 44px row");
});

test("44px targets: inline links keep an even baseline", { skip: skipReason }, async () => {
  const css = await builtCss();
  // The shared 44px rule centres these links, which is right for nav and
  // footer rows but stretches the line for a link inside running text.
  // Match every rule naming the plain selector, including the shared 44px
  // rule, and pick out the dedicated baseline rule by what it declares.
  const centred = ruleBodies(css, ".contact-close a");
  const inline = centred.filter((body) => /vertical-align:\s*baseline/.test(body));
  assert.ok(inline.length > 0, "the contact-line link is pinned to the text baseline");
  assert.match(inline.join(" "), /margin-block:\s*-6px/, "…with the extra height offset so line gaps stay even");
  const footMeta = ruleBodies(css, ".foot .meta a", []).join(" ");
  assert.match(footMeta, /vertical-align:\s*baseline/, "footer contact-line links keep the same even baseline");
});
