# Use mobile navigation

At phone width, the initially closed drawer is a closed popover and hidden. Click
the toggle; expanded state becomes true and the popover opens. Press Escape; it
closes and focus returns to the toggle. Open again and select About; the route
changes and the destination's drawer is closed. Resize to desktop and check the
links are a visible row, not inert or aria-hidden.

The markup (`popover`, `popovertarget`) owns opening and closing; `setupNavigation`
mirrors `aria-expanded`, closes on a link or widening, and drives the fallback for a
browser without popovers (`setDrawer`, covered in jsdom by
`scripts/nav-drawer.test.mjs`). The stylesheet owns visibility and its matching
breakpoint. The helper starts a fresh browser with author scripts disabled: the
toggle carries no `aria-expanded`, and the drawer opens, closes on Escape and
follows a link. Footer links and static capability text are checked there too.
