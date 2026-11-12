# Portfolio behaviour

Observed specification of the current public site; this does not change its copy or design.
Last verified: 2026-10-16 on Linux; the security policy on 2026-11-12.

Visitors read the main pages, open anonymised case studies, browse published notes,
follow the Atom feed, inspect capabilities and find contact links. The source of
page membership is `src/`, navigation is `src/_data/site.json`, and page rendering
is owned by the shared layouts in `src/_includes/`. The feature map beside
[verify-portfolio](.agents/skills/verify-portfolio/SKILL.md) owns the executable journeys.

The site remains static HTML/CSS with progressive JavaScript enhancement. It has
no sign-in, database, submission backend or local persistent user state. Contact
links hand off to the visitor's mail application; verifying them does not send mail.
External links are destinations, not services this repository operates.

`setupNavigation` in `src/assets/js/site.js` owns the mobile drawer. Its
`setDrawer` function writes open/expanded/hidden/inert state. Escape returns focus
to the toggle. A link click closes it. Its media query and the stylesheet's mobile
query must agree. At desktop width the closed drawer's links become available
again. With JavaScript disabled, the footer navigation is the existing fallback;
the mobile toggle does not work. The design document already records that exception.

`setupCapabilityMap` owns panel selection and trace highlighting. The authored
content comes from `src/_data/capabilities.json` through `src/index.njk` data
attributes. Pointer selection, focus and Enter/Space activate a node. Selection
changes the panel and the highlighted connection without changing the route.
Without JavaScript, the first capability description is already rendered. On a narrow frame the same nodes are readable buttons instead of scaled SVG labels; selection, keyboard activation and the panel still belong to `setupCapabilityMap`.
First-screen entry motion is CSS alone (`data-cal` slots); `setupReveals` only defers
below-the-fold blocks while they are off-screen. Reduced motion animates nothing.

Each case study and note ends with one "Next case study" or "Next note" link above
the back-to-index pair: the next case by `order`, or the next older note, wrapping
to the first. It is plain server-rendered HTML from the same collections, so it
works without JavaScript and never links a draft.

`src/notes/posts/posts.11tydata.js` suppresses a draft's page permalink and excludes
it from collections. The notes collection also filters drafts in
`eleventy.config.js`. Notes listing, feed and sitemap consume those collections.
Publishing decisions belong to note front matter; navigation and generated-output
checks do not approve content. A clean build is the publication boundary.

Source privacy scanning cannot decide whether apparently anonymised copy identifies
a client. `AGENTS.md` owns that judgement and the grandfathered-content exception.
The rendered checker owns headings, metadata, links, feed/sitemap structure and
parity, draft absence and revision bytes. OG checks inspect image headers, not
pixel decoding. GitHub Pages serves the artifact built by the main workflow and
its post-deploy verifier compares the live revision body exactly.

Every page carries a Content Security Policy as the first element after
`<meta charset>`, written at build time by `scripts/csp.mjs` (GitHub Pages cannot
send headers). It allows only this site's own files, each inline script by the
SHA-256 of its exact text, and Sentry's loader, SDK and ingest origins when the
production build has a DSN. It has no `'unsafe-inline'`, `'unsafe-eval'` or
wildcard, and blocks forms, `<base>` and plugins. Anything it blocks in a visitor's
browser is reported to Sentry once per page as "CSP blocked <directive> <URL>",
without the URL's query; extension and Sentry URLs are skipped. Pages also send
`strict-origin-when-cross-origin` as their referrer policy. The meta form cannot set
`frame-ancestors`, HSTS or `X-Content-Type-Options`; those need response headers.

The unlinked prayer-time audio files remain intentional HTTP assets. Browser
verification checks that they are served, without playback or touching the external
consumer. Build and release inputs are in `package.json`, the lockfile and the
workflows; their versions and retry limits are read there.
