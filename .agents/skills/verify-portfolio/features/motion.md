# Read with reduced motion

On a direct visit with default motion, Home, Work and Notes must show their main
headings from first paint. The walk checks that no heading or ancestor has an
entry animation that starts at zero opacity.

Read the normal-motion captures after visible reveals settle. Then enable reduced
motion and reload Home. No block may be hidden (`.cal-wait`) or animating; every
`[data-cal]` element must be fully opaque. Content remains available with no JavaScript. Capture the reduced
motion result and compare legibility. This proves state and rendering, not frame
pacing or animation quality on a physical device.

A click from one page to another inside the site (the listing walk) must open the
article with its heading already in place: the root carries `.onsite` and the
heading's block runs no `rise` animation. Chromium and Safari 18.2+ also bridge the
two pages with a view transition (header still, title grows out of the clicked card);
the walk proves the state, not the frames.
