# AGENTS.md — waseemilyas.uk

This is Waseem Ilyas's **public** personal portfolio. Anything committed here is
published to the open internet at <https://waseemilyas.uk> and is indexed,
archived, and screenshotted by parties nobody controls. There is no staging gate
between a commit and the public site. Treat every edit as a press release.

Origin: <https://github.com/Waseemilyas/personal-portfolio.git> (renamed from
`waseemilyas.github.io` on 29 Oct 2026). The local
checkout is called `portfolio`; there is no `Waseemilyas/portfolio` repository.

Before content changes, read the private project record identified by the estate's
private Brain index. Copy none of that record into this public repository.

## 1. Standing content guardrails (never negotiable)

1. **Never name a client.** No client company name, client brand, client product
   name, client staff name, client domain, or internal client code. Not in
   prose, not in a link, not in an image, not in alt text, not in a filename,
   not in a commit message, not in an HTML comment, not in `_data/*.json`.
2. **Never publish commercially sensitive detail.** No fees, day rates, contract
   values, contract terms, pipeline, prospects, revenue, headcount, client
   volumes, margins — nothing a competitor could price against.
3. **Never publish anything that creates security exposure.** No infrastructure
   specifics (hostnames, IPs, ports, server detail, file paths), no provider or
   account names, no internal tooling or credential-store names beyond what is
   already public, no internal architecture detail that would help someone
   attack Automancer or a client. Screenshots of internal systems are forbidden
   outright.
4. **Describe work generically — sector plus outcome.** The published pattern is
   `"operations platform for a home-care provider"`: never the client's name,
   never a recognisable fingerprint. `src/work/cs-care.md` is the reference
   implementation of this rule; copy its posture. Beware jigsaw identification —
   sector plus region plus size plus dates plus one distinctive feature can
   identify a client with no name present. Drop detail until it cannot.
5. **When in doubt, do not publish.** Ambiguity is not a tie to be broken in
   favour of shipping. Leave the content out and raise the question on the
   WI-PF1 project for Waseem to rule on. Silence is always the safe default and
   is never a failure.

### Pre-existing content is grandfathered

Some published content predates these guardrails and shipped under a QA privacy
review and board release approval in June 2026. It has been ruled on and it
stays: **do not remove it and do not rewrite it.** This is a closed carve-out
for specific existing content, not a precedent — **do not extend its pattern to
anything new.** New and changed content follows section 1 with no exceptions,
and `src/work/cs-care.md` remains the reference implementation. The specifics
are in that private record, not here.

## 2. Scope and publishing

Anonymised case studies, notes, capability/about/timeline copy, build tooling,
dependencies, accessibility, performance and link hygiene are in scope. Redesigns,
art direction, new top-level sections and stack changes need explicit instruction.
Preserve settled design decisions and grandfathered copy.

A merge to `main` publishes through `.github/workflows/deploy.yml`. Publishing is
ungated; email, DMs, form submissions, directory submissions and other outreach
need Waseem's approval under the estate decision policy.

## 3. Working rules

- Install with `pnpm install --frozen-lockfile`. The fast check is `pnpm check` (lint,
  tsrs typecheck, source privacy guard), plus explicit owner tests, for example
  `pnpm check scripts/nav-drawer.test.mjs`. The pull request's CI is the full verdict
  (`pnpm test`, build, `node scripts/site-check.mjs`); do not repeat it locally.
  `README.md` owns launch and release commands.
- Search the diff for client names and codes before committing. If the change
  touches `src/work/`, `src/_data/`, `src/about.njk`, `src/index.njk`, or
  `src/lab.njk`, re-read section 1 first.
- Credentials stay in the host secret store. The browser error-reporting DSN is
  the only key that may legitimately appear in built output.
- `.gitignore` keeps internal planning docs, `_site/`, and `node_modules/` out of
  this public repo on purpose. Leave those rules in place and commit only what
  they already allow.
- Keep the site static and GitHub Pages-compatible unless Waseem approves
  otherwise.
- **Prayer-time audio files (`audio/`)**: `audio/adhan.mp3`, `audio/iftar.mp3`, and
  `audio/sehri.mp3` are intentional assets fetched over HTTP by an external Home
  Assistant automation. They are deliberately not linked anywhere on the site, but
  must remain in this repository and must not be deleted or renamed. See
  `audio/README.md`.

## 4. Read by task

- `README.md`: stack, build, structure, release. Before your first build.
- `docs/DESIGN.md`: tokens, type scale, components, heading hierarchy. Before any UI change.
- `docs/PRODUCT.md`: register and audience. Before writing site copy; section 1 applies to it.
- The private project record above: before any content change; publish none of it.
- `GLOSSARY.md` for the portfolio's language, `SPEC.md` for observed behaviour,
  `.agents/skills/verify-portfolio/SKILL.md` for the browser walk of every visitor journey.

Root `/DESIGN.md` and `/PRODUCT.md` stay gitignored for internal planning and must
not be un-ignored. No generated evidence belongs in public site content.

## After a merge

`main` deploys in about a minute and the workflow ends by checking
`https://waseemilyas.uk/revision.txt` for the merged SHA. Then read production with
`obs uptime portfolio`, `obs errors portfolio --since 1h` (browser errors, tagged
with the release SHA) and `curl -s https://waseemilyas.uk/revision.txt`.
