/* ============================================================
   The draft sort dropdown — one table, every page

   Ban and pick render the same panel; only the `data-` attribute the click
   handler reads differs.

   The categories themselves come from `@/shared/players/sort.js`, the same
   table behind My Players, the Game Plans picker and Add Player. The room used
   to keep its own copy, and the copies drifted: the room listed Club and
   Nationality fourth and fifth, between Position and Height, while every other
   page put them last after the physical measurements. Same nine categories,
   two different orders, depending on which page you were looking at.

   `key` is the base key; the actual sort value carries a `_asc` / `_desc`
   suffix. The shared table's `descVal` / `ascVal` / tooltip fields are for the
   home page's two-part control and are simply unused here.
   ============================================================ */

import { SORT_CATEGORIES } from "@/shared/players/sort.js";
import { escapeHtml } from "./utils.js";

/**
 * Button label for a base sort key. Unknown keys fall back to the first
 * category, which is also what `normalizeSortValue` falls back to.
 *
 * Spelled out in full on every page. The pick toolbar used to abbreviate
 * ("OVR MAX", "OVR Lvl 1", "Name") on the grounds that it was too narrow —
 * measured at every breakpoint down to 320 px, it is not.
 */
export function sortCategoryLabel(key) {
  const cat = SORT_CATEGORIES.find((c) => c.key === key) || SORT_CATEGORIES[0];
  return cat.label;
}

/** The check mark used by every sort panel in the app. */
const CHECK_SVG =
  `<svg class="sort-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;

/**
 * Fills a sort panel. `dataAttr` is the attribute the phase's click handler
 * delegates on — `data-ban-sort-cat` or `data-pick-sort-cat`.
 */
export function renderSortPanel(panel, activeKey, dataAttr) {
  if (!panel) return;
  panel.innerHTML = SORT_CATEGORIES.map((c) => {
    const active = c.key === activeKey ? " active" : "";
    return `<div class="sort-option${active}" ${dataAttr}="${escapeHtml(c.key)}"><span>${escapeHtml(c.label)}</span>${CHECK_SVG}</div>`;
  }).join("");
}
