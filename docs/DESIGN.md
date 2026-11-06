---
name: waseemilyas.uk
description: Two-surface static portfolio — warm-graphite console meets near-white paper essay.
# The `colors:`, `rounded:` and `spacing:` groups map 1:1 to custom properties on
# `:root` in src/assets/css/styles.css — `--<key>`, `--rounded-<key>` and
# `--space-<key>` respectively — and `var()` resolves for every one of them.
# `typography:` and `components:` do not: they describe the type scale and
# component intent, and have no custom property to reach for. (The six `fontSize`
# clamps repeat the values of `--step--1` … `--step-4`, which the stylesheet
# declares; there is no `steps:` group here.)
colors:
  graphite-900: "oklch(0.17 0.008 65)"
  graphite-800: "oklch(0.21 0.009 65)"
  graphite-700: "oklch(0.27 0.010 65)"
  bone: "oklch(0.93 0.006 75)"
  bone-mute: "oklch(0.70 0.008 70)"
  line-dark: "oklch(1 0 0 / 0.12)"
  paper: "oklch(0.985 0.002 70)"
  paper-sink: "oklch(0.955 0.003 70)"
  ink: "oklch(0.22 0.010 60)"
  ink-mute: "oklch(0.46 0.010 60)"
  line-light: "oklch(0.22 0.01 60 / 0.14)"
  signal: "oklch(0.66 0.185 42)"
  signal-deep: "oklch(0.53 0.170 40)"
  trace: "oklch(0.80 0.130 78)"
  # `--on-signal` — text on a `--signal` fill. Used by .skip and .btn-primary.
  on-signal: "oklch(0.16 0.02 40)"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(2.7rem, 1.9rem + 4vw, 5.4rem)"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.038em"
  section-title:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "clamp(2.1rem, 1.6rem + 2.4vw, 3.4rem)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  card-title:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "clamp(1.5rem, 1.25rem + 1.1vw, 2.1rem)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.02em"
  lede:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "clamp(1.18rem, 1.05rem + 0.6vw, 1.45rem)"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  body:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "clamp(0.98rem, 0.93rem + 0.25vw, 1.08rem)"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "clamp(0.78rem, 0.75rem + 0.15vw, 0.86rem)"
    # `.label` (styles.css) sets family, size, tracking, uppercase and colour
    # only. The 500 weight comes from the `.mono` class every template pairs it
    # with; line-height is inherited from body. Neither is declared on `.label`.
    fontWeight: 500
    lineHeight: 1.55
    letterSpacing: "0.08em"
# `--rounded-<key>` on `:root`. Pick a rung, never a fresh number.
rounded:
  xs: "2px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  pill: "999px"
# `--space-<key>` on `:root`. These are the *recurring* measures only — one-off
# paddings and gaps stay literal rather than being forced onto a rung.
spacing:
  section-block: "clamp(3.5rem, 8vh, 6rem)"
  shell-inline: "clamp(1.1rem, 4vw, 3rem)"
  card-inline: "clamp(1.1rem, 2.5vw, 1.8rem)"
  grid-gap: "clamp(1.4rem, 3vw, 2.6rem)"
  head-gap: "1rem"
  head-below: "2.4rem"
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.on-signal}"
    typography: "{typography.body}"
    fontWeight: 500
    rounded: "{rounded.sm}"
    padding: "0.7rem 1.15rem"
  button-primary-hover:
    backgroundColor: "{colors.signal-deep}"
    textColor: "{colors.bone}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    typography: "{typography.body}"
    fontWeight: 500
    rounded: "{rounded.sm}"
    padding: "0.7rem 1.15rem"
  panel:
    background: "linear-gradient(180deg, {colors.graphite-800}, {colors.graphite-900})"
    textColor: "{colors.bone}"
    rounded: "{rounded.lg}"
    padding: "1.15rem 1.2rem 1.3rem"
  workcard:
    backgroundColor: "{colors.graphite-900}"
    textColor: "{colors.bone}"
    typography: "{typography.card-title}"
    padding: "1.4rem {spacing.card-inline}"
  workcard-hover:
    backgroundColor: "{colors.graphite-800}"
  lab-card:
    backgroundColor: "{colors.graphite-800}"
    textColor: "{colors.bone}"
    rounded: "{rounded.lg}"
    padding: "1.3rem 1.4rem"
  datasheet:
    backgroundColor: "{colors.paper-sink}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  flag:
    backgroundColor: "oklch(0.66 0.185 42 / 0.06)"
    borderColor: "{colors.signal-deep}"
    textColor: "{colors.ink-mute}"
    rounded: "{rounded.sm}"
    padding: "0.8rem 0.95rem"
---

# waseemilyas.uk — Design System

<!--
  Design documentation only. This file is committed to a PUBLIC repository.
  Read AGENTS.md §1 before adding anything: no client names, no commercial
  detail, no infrastructure specifics. Tokens, type, and component structure
  only. Internal positioning and planning material stays in the private project record.

  This file is a binding reference: agents change code on the strength of it.
  Do not assert a rule you have not checked against src/assets/css/styles.css
  and the templates. An over-strong claim here becomes a wrong edit later.
-->

## Overview

A single-author portfolio built as a **two-surface system**. The contrast between
the surfaces is the art direction, not decoration.

- **Console** (`.console`) — warm graphite, near-black but never neutral-black
  (hue 65, chroma 0.008–0.010). Carries the identity: the hero, capability map,
  work index, timeline, lab, footer. Overlaid with a 54px measurement grid
  radially masked from the top-right, plus corner registration marks (`.reg`).
  The register is *instrument panel*: monospace refs, readouts, live blips.
- **Essay** (`.essay`) — near-white paper (L 0.985, not cream) for long-form
  reading: case studies, about, notes. Ink on paper, generous measure, no grid.

The surface is chosen **per section**, not per route — see *Surface rule* below.

The stack is Eleventy + hand-written CSS — **no framework, no utility classes, one
stylesheet** (`src/assets/css/styles.css`, ~350 lines). Typefaces are self-hosted
variable Geist and Geist Mono; there is no CDN dependency and no runtime style
system.

### What is actually tokenised

`:root` (`styles.css`) declares **37** custom properties and no others:

- 15 colours — the console, essay and signal tables below, plus `--on-signal`.
- 2 families — `--sans`, `--mono`.
- 6 type steps — `--step--1` … `--step-4`.
- 6 radius rungs — `--rounded-xs` … `--rounded-pill`.
- 6 spacing measures — `--space-section-block` … `--space-head-below`.
- `--ease` and `--maxw`.

Every key in the colour, radius and spacing groups — and every `--step-*` — resolves
as a `var()`. Use the variable, not the literal: `border-radius: var(--rounded-lg)`,
`color: var(--on-signal)`. (The `typography` sub-keys — `fontFamily`, `fontSize`,
`fontWeight`, `lineHeight`, `letterSpacing` — describe the scale; they are not
custom properties and there is no `var()` to reach for.)

Two deliberate limits on that claim:

- **The spacing group covers recurring measures, not every gap.** One-off values
  (`.hero`'s `clamp(3.5rem, 9vh, 6.5rem)` padding, `.about-grid`'s
  `clamp(1.6rem, 4vw, 3.4rem)` gap, card paddings) stay literal on purpose —
  they are not rungs, and tokenising them would imply a rhythm that is not there.
  `--space-head-gap` / `--space-head-below` apply to heads (`.section-head`,
  `.casehead`, `.about-grid`'s top margin); a `1rem` gap elsewhere is unrelated.
- **`var()` does not resolve in SVG presentation attributes.** `fill="var(--x)"`
  and `stroke="var(--x)"` silently fail in every browser. Inline SVG that needs a
  token must be styled from CSS — see the `.diagram-panel .wf-*` rules
  (`styles.css`), which is how `diagram-workflow.njk` reaches its tokens: `--trace`
  at 55% alpha via `color-mix(in oklch, var(--trace) 55%, transparent)`, plus
  `--signal` (`.wf-arrowhead`, `.wf-node-live`), `--graphite-700` / `--bone`
  (`.wf-node`) and `--line-dark` (`.wf-ticks`). Two colour values in that partial
  stay literal because no token matches them: the node hairline
  `oklch(1 0 0 / 0.18)` (`--line-dark` is 12%, and alpha cannot be scaled *up*
  with `color-mix`) and the live node's label `oklch(0.80 0.13 50)`. Both stay as
  presentation attributes. The hairline survives on `.wf-node` rects because
  `.wf-node rect` sets only `fill`; the label does not, which is why the live node
  deliberately does **not** carry `.wf-node` — `.wf-node text` would beat that
  attribute. (Family, size and tracking on the label group are literal too, for
  the same SVG reason.)

`--ease` (`cubic-bezier(0.16, 1, 0.3, 1)`) is the single easing curve: it drives
every transition and all three keyframe animations. New motion uses it.

### Progressive enhancement, and its one exception

Motion is an enhancement, never a gate: `[data-cal]` elements are visible by
default and the `.in` reveal only animates when JS runs and the user has not asked
for reduced motion. The capability map is server-rendered with the first node's
copy already in place, so it reads fine with JS disabled.

**The mobile nav drawer is the exception.** Below 720px `.nav` is fixed and
translated off-screen (the `.nav` rule in the 720px media query, `styles.css`);
only `data-open="true"` reveals it, and
that attribute is set exclusively by `src/assets/js/site.js`. With JS disabled the
drawer cannot be opened and the toggle is inert — the footer nav (`.foot .fnav`,
on every page) is the fallback. Do not describe the mobile nav as working without
JS, and do not add anything else that depends on a script to reach content.

## Colors

Colour is authored **in OKLCH throughout**, and the frontmatter above carries OKLCH
rather than hex on purpose. The palette leans on sub-0.01 chroma at a fixed warm hue
to keep the greys warm; round-tripping those through sRGB hex loses exactly the
quality that distinguishes this palette from a neutral-grey theme. Stitch's linter
validates hex only and will warn on this file — that warning is accepted rather than
splitting the source of truth away from the CSS.

**Console surface**

| Token | Value | Role |
| --- | --- | --- |
| `--graphite-900` | `oklch(0.17 0.008 65)` | Page background, workcard rest state |
| `--graphite-800` | `oklch(0.21 0.009 65)` | Raised fills: panels, lab cards, mobile nav |
| `--graphite-700` | `oklch(0.27 0.010 65)` | Diagram fills, timeline dots |
| `--bone` | `oklch(0.93 0.006 75)` | Primary text |
| `--bone-mute` | `oklch(0.70 0.008 70)` | Secondary text, nav rest, captions |
| `--line-dark` | `oklch(1 0 0 / 0.12)` | Hairlines and borders on console |

**Essay surface**

| Token | Value | Role |
| --- | --- | --- |
| `--paper` | `oklch(0.985 0.002 70)` | Page background |
| `--paper-sink` | `oklch(0.955 0.003 70)` | Recessed fills: figures, datasheet |
| `--ink` | `oklch(0.22 0.010 60)` | Primary text |
| `--ink-mute` | `oklch(0.46 0.010 60)` | Secondary text, captions |
| `--line-light` | `oklch(0.22 0.01 60 / 0.14)` | Hairlines and borders on paper |

**Signal**

| Token | Value | Role |
| --- | --- | --- |
| `--signal` | `oklch(0.66 0.185 42)` | The single accent — vermilion. Console, plus the global focus ring and skip link. |
| `--signal-deep` | `oklch(0.53 0.170 40)` | The same accent on paper, darkened for contrast |
| `--trace` | `oklch(0.80 0.130 78)` | Amber connection lines: active traces in the capability map |
| `--on-signal` | `oklch(0.16 0.02 40)` | Text on a `--signal` fill: `.skip`, `.btn-primary` |

There is **one accent colour**. The surface pairing is `--signal` on console,
`--signal-deep` on essay (see `.essay .section-head .ref`, `.prose a`, `.casenav a`).
Two deliberate exceptions are global rather than per-surface and use `--signal` on
both: the `:focus-visible` ring and the `.skip` link (both `styles.css`). The
essay-only `.flag` is tinted with the signal hue at 6% (`.prose p.flag, .flag`,
`styles.css`) — but as the hard-coded literal `oklch(0.66 0.185 42 / .06)`,
**not** `var(--signal)`. Both `on-signal` literals are now tokenised, so it is
the **only** colour literal left in the stylesheet outside `:root`, discounting the
two `#000` mask-gradient stops on `.console::before` (`-webkit-mask-image` /
`mask-image`), which are alpha stops rather than design colours.

`--trace` is amber and exists to distinguish an active *connection* from an active
*node*. It is used in the capability SVG (`src/index.njk`), and it also strokes the
resting connectors in `partials/diagram-workflow.njk`, which renders on `/` and
`/automancer/`.

**The connector stroke carries 55% alpha, and that is load-bearing.** It is
tokenised: the partial's trace group is `class="wf-trace"` with no `stroke`
attribute, and the colour comes from `.diagram-panel .wf-trace` (`styles.css`) as
`color-mix(in oklch, var(--trace) 55%, transparent)`. The `color-mix` is not
decoration — `--trace` itself is fully opaque, so a bare `var(--trace)` would
**darken the resting connectors on both routes**. Do not "simplify" this rule to
`var(--trace)`.

Do not promote amber to a second brand colour.

Translucent lines are deliberately alpha-on-surface rather than solid greys, so a
hairline stays correct if the surface beneath it changes.

## Typography

Two families, one fluid scale, six steps.

| Token | Range | Used for |
| --- | --- | --- |
| `--step--1` | `0.78rem → 0.86rem` | Mono labels, refs, captions, datasheet, footer, nav links |
| `--step-0` | `0.98rem → 1.08rem` | Body, buttons, wordmark, nav links inside the mobile drawer |
| `--step-1` | `1.18rem → 1.45rem` | Hero lede, case kicker, lab-card titles, and `h3` in `.prose` / `.capread` / `.milestone` |
| `--step-2` | `1.5rem → 2.1rem` | Work card titles (at either heading level), prose `h2`, note titles, the `/about/` lede |
| `--step-3` | `2.1rem → 3.4rem` | Section titles, case-study titles |
| `--step-4` | `2.7rem → 5.4rem` | Hero titles — `.hero h1`, on `/` and `/404` |

Sizes outside the scale are all **inside SVG**, plus one display element:
`.email-big` has its own clamp (`styles.css`) because the address is a display
element; the capability-map labels are fixed at `11px` (`.node text`) and `10px`
(`.hub text`); and every inline diagram label is `12px`
(the `font-size="12"` on the node group in `partials/diagram-workflow.njk`, and the
`figure` SVG in each of the three case studies). The SVG sizes are fixed because
they scale with the viewBox, not the page. That is the settled wide-canvas
treatment: do not enlarge those user-unit sizes to chase a phone viewport, or
the desktop composition changes. When the frame is narrower than the settled
composition (36rem for the capability map and case-study figures, 28rem for the
workflow panel), the same authored labels are shown again in HTML at `--step-0`.
See `.diagram-phone` and `.cap-phone` in `styles.css`. Outside SVG, use a step —
if a value is not in the scale, the answer is almost always the nearest step
rather than a new one.

- `--sans` (Geist) sets everything structural. `--mono` (Geist Mono) is for
  **metadata rather than prose** — refs, keys, eyebrows, datasheet terms, timeline
  eras, the email link, and `.label` (uppercase, `0.08em` tracking). Note the rule
  is narrower than it sounds: mono also carries a few short UI affordances, among
  them the `.workcard .go` arrow, `.casenav a` links and the `.proof li::before`
  bullet glyph (all `styles.css`). There are 20 `var(--mono)` consumers in all;
  the constraint that actually holds is **never body copy**.
- Headings tighten as they grow: the global rule is `font-weight: 700`,
  `line-height: 1.04`, `letter-spacing: -0.03em`, `text-wrap: balance`; the hero
  goes further to `800` / `-0.038em`. Paragraphs and list items use
  `text-wrap: pretty` so a last line is never a lone word.
- Measure is capped per context and those caps are load-bearing. Among them: hero
  `16ch`, hero lede `46ch`, section-head copy `42ch`, case title `20ch`, prose
  `68ch` (container `70ch`), about lede `24ch`, timeline proof list `60ch` (the
  milestone paragraph's cap). Other blocks carry their own caps —
  check the rule before adding a new one.
- Body line-height is `1.55`; long-form prose relaxes to `1.62`.

### Heading hierarchy contract

Fixed by an earlier accessibility pass and **binding on new routes**. Every rendered
document has exactly one `<h1>` and skips no level.

| Route archetype | `<h1>` | `<h2>` | `<h3>` |
| --- | --- | --- | --- |
| **Home** (`index.njk`) — one page, many sections | Hero title | Each `.section-head` title | Cards and items inside a section (`.workcard`, `.lab-card`, `.milestone`, `.capread`) |
| **Index route** (`/work/`, `/lab/`) | The `.section-head` title | The cards themselves (`.workcard`, `.lab-card`) | — |
| **Simple route** (`/automancer/`, `/contact/`) | The `.section-head` title | Subsections, if any | — |
| **Essay/detail** (case studies, notes, `/about/`) | The `.casehead` title | `.prose h2`, or `.section-head h2` for a following section | `.prose h3`, `.milestone h3` |
| **Notes index** | `.casehead` title ("Notes") | `.note-item` titles | — |
| **Error route** (`/404.html`) | The `.hero` title | — | — |

Both notes rows are live output as of the first published note (August 2026): `/notes/`
renders the `.notes-list` branch with an `<h2>` per `.note-item`, and each post builds a
note-detail page. `.notes-empty` is the fallback branch and only renders if every note
in `src/notes/posts/` is `draft: true` (drafts get `permalink: false`), so it is styled
and remains in the template but is not currently rendered. A note-detail page carries
a single `<h1>` and `.prose h2`/`h3` only if the post's Markdown uses them; the first
note does not.

The rule that makes this work: **a card's heading level depends on its page, not on
its class.** The same `.workcard` is an `<h3>` on the homepage (nested under a section
`<h2>`) and an `<h2>` on `/work/` (directly under the page `<h1>`). CSS therefore
matches both levels — `.workcard h2, .workcard h3`, `.lab-card h2, .lab-card h3`,
`.section-head h1, .section-head h2`, `.casehead h1, .casehead h2` — so promoting a
heading for semantics costs nothing visually. Never fork a component to change its
heading level; widen the selector instead.

## Surface rule

The surface is a property of the **section**, not the route. `<section class="console">`
and `<section class="essay">` may both appear in one document, and one route does
exactly that: `/about/` opens with an essay `.casehead` (the first
`<section class="essay">` in `src/about.njk`) and then stacks a console "career
arc" section (`<section class="console">`, same file). That is deliberate — do
not "fix" it.

Two pieces of **console chrome are global** and appear on every route regardless of
its content surface: the sticky `.topbar` and the `.foot` footer
(`src/_includes/base.njk`). Essay routes therefore always carry console chrome.

What the rule actually forbids is *blending within one section* — paper type on a
graphite fill, or a console readout inside `.prose`. Pick a surface for a section
and commit to it, and let the join between sections be a clean edge.

## Elevation

The system is **flat and drawn, not shadowed**. Depth comes from three devices, in
this order of preference:

1. **Hairline borders** — `1px solid var(--line-dark)` on console,
   `var(--line-light)` on paper. This is the default and covers most cases.
2. **Surface shift** — a raised block moves one step up the surface ramp
   (`--graphite-900` → `--graphite-800`), or a recessed one moves down
   (`--paper` → `--paper-sink`). Hovering a `.workcard` is exactly this.
3. **Directional gradient** — reserved for the largest containers: `.panel` uses a
   180° `graphite-800 → graphite-900`; `.capfig` and `.diagram-panel` use a radial
   `120% 120%` highlight offset toward one corner.

There is **no shadow scale**. `box-shadow` appears only as a *glow ring* on small
signal elements — the hero eyebrow dot and key timeline milestones, both
`0 0 0 4px color-mix(in oklch, var(--signal) 18–22%, transparent)`. Do not introduce
drop shadows for cards or modals.

The one true overlay is `.topbar`: sticky, `color-mix` to 88% opacity over the page
background, `backdrop-filter: saturate(1.2) blur(6px)`, hairline bottom border.

Radii ladder, with a representative use for each rung (not an exhaustive list of
consumers): `2px` focus ring · `8px` buttons, small flags, the nav toggle · `10px`
proof lists · `12px` panels, lab cards, figures, datasheet, capread · `14px` the
largest frames (worklist, capability figure, diagram panel) · `999px` the nav CTA
pill. Circles (`50%`) on dots and blips sit outside the ladder.

## Components

Components used on **two or more routes** — treat these as the shared inventory and
extend rather than fork.

| Component | Surface | Where it appears | Notes |
| --- | --- | --- | --- |
| `.shell` | both | every route | The only container. `max-width: 78rem`, fluid inline padding. |
| `.section` | both | every route | The vertical rhythm unit: `padding-block: clamp(3.5rem, 8vh, 6rem)`. Pairs with `.console` / `.essay`. |
| `.topbar` / `.nav` | console | every route | Sticky blurred bar. Collapses to a full-width drawer below 720px via `.nav-toggle` + `data-open` (**requires JS**). `aria-current="page"` paints the active link `--signal`. |
| `.foot` | console | every route | Global footer, inside `base.njk`. Two-column grid collapsing at 620px; `.fnav` is the no-JS nav fallback. |
| `.hero` | console | `/`, `/404` | Full-bleed intro band. `.hero h1` is the only `--step-4` consumer; carries `.reg` marks. Two-column on `/`, collapsing at 860px. |
| `.section-head` | console | home sections, `/work/`, `/lab/`, `/automancer/`, `/contact/`, `/about/` | Baseline-aligned row: mono `.ref` + title + optional right-aligned `p`. Heading is `h1` or `h2` per the contract above. Essay-surface styling exists (the `.essay .section-head` rules, `styles.css`) but no template currently uses it there. |
| `.casehead` | essay | case studies, notes (index and detail), `/about/` | Detail-page counterpart: `.ref`, title, optional `.kick` lede, hairline rule below. `/about/` carries `.ref` + title only — its lede is a separate `.lede-essay` paragraph that follows the closing `</div>` of the casehead (`src/about.njk`). |
| `.workcard` in `.worklist` | console | home, `/work/` | Three-column grid (ref · title+kick · go arrow) inside a 1px-gap list that fakes dividers via `background: var(--line-dark)`. Collapses to one column below 620px and drops the arrow. |
| `.lab-card` in `.lab-grid` | console | home, `/lab/` | `auto-fit minmax(15rem, 1fr)`. Hover lifts 2px and borders in `--signal`. |
| `.amancer` + `.diagram-panel` | console | home, `/automancer/` | Two-column copy + diagram block. The diagram is the shared partial `partials/diagram-workflow.njk`. |
| `.contact-cta` / `.email-big` | console | home, `/contact/` | The primary CTA. `.email-big` is mono and display-scale, underlined in `--signal`; it is one of the sizes outside the type scale. |
| `.milestone` in `.arc-line` | console | home, `/about/` | Timeline. `.key` milestones get a signal dot with glow. |
| `.proof` | console | home, `/about/` | Bordered `→` list on `--graphite-800`; the 10px radius rung. |
| `.datasheet` | essay | case studies, `/about/` | Sticky `top: 4.5rem` sidebar `dl`. |
| `.prose` | essay | case studies, notes, `/about/` | Long-form container, `70ch`. |
| `.casenav` | essay | case-study and note detail pages | Footer nav **inside** the `<article>`, not under it. A fixed pair — back-to-index link + `mailto` — **not** prev/next: no prev/next plumbing exists in `eleventy.config.js`. Mono in `--signal-deep`. |
| `.btn` (`-primary` / `-ghost`) | console | `/`, `/404`, `/automancer/`, `/contact/` | Every button ships on console. `.essay .btn-ghost` (+ hover) (`styles.css`) restates the ghost variant in ink, but no essay template uses a button — reserved, not shipped. |
| `.ref` | both | every content route | Mono section/page reference. `--signal` on console, `--signal-deep` on essay. |

Single-route components are in the stylesheet but deliberately not listed here:
`.capfig` / `.capread` (the homepage capability map), `.panel` / `.readout` (the
homepage status panel), `.casegrid` (case detail), `.about-grid` (`/about/`),
`.notes-list` / `.note-item` (notes index). Two more are worth knowing about:

- `.label` / `.mono` — mono metadata primitives, currently used only on `/` and
  `/404`. `.essay .label` (`styles.css`) is styled but unused.
- `.reg` — corner registration marks. Not hero-only: the top console section of
  `/work/`, `/lab/`, `/automancer/` and `/contact/` carries them too. `/` , `/404`,
  `/automancer/` and `/contact/` use all four (`.tl/.tr/.bl/.br`); `/work/` and
  `/lab/` use `.tl`/`.tr` only.
- `.figure` + `figcaption` — inline SVG artefacts on `--paper-sink`, case studies.
  The caption is a real `<figcaption>` element styled by the descendant selector
  `.figure figcaption` (`styles.css`) — there is no `.figcap` class. It was
  removed deliberately; do not reintroduce a caption class.
- `.flag` — dashed callout for content pending approval. Styled at
  `.prose p.flag, .flag` (`styles.css`) but **used by no template today**; it is
  reserved, not shipped.

`.essay`-scoped overrides are a small, closed set — `.essay .btn-ghost` (+ hover),
`.essay .section-head .ref`, `.essay .section-head h1, h2`, `.essay .section-head p`,
`.essay .label`. Prefer widening a base rule to adding a seventh.

Accessibility baked into the components: a `.skip` link precedes the header,
`:focus-visible` is a `2px --signal` outline at `3px` offset on every focusable
element, and the nav toggle maintains `aria-expanded`. Each **detail-page**
`<article>` is labelled by its own title id (`case.njk` → `aria-labelledby="case-title"`,
`note.njk` → `"note-title"`); the `.note-item` articles on the notes index are not
labelled this way.

## Do's and Don'ts

**Do**

- Pick one surface per **section** and commit to it. A route may stack sections of
  both surfaces — `/about/` does — but never blend them inside one section.
- Use the six-step type scale and the `:root` tokens. If a value is not in the
  scale, the answer is usually the nearest step, not a new value.
- Reach for the token, not the number. Colour, radius and the recurring spacing
  measures are all `var()`s; a new literal in the stylesheet should be a
  deliberate one-off, not a rung you retyped. In inline SVG, style from CSS —
  `var()` does not work in presentation attributes.
- Reserve mono for metadata. Refs, keys, eras, captions, labels — never body copy.
- Follow the heading-hierarchy contract when adding a route, and widen an existing
  selector (`.foo h2, .foo h3`) rather than forking a component to change its level.
- Keep content reachable without JS. Add `data-cal` for the reveal; never rely on it.
- Honour `prefers-reduced-motion` for anything new that moves, and use `--ease`.
- Cap the measure on new text blocks — an uncapped paragraph reads as a bug here.

**Don't**

- Don't add a second accent colour. `--signal` / `--signal-deep` is the whole
  system; amber (`--trace`) belongs to connection lines alone.
- Don't add drop shadows to cards, panels, or modals. Use a border or a surface step.
- Don't introduce a CSS framework, utility classes, a build step for styles, or a
  second stylesheet. One hand-written file is a settled decision.
- Don't load fonts from a CDN. Geist and Geist Mono are self-hosted deliberately.
- Don't use pure black. The greys carry warm hue 60–75 — the one exception is
  `--line-dark`, a white alpha hairline (`oklch(1 0 0 / 0.12)`) that takes its colour
  from whatever sits beneath it.
- Don't hard-code hex where a token exists, and don't convert the OKLCH tokens to hex.
- Don't skip a heading level to get a size — set the level semantically and let the
  widened selector handle the size.

<!--
  Publication boundary: this file documents the visual system only. Audience,
  positioning, and commercial framing are deliberately absent — see docs/PRODUCT.md
  for the public-safe product context, and AGENTS.md §1 for what may never be
  added to this repo.
-->
