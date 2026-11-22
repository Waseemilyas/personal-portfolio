# Read and navigate

Reach the home page and use the primary links defined in `site.nav`. Click each
route and check its actual pathname. Read the main pages and the not-found page at
1440×900 and 390×844. Each must have a nonempty single page heading, the expected
revision and no horizontal overflow. Inspect the screenshots for readable text,
clipping and hierarchy. Shared layout and navigation data own the links; templates
own page content. Browser proof does not re-approve already published copy.

The not-found page recovers a broken link. The local helper answers a missing
address with `404.html`, as GitHub Pages does. Open `/Work/CS-Care)`: the page opens
`/work/cs-care/` by itself. Open a misspelt note address: the "CLOSEST" card offers
the right note and following it opens that note. With scripts disabled the card stays
hidden and the page lists every built page; following one opens it. The 404 head
script (`src/_includes/partials/not-found-redirect.njk`) opens exact matches before the
page paints; `setupNotFound` owns the closest-page offer (both covered by
`scripts/not-found.test.mjs`), `src/404.njk` the list.
