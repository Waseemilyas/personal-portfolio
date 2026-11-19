# Explore capabilities

On Home, scroll the capability map into view. Use hover, click and the keyboard to
select strands. Confirm the selected tab, trace, visible description and reading
link agree. From the selected tab, Tab reaches its panel and then its link, if
present. On a narrow screen use the full-title buttons and follow a case study.
With JavaScript disabled, verify all descriptions and links are visible and
follow a note.

## Capability map: fast source trace

| Question | Deciding owner | What it decides |
| --- | --- | --- |
| What content is available? | `src/_data/capabilities.json` | Capability titles, descriptions, related routes and connection data. |
| What reaches the page before JS? | `src/index.njk` → `#capability` | All five descriptions and any related links resolved from the published collections. |
| What changes selection? | `src/assets/js/site.js` → `setupCapabilityMap` | Switches the visible panel, highlights the trace and synchronises tab state across both layouts. |
| What supplies the accessible panel? | `src/index.njk` headings and controls + `setupCapabilityMap` | The selected tab identifies its panel, which is named by its heading and reachable with Tab. |
| What changes presentation? | `src/assets/css/styles.css` capability selectors | Selects the diagram or full-title buttons by figure width and lays out the static descriptions when the figure is hidden. |
| What is the verification boundary? | `.agents/skills/verify-portfolio/drive.py` via the feature-map skill | Drives visible nodes and keyboard paths and checks resulting state. It is headless: it does not prove physical touch or assistive technology. |

The helper uses actual visible inputs, never an internal activation function. Its headless pointer operations do not prove physical touch or assistive technology.
