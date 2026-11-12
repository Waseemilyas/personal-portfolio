---
name: verify-portfolio
description: Drive the real portfolio pages, capability map and mobile navigation after a change, retaining browser evidence and cleanup receipts.
---

# Verify the portfolio

Last verified: 2026-10-21 on Linux with Chromium (35 s, 14 pages, 33 screenshots).

## Launch

Use a clean checkout. Install Node/pnpm from the repository's package configuration,
Python 3 and a global `agent-browser` with Chrome available (run it on a machine that has both;
the helper fails with `FileNotFoundError` otherwise). Do not install browser
automation into this package.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
node scripts/site-check.mjs
python3 .agents/skills/verify-portfolio/drive.py --out .audit/browser-local
```

The output directory must not already exist. The executable helper serves this
checkout's `_site/` on its own ephemeral loopback port and opens a unique browser
session. It refuses tracked or untracked source changes and a stale build before
starting either. Each CLI operation is bounded; the whole browser path has a
five-minute ceiling.

## Doctor

`agent-browser doctor` must find a usable browser. The helper checks exact
`revision.txt` bytes before driving anything, and verifies the rendered revision
meta tag. Its server and browser session are private to the run. A failure before
those checks is unavailable verification, not proof that the website is broken.

## Drive

Run the helper above. It operates actual navigation, nodes and keyboard events;
it does not call internal application functions. [features/index.md](features/index.md)
maps the complete visitor surface. It captures each built HTML page at desktop
and phone widths, checks overflow, drives the mobile drawer, changes capability
selection and checks reduced motion. It reads feed/sitemap/audio bodies and contact
link targets without opening external destinations, sending mail or playing audio.

After a deploy, build the checked-out merged revision and repeat against production:

```bash
python3 .agents/skills/verify-portfolio/drive.py --out .audit/browser-production --url https://waseemilyas.uk
```

The production mode is read-only and requires the same expected build revision.
Never treat an older site's successful journey as proof of the new revision.

## Evidence

Retain `commands.log`, `result.json` and all PNGs in the chosen output directory.
Chrome cannot take a screenshot once scripts are disabled (`Page.captureScreenshot`
times out on every page), so the JavaScript-disabled footer step has no PNG: its
receipt says so, and its DOM checks and footer click still run.
Read the screenshots: a passed DOM assertion cannot establish legibility. If
your model cannot read images, use the local vision lane — in a factory lane
the loopback gateway is unreachable, so point the helper at the estate router
or every call looks like an empty answer (stderr says the gateway timed out):

```bash
GATEWAY_URL=http://auto-hst1:8100 bash ~/.agents/skills/local-models/vision/scripts/see-image.sh <png> "<question>"
```

Check `http://auto-hst1:8100/status/data` first, as the `local-models` skill
says; if it does not answer, say the screenshots were unread, not fine. Copy or
archive the directory outside a disposable checkout before removing it. The
receipt records revision, actual actions, page coverage, process identities and
port closure. A partially populated receipt after failure is not a pass.

Browser dimensions do not prove physical phone, Safari, screen-reader, actual touch,
platform mail handlers or audible playback behaviour. Reduced-motion rendering is
checked; no frame-rate or performance claim is made.

## Cleanup

The helper closes its unique normal and JavaScript-disabled sessions, shuts down its own server in `finally`,
checks its listener is gone and compares recorded PID/start identities. It leaves
evidence intact. Inspect `survivors` and `port_closed` in the receipt; verify the
named identities if a close command failed. Never close all browser sessions.
