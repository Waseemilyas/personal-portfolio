# Portfolio behaviour

Observed specification of the current public site; this does not change its copy or design.
Last verified: 2026-10-16 on Linux; the security policy, share cards and contact links on 2026-11-12; the mobile menu on 2026-11-20.

Visitors read the main pages, open anonymised case studies, browse published notes,
follow the Atom feed, inspect capabilities and find contact links. The source of
page membership is `src/`, navigation is `src/_data/site.json`, and page rendering
is owned by the shared layouts in `src/_includes/`. The feature map beside
[verify-portfolio](.agents/skills/verify-portfolio/SKILL.md) owns the executable journeys.

On Home, Selected work follows the introduction. “Read the work” jumps to its
heading and gives it focus, so the next Tab reaches the first case study even
with scripts disabled. Case-study cards have an inset focus outline.

On Work, each case-study row also shows the role, craft and outcome from that case's
datasheet, so the work can be compared before any of it is opened. A click or tap
anywhere on the row opens the case; the link's accessible name is the title. On a page
shorter than the window, the footer sits on the window's bottom edge.

On case studies below 861px, the datasheet follows the article text and shows
its labels and values side by side. Wider screens show it in a sticky sidebar,
under the “On this page” list.
The layout works without JavaScript. In print, the datasheet follows the article text.

GitHub Pages serves `/404.html` at whatever address was asked for. Below its hero,
the page lists every published page (main pages, case studies, notes) from the same
collections as the sitemap, so a visitor with no script can still find the page their
link meant; `scripts/not-found.test.mjs` holds the list equal to the sitemap.
`setupNotFound` in `site.js` reads the address against that list. An address that
differs from a page only by letter case, trailing punctuation or quotes, a trailing
ellipsis, spaces, doubled slashes or an `.html`/`index.html` ending opens that page
at once (`location.replace`, keeping the fragment), showing "OPENING" meanwhile. Otherwise it offers one
"CLOSEST" card above the actions: the most similar address (a typo, a link cut short,
or a page under the wrong section), else the deepest page the address sits under,
else a section named by its own name or a common other word (blog → Notes, projects →
Work, cv → About, email → Contact). A guess is only offered, never opened, and an
address close to nothing offers nothing. Nothing is sent anywhere.

The site remains static HTML/CSS with progressive JavaScript enhancement. It has
no sign-in, database, submission backend or local persistent user state. Contact
links hand off to the visitor's mail application; verifying them does not send mail.
Every email link is built with the `mailto` filter in `eleventy.config.js`, so it
opens with a subject: "Hello from waseemilyas.uk", or "About your note: <title>" and
"About your case study: <title>" at the end of a note or case study. That makes mail
from the site countable in the inbox with no tracking on the site; `site-check`'s
"contact" rule fails an email link without a subject. Home, Contact and every
note and case study show the email address. Beside it, `setupCopyEmail` shows a
"Copy address" button where the
browser can copy (a mail link does nothing for a visitor with no mail app set up). It
copies the address, reads "Copied ✓" for 2.5 seconds and announces the result in a
status line. If the write is refused, the button gives way to an open manual
copy control with visible instructions and a read-only address field. When the
button had focus, the field gets focus and selects the address. Without
JavaScript or clipboard access, the visitor can open the manual copy control
directly. Both controls show "Copy address" and have the same width, so the row
and the content below it stay put when the script swaps them.
External links are destinations, not services this repository operates.

Supporting browsers prerender internal pages on link intent using native speculation
rules with `moderate` eagerness. The links to an article that a reader most often
opens next also qualify for an `eager` HTML prefetch: the case-study cards on Home
and Work, the notes on Notes, and the single Next note or Next case study link.
Current Chromium starts it when the link enters the viewport on phones or shortly
after hover on desktop, so the tap needs no network round trip. Older Chromium
can start it on arrival. On a phone this spends up to about 36 KB of HTML on a
listing page whose articles the reader does not open. `scripts/speculation-rules.test.mjs`
fails if a listing's article link stops matching the rule. Both rules are limited to same-origin links ending in
`/` and hashed by the Content Security Policy. Browsers without speculation
rules use normal links.

Every page carries the site stylesheet inline in its `<head>`, comments and spare
whitespace removed, so the first paint needs no second request and a returning
visitor never waits on a stylesheet revalidation. Each page inlines only the rules
it can use: a rule is left out only when every selector in it needs a class or id
that is not in the page and that no script adds. In production, 13 of the 14 pages
then fit in about 12 KB compressed, inside a new connection's first round trip.
`/assets/css/styles.css` is still published whole, so a page cached from before
inlining keeps its styles.

Home's six sections below the hero, and the 404 page's index, use
`content-visibility: auto`: the browser skips their style, layout and paint until
they near the viewport, so the first paint lays out the first screen only. A
skipped section stays in the accessibility tree and find in page, and keeps its
real height once drawn. The reveal script reads which blocks start on screen from
an IntersectionObserver instead of measuring them, so it does not force the skipped
sections into layout. A visit that opens on an address with a `#fragment` draws
every section from the start, so the browser lands on the target exactly.

The skip link gives focus to the main landmark, including with scripts disabled.
The document leaves scroll space above focused controls and anchor targets for
the sticky header. After native keyboard focus scrolling, the script checks
whether a control in the main content or footer still sits under the header and
scrolls it to the padded top edge so its outline is visible. A section's reveal
yields while it contains focus.

The mobile drawer is a native popover: `#primary-nav` carries `popover` and the
header toggle `popovertarget`, so a phone visitor can open the menu from first paint,
before `site.js` has arrived, and with JavaScript disabled. The browser closes it on
Escape (focus returns to the toggle) or a tap outside. Closed, the drawer is
`visibility: hidden`, so its links leave the tab order and accessibility tree. On a
short landscape phone the open drawer scrolls. `setupNavigation` in
`src/assets/js/site.js` mirrors `aria-expanded`, closes the drawer when a link is
chosen, focus moves outside the menu and its toggle, or the window widens past the
breakpoint, and in a browser without popovers
removes the attribute and drives the drawer itself (`setDrawer`: open, expanded,
hidden and inert state). Its media query and the stylesheet's mobile query must
agree. At desktop width the links are a row in the bar; a menu opened on a phone
that is then turned wide with no script stays pinned in the row's place until a tap
elsewhere closes it.

`src/index.njk` renders all capability descriptions from `src/_data/capabilities.json`
with related links resolved from published notes and case studies. Without
JavaScript all five descriptions and their links are available as a list.
`setupCapabilityMap` enhances the list with the interactive map and shows one
panel at a time. Pointer selection and keyboard focus activate a tab. Left/Right
and Home/End move between tabs, and Tab moves to the active panel and its link.
Narrow frames use full titles on buttons, with the same selection as the SVG map.
With a system contrast theme active, the current header link and selected
capability are underlined, and work rows keep visible dividers. The capability
map and workflow diagrams use the system palette for their labels, shapes and
arrows. The selected map node has a heavier ring.
Main headings are visible from first paint. Supporting blocks in the first
screen enter with CSS alone (`data-cal` slots). `setupReveals` only defers
below-the-fold blocks while they are off-screen. Reduced motion animates nothing.
Entry motion plays only on arrival from outside the site: a click between pages
(same-origin referrer, `.onsite`) shows the first screen at once. In browsers with
cross-document view transitions, the header holds still between pages, the page
cross-fades, and an article title grows out of the card or next-article link that
opened it (`setupPageTransitions`); Back from an article returns it to its card
when that card is on screen.

On a narrow frame the chrome keeps its signposts: a selected-work card's "Read →"
is a full-width row in the signal colour (a phone has no hover to announce the
card as a link), and the footer navigation is two columns of full-width 44px
rows. Inline 44px links — the home contact line and the footer contact lines —
keep the text baseline with their extra height offset, so their lines do not
gap further apart than their neighbours. `scripts/phone-chrome.test.mjs` holds
that cascade; the browser walk owns the rendered proof.

A note opens with its summary, then its date and reading time ("2 min read", from the
Markdown word count at 230 words a minute) on one mono line. The notes index and each
Next note link show the same date and reading time. On the index the whole row opens
the note: the title link stretches over it, so its accessible name stays the title.

Case studies and notes with two or more body headings show an “On this page” list
under the introduction. Case studies also link to their datasheet from that list.
Below 861px the list sits above the text. From 861px it is a column beside the
text: on notes it stays in view while the note is read, and on case studies it sits
above the sticky datasheet. With JavaScript, the link for the section being read
is marked (`aria-current="location"`) once its heading comes within a tenth of the
window under the header; a jump marks the section it opened, also at the foot of a
short page. The links jump to and focus the headings below the sticky header,
including with JavaScript disabled. The fragment URL can be opened directly. Print
keeps the headings and omits the list.

Each case study and note ends with the contact controls, a "Next case study" or
"Next note" link, and a link back to the index. The next link points to the next
case by `order` or the next older note, wrapping to the first. It works without
JavaScript and never links a draft.

Browser Print / Save as PDF gives notes and case studies a reading edition on the
visitor's chosen paper size. Navigation and next-article cards are omitted; the
complete narrative, original vector diagrams and case datasheet remain. Deferred
reveals are visible without scrolling, and entry animations stop. The datasheet
follows the narrative in compact key/value rows. The edition ends with the author,
email address and canonical page URL, rendered from site data. This source line is
hidden on screen and printing requires no JavaScript.

`src/notes/posts/posts.11tydata.js` suppresses a draft's page permalink and excludes
it from collections. The notes collection also filters drafts in
`eleventy.config.js`. Notes listing, feed and sitemap consume those collections.
Publishing decisions belong to note front matter. After a successful full build
or preview rebuild, Eleventy’s rendered page list determines which HTML files
remain in `_site/`. This removes obsolete HTML and empty route directories from
reused output when a page is drafted, deleted or moved.

Source privacy scanning cannot decide whether apparently anonymised copy identifies
a client. `AGENTS.md` owns that judgement and the grandfathered-content exception.
The rendered checker owns headings, metadata, links, feed/sitemap structure and
parity, draft absence and revision bytes. OG checks inspect image headers, not
pixel decoding. GitHub Pages serves the artifact built by the main workflow and
its post-deploy verifier compares the live revision body exactly.

Every page carries a Content Security Policy as the first element after
`<meta charset>`, written at build time by `scripts/csp.mjs` (GitHub Pages cannot
send headers). Inline scripts are allowed by hash, and external scripts are limited
to the site's JavaScript and optional Sentry SDK. Their subresource integrity values
match both the policy and the served bytes. The policy also lists their exact URLs
on the public site for older browsers with subresource integrity support. The site's script URL
includes its digest so a new page fetches the right version. The inlined stylesheet is
also hashed. The only outside origin is Sentry's ingest, in `connect-src`, when the
production build has a DSN.
It has no `'unsafe-inline'`, `'unsafe-eval'` or wildcard, and blocks forms, `<base>`
and plugins. It enforces Trusted Types: no script may pass a plain string to an HTML
or script sink (`innerHTML`, `insertAdjacentHTML`, `document.write`, a script's `src`
or text, `srcdoc`), and only the policies the page's own inline scripts create are
allowed (`trusted-types 'none'` when there are none). The production error loader
creates the one policy, `sdk-loader`, which accepts only the pinned SDK URL. Pages also send `strict-origin-when-cross-origin` as their referrer
policy. The meta form cannot set `frame-ancestors`, HSTS or `X-Content-Type-Options`;
those need response headers.

The domain allows only Let's Encrypt, the certificate authority GitHub Pages uses, to
issue certificates for `waseemilyas.uk` and its subdomains, and no authority to issue a
wildcard: the apex publishes CAA `0 issue "letsencrypt.org"` and `0 issuewild ";"`
in its Cloudflare zone. Cloudflare's Universal SSL stays off, because while it is on
Cloudflare adds its own five authorities, wildcards included, to any CAA set; no record
in the zone is proxied, so nothing used its certificate. `www` is a CNAME to GitHub,
whose own CAA records govern it. The zone is DNSSEC-signed. `scripts/domain-check.mjs`
(`.github/workflows/domain.yml`, after every release and daily) fails if the CAA set
changes, if the served certificate comes from an authority it does not allow or has
fewer than 21 days left (the sign of a blocked renewal), if DNSSEC stops validating at
Cloudflare's or Google's resolver, or if `http://` stops redirecting permanently to `https://`.

Browser errors go to Sentry, and a normal visit makes no request for it. The first
error or blocked resource on a page downloads the pinned Sentry SDK
(`vendor/sentry-<version>.min.js`, served as `/assets/js/`, checked by SHA-384 at
build and by the browser's integrity check). Error reports retain the release,
canonical page (including `/404.html` for missing pages), standard error category,
and line and column numbers in the page or `site.js`, which is minified and publishes
a source map (`/assets/js/site.js.map`) that resolves them to the source. Exception messages, custom
error names and stack labels are removed in the browser, including for linked
causes and promise rejections. Reports also omit the visitor's raw page URL,
referrer, browsing breadcrumbs and SDK-captured callback arguments. The SDK tells
Sentry not to infer the visitor's IP address. The SDK sends
no session reports. Each distinct policy warning includes
the directive and a public script path or resource category. Extension and Sentry
URLs are skipped. No Sentry dashboard setting can change the code visitors run.
The DSN is public in every page, so the Sentry project accepts reports only from
`https://waseemilyas.uk` (Allowed Domains); a browser on any other website, a copy of
the site or a local preview gets 403. The Sentry organisation's error quota is shared
with other projects, and this stops another site spending it. `scripts/domain-check.mjs`
fails, after every release and daily, if the live ingest stops refusing another
origin or starts refusing the site's own.

A shared link shows a 1200×630 preview card. Each note and case study has its own,
carrying its label, title and (for a case study) kicker in the site's fonts; every
other page shares the default card. `scripts/og-cards.mjs` draws them with headless
Chromium during the normal Eleventy build, using the rendered pages' own text. A transform sets matching image
metadata before the security policy is hashed, and the build waits for the PNGs in
`_site/assets/img/og/`. No generated source image or text map needs committing.
Watch builds reuse unchanged cards; changed text redraws the image. Drafts never
enter that path, and a full rebuild removes cards for deleted or drafted articles.
Every page names its card's text in `og:image:alt`. Notes are
`og:type` article with `article:published_time` and a `BlogPosting` JSON-LD block.
The rendered checker fails a note or case study whose card is missing or whose alt
text no longer matches the page, so a retitled note cannot ship a stale preview.

The unlinked prayer-time audio files remain intentional HTTP assets. Browser
verification checks that they are served, without playback or touching the external
consumer. Build and release inputs are in `package.json`, the lockfile and the
workflows; their versions and retry limits are read there.
