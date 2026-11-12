# waseemilyas.uk

Personal portfolio of **Waseem Ilyas** — technologist, builder, automation practitioner.
A distinctive static site built with [Eleventy](https://www.11ty.dev/) and deployed to
GitHub Pages. Live domain: <https://waseemilyas.uk>.

## Stack

- **Eleventy (11ty)** static site generator — zero client framework, pure HTML/CSS/vanilla JS.
- **Geist + Geist Mono**, self-hosted (no CDN dependency).
- Two-surface art direction: warm-graphite *console* + near-white *paper essay*.

## Develop

```bash
pnpm install --frozen-lockfile
pnpm run serve     # local dev server with live reload
pnpm run build     # static build → _site/
```

### Check a change

```bash
pnpm check                                 # lint, strict JS types, source privacy guard
pnpm check scripts/nav-drawer.test.mjs      # plus only this named owner test
```

CI runs `pnpm test`, a production build and `node scripts/site-check.mjs` once on
the pull request. The rendered checker covers page headings, metadata, links,
JSON-LD, draft exclusion, sitemap/feed parity, revision bytes and OG image headers.
Image pixels are not decoded. The privacy scanner complements the judgement rules
in [AGENTS.md](AGENTS.md); it cannot decide whether anonymised copy identifies a client.

Strict `checkJs` uses tsrs, the Rust port of the TypeScript compiler, over production browser,
build and CLI JavaScript. After the frozen install, `tsconfig.json` resolves imports
without a build or generated types. Exact tool versions live in `package.json`.

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

## Notes / blog content model

Add a post by dropping a Markdown file in `src/notes/posts/` with front matter
(`title`, `date`, `summary`, optional `tags`, `draft`). The `/notes/` route, layout, and
Atom feed (`/notes/feed.xml`) already exist, **Notes** is in the primary nav, and
`summary` becomes the page's meta description unless the post sets `description`
explicitly. A post with `draft: true` is never written to disk, so an unfinished note can
sit in `posts/` safely.

Each published note and case study shares its own preview card on social sites and chat
apps. `pnpm build` generates the cards and their metadata directly from the rendered
pages; `pnpm serve` refreshes changed cards as you edit. Drafts produce no cards. There
are no generated images or text manifests to commit.

Builds need a local Chromium (`google-chrome` on the GitHub-hosted runner). Set
`CHROME=/path/to/chrome` if it is not on PATH. Python 3 with Pillow compresses the
cards; the release workflows install it. Without Pillow a local build leaves larger,
full-colour PNGs. All images stay in `_site/`, alongside the HTML they describe.

## Deployment

`.github/workflows/deploy.yml` builds and publishes `_site/` on a main push or
manual dispatch. It checks the generated site, uploads it to GitHub Pages, then
polls the custom domain until `/revision.txt` is exactly the deployed SHA; the job
fails if production never serves it. Each HTML page also carries that SHA in its
revision meta tag. The revision comes from `SITE_REVISION`, else `GITHUB_SHA`,
else `git rev-parse HEAD` (`scripts/revision.mjs`).

`deploy.json` declares the live revision endpoint. Main is production; no staging
or preview environment is needed. `.release-notes.json` enrolls shipped changes
in the estate's release catch-up. The notes writer runs separately from Actions;
its changelog commit also publishes normally. Published release bodies are history.

Contact: `waseem@automancer.uk`
