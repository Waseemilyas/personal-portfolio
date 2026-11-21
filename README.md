# waseemilyas.uk

Personal portfolio of **Waseem Ilyas** — technologist, builder, automation practitioner.
A distinctive static site built with [Eleventy](https://www.11ty.dev/) and deployed to
GitHub Pages. Live domain: <https://waseemilyas.uk>.

## Stack

- **Eleventy (11ty)** static site generator — zero client framework, pure HTML/CSS/vanilla JS.
  Pinned exactly to the v4 canary (`4.0.0-alpha.12`): it installs half the packages 3.1.8
  did and needs none of the advisory overrides 3.1.8 did, and it builds this site
  byte for byte the same. Move to `4.0.0` when it is released. Diff `_site/` from the
  old and new builds before taking any later canary.
- **Geist + Geist Mono**, self-hosted (no CDN dependency).
- Two-surface art direction: warm-graphite *console* + near-white *paper essay*.

## Develop

```bash
pnpm install --frozen-lockfile
pnpm run serve     # local dev server with live reload, on localhost only
pnpm run build     # static build → _site/
```

### Check a change

```bash
pnpm check                                 # type-aware lint, strict JS types, source privacy guard
pnpm check scripts/nav-drawer.test.mjs      # plus only this named owner test
```

CI runs `pnpm test`, a production build and `node scripts/site-check.mjs` once on
the pull request. The rendered checker covers page headings, metadata, links,
JSON-LD, draft exclusion, sitemap/feed parity, revision bytes, OG image headers
and the public file inventory.
Image pixels are not decoded. The privacy scanner complements the judgement rules
in [AGENTS.md](AGENTS.md); it cannot decide whether anonymised copy identifies a client.

Tests that read the built site call `builtSite()` from `scripts/built-site.mjs` rather
than building their own copy. Under `pnpm test` and `pnpm check <tests>` the first such
test builds once (with a test error-reporting DSN, as production has one) and the rest
reuse it; `scripts/test-setup.mjs` names and removes the shared directory.

Strict `checkJs` uses tsrs, the Rust port of the TypeScript compiler, over production browser,
build and CLI JavaScript. After the frozen install, `tsconfig.json` resolves imports
without a build or generated types. Exact tool versions live in `package.json`.

`pnpm lint` is type-aware: oxlint hands tsrs's linter (`tsrs-lint`, through
`OXLINT_TSGOLINT_PATH` in the `lint` script) the same programs, so rules can see types.
They catch promises nobody awaits or handles, async callbacks where a plain one is
expected, awaiting a non-promise, `[object Object]` in strings, deprecated DOM APIs and
throwing non-Errors (`.oxlintrc.json`). Test files are outside `tsconfig.json`, so they
are linted in an inferred program; `test()` from `node:test` is listed as a safe call.
Type-aware lint does not replace `tsrs --noEmit`, which still runs in `pnpm check`.

Installs point git at `.githooks/` through `prepare`. Keep the gitleaks rules and
sensitive-path guards enabled.

## Structure

```
src/
  _data/        site config, capability + timeline data (JSON)
  _includes/    base.njk layout, case.njk, note.njk, partials
  assets/       css/ js/ fonts/ img/
  static/       passthrough to site root (CNAME, robots, manifest, favicons)
  work/         case studies (one Markdown file each)
  notes/        notes route + feed, with the posts in notes/posts/
  *.njk         Home, About, Work, Automancer, Lab, Contact
eleventy.config.js
```

Visitors download minified JavaScript. The build minifies `src/assets/js/site.js` with
esbuild (`scripts/minify-js.mjs`) and publishes it with `site.js.map` beside it, so a
browser's developer tools and Sentry read the original source. Every page's inline
scripts, including the production error loader, are minified too. Edit the sources as
usual; the output never uses syntax newer than ES2020, which the sources already use.
The policy hashes and the script's integrity are taken from the minified bytes.

## Notes / blog content model

Add a post by dropping a Markdown file in `src/notes/posts/` with front matter
(`title`, `date`, `summary`, optional `tags`, `draft`). The `/notes/` route, layout, and
Atom feed (`/notes/feed.xml`) already exist, **Notes** is in the primary nav, and
`summary` becomes the page's meta description unless the post sets `description`
explicitly. A post with `draft: true` is never written to disk, so an unfinished note can
sit in `posts/` safely.

Each full build removes leftover HTML and share cards when an article is drafted,
deleted or moved. `pnpm serve` also rebuilds and removes them when a file is deleted.
Partial builds preserve pages and cards outside their selection. Dry runs and JSON
builds leave the on-disk site alone.

Each published note and case study shares its own preview card on social sites and chat
apps. `pnpm build` generates the cards and their metadata directly from the rendered
pages; `pnpm serve` refreshes changed cards as you edit. Drafts produce no cards. There
are no generated images or text manifests to commit.

Local builds find a browser themselves, headless shell first: `chrome-headless-shell`
on PATH, then Playwright's headless shell (macOS and Linux), then Chromium or Google
Chrome on PATH or in their usual Mac places, then Playwright's full Chromium. A machine
whose kernel refuses Chromium's sandbox gets one unsandboxed retry; the browser only
draws the site's own card HTML. If none is installed, run
`npx playwright install chromium-headless-shell` or set `CHROME=/path/to/chrome`. CI and GitHub Pages use the same pinned
Chrome for Testing Headless Shell. On the first render in a job,
`scripts/chrome-for-testing.sh` downloads the Linux x64 bundle and verifies its
SHA-256 before extracting it. Python 3 with Pillow compresses the cards. The
release workflows install Pillow. Without it a local build leaves larger,
full-colour PNGs. All images stay in `_site/`, alongside the HTML they describe.

Finished cards are also kept in `node_modules/.cache/share-cards/`. Each is named by a hash of
everything that decides its pixels: the card's text, styles and fonts, the layout script and
the compression. On GitHub Actions the pin is part of the cache key, so a browser
upgrade redraws the cards. A build copies a kept card without fetching or starting
Chromium. The Pages build restores this folder from earlier main builds and saves
it again. CI restores it too. The share-card test keeps its own folder, so it
always exercises a fresh render. Delete the folder to force fresh cards.

## Deployment

`.github/workflows/deploy.yml` builds and publishes `_site/` on a main push or
manual dispatch. Add a static file to `scripts/public-assets.mjs` when it is
intended for publication. The build copies that list, and `site-check` rejects
extra files and filesystem links before the workflow uploads the checked site.
The workflow polls the custom domain until `/revision.txt` is exactly the
deployed SHA and fails if production never serves it. Each HTML page also
carries that SHA in its revision meta tag. The revision comes from
`SITE_REVISION`, else `GITHUB_SHA`, else `git rev-parse HEAD` (`scripts/revision.mjs`).

A last job then runs `node scripts/domain-check.mjs` (`.github/workflows/domain.yml`),
which also runs daily: the domain's CAA records allow only Let's Encrypt and no
wildcards, the served certificate comes from that authority with at least 21 days
left, DNSSEC validates, `http://` redirects to `https://`, the apex publishes a
signed HTTPS DNS record that sends browsers straight to `https://`, the Sentry project
behind the live page's DSN accepts an error event from `https://waseemilyas.uk` and
refuses one from any other website, and `/.well-known/security.txt` is published and
not within 21 days of expiry. The probe event carries an ordinary browser's user agent
and is stored as one issue, "domain-check origin probe", in the `domain-check`
environment; that issue is the probe, not a visitor's error. If GitHub Pages ever
moves to another certificate authority, add it to `ALLOWED_CAS` in that script and as
a CAA `issue` record in the Cloudflare zone before the old certificate runs out.

`deploy.json` declares the live revision endpoint. Main is production; no staging
or preview environment is needed. `.release-notes.json` enrolls shipped changes
in the estate's release catch-up. The notes writer runs separately from Actions;
its changelog commit also publishes normally. Published release bodies are history.

Contact: `waseem@automancer.uk`
