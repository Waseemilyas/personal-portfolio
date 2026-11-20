# Visitor feature map

| Journey | Surface | Deciding owner |
| --- | --- | --- |
| [Read and navigate](reading.md) | Main pages and not-found page | `src/_includes/base.njk`, `src/_data/site.json`, page templates |
| [Read work and notes](work-and-notes.md) | Work cards, case studies, Notes, articles, Atom feed | `eleventy.config.js`, `src/work/`, `src/notes/` |
| [Explore capabilities](capabilities.md) | Home capability map | `setupCapabilityMap`, capability data and index template |
| [Use mobile navigation](navigation.md) | Header toggle with and without JS, Escape, links, responsive state | Header popover markup in `base.njk`, `setupNavigation`, header CSS |
| [Read with reduced motion](motion.md) | Entry reveals and static content | `setupReveals`, reduced-motion CSS |
| [Contact and linked assets](links-and-assets.md) | Contact links, sitemap, intentional audio URLs | Contact/base templates, passthrough config |

## Fast traces for source changes

- **Draft publication:** start at [`work-and-notes.md`](work-and-notes.md#draft-publication-fast-source-trace): directory data decides page output and collection exclusion; Eleventy config decides explicit note collection membership; Notes, feed and sitemap consume that collection. The page, collection and rendered-check fallback are distinct.
- **Capability content/events/fallback:** start at [`capabilities.md`](capabilities.md#capability-map-fast-source-trace): JSON authors content → `src/index.njk` renders every description and related link → `setupCapabilityMap` adds selection → CSS presents it.

The helper discovers built HTML files from `_site/` and checks each at both widths.
This avoids maintaining a second route inventory. New interactions need an actual
Drive step and resulting-state proof here; a page screenshot alone does not exercise them.
