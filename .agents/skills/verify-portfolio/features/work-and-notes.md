# Read work and notes

Open Work, follow every case-study card and return to the list. Open Notes, follow
each article and return. Every case study and note ends with a "Next" card
(`.nextread`) leading to another published page of the same kind; the rendered
checker validates its internal target like any other link. All generated case studies and articles are included in
the two-width page coverage. Read the Atom feed and sitemap; the rendered checker
owns XML structure, internal targets and publication parity.

Every note and case study shows the email address before the next article. Check
its subject on both viewport widths, use the copy button by keyboard, and confirm
the manual copy control opens and the address is keyboard-accessible on a case
study with JavaScript disabled.

After the email, every note and case study has "Share this note" or "Share this
case study" with its canonical address. On a phone, Tab from "Copy address" to
"Copy link" and press Enter: Chromium on Linux has no share sheet, so the control
copies the address and announces "Link copied." (`phone-note-share.png`). The share
sheet, a closed sheet and a refused share are covered by `scripts/share-link.test.mjs`.
Notes also link the Atom feed, in the share section and under the Notes heading.

## Draft publication: fast source trace

**Rule:** `draft: true` must suppress the post page and remove the post from Notes, feed and sitemap. Draft source stays in the repository; public copy and design are unchanged.

| Question | Deciding owner | What it decides |
| --- | --- | --- |
| Is a post page written? | `src/notes/posts/posts.11tydata.js` → `eleventyComputed.permalink` | `false` for drafts; independent of collection membership. |
| Can a post enter a note collection? | `src/notes/posts/posts.11tydata.js` → `eleventyComputed.eleventyExcludeFromCollections`; also `eleventy.config.js` → `collections.notes` | Both reject drafts. The explicit collection is filtered and sorted newest first. |
| Which public outputs consume the collection? | `src/notes/index.njk` (`collections.notes`); `src/notes/feed.njk` (`collections.notes`); `src/sitemap.njk` (`collections.notes`) | Listing rows, Atom entries/updated timestamp, and note URLs. These do not each implement draft policy. |
| What changes publication? | Post front matter `draft`; the two owners above | Changing front matter affects effective directory data. Changing only the collection filter cannot enable page output; changing only permalink cannot remove a draft from collection consumers. Keep both collection guards aligned. |
| What happens to old output? | `eleventy.config.js` after a full build, and `scripts/site-check.mjs` | The build removes stale pages and empty route directories. The rendered check rejects draft pages and feed or sitemap references to drafts. |

**Fast entry:** read the directory data file, then the `collections.notes` definition in Eleventy config, then the three consumers. `src/_includes/note.njk` renders a selected post. Confirm a previously published note disappears on the next full build after it becomes a draft or is deleted.
