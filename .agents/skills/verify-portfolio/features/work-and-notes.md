# Read work and notes

Open Work, follow every case-study card and return to the list. Open Notes, follow
each article and return. Every case study and note ends with a "Next" card
(`.nextread`) leading to another published page of the same kind; the rendered
checker validates its internal target like any other link. All generated case studies and articles are included in
the two-width page coverage. Read the Atom feed and sitemap; the rendered checker
owns XML structure, internal targets and publication parity.

## Draft publication: fast source trace

**Rule:** `draft: true` must suppress the post page and remove the post from Notes, feed and sitemap. Draft source stays in the repository; public copy and design are unchanged.

| Question | Deciding owner | What it decides |
| --- | --- | --- |
| Is a post page written? | `src/notes/posts/posts.11tydata.js` → `eleventyComputed.permalink` | `false` for drafts; independent of collection membership. |
| Can a post enter a note collection? | `src/notes/posts/posts.11tydata.js` → `eleventyComputed.eleventyExcludeFromCollections`; also `eleventy.config.js` → `collections.notes` | Both reject drafts. The explicit collection is filtered and sorted newest first. |
| Which public outputs consume the collection? | `src/notes/index.njk` (`collections.notes`); `src/notes/feed.njk` (`collections.notes`); `src/sitemap.njk` (`collections.notes`) | Listing rows, Atom entries/updated timestamp, and note URLs. These do not each implement draft policy. |
| What changes publication? | Post front matter `draft`; the two owners above | Changing front matter affects effective directory data. Changing only the collection filter cannot enable page output; changing only permalink cannot remove a draft from collection consumers. Keep both collection guards aligned. |
| What is the fallback/proof? | `package.json` clean build; `scripts/site-check.mjs` draft checks | Clean output avoids stale pages; rendered check rejects draft page, feed and sitemap leaks. It does not approve content or replace collection ownership. |

**Fast entry:** read the directory data file, then the `collections.notes` definition in Eleventy config, then the three consumers. `src/_includes/note.njk` renders a selected post; it does not decide publication. Drafts are not a security boundary against arbitrary Eleventy overrides. A reused dirty output directory is not a clean publication proof.
