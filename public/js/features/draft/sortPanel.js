/* ============================================================
   The draft sort dropdown — one table, both phases

   Ban and pick offer the same nine sort categories in the same order, and
   render the same panel; only the `data-` attribute the click handler reads
   differs. The table below is the single source of truth for all three
   things that used to be written out separately per phase:

     - the option list in each panel
     - the label shown on the collapsed button (`short` where the pick
       toolbar is too narrow for the full wording)
     - the set of values `normalizeSortValue` accepts (playerQuery.js)

   `key` is the base key; the actual sort value carries a `_asc` / `_desc`
   suffix. This is the room's own list — the home page has a richer one in
   `@/shared/players/sort.js` with per-direction API values and tooltips.
   ============================================================ */

import { escapeHtml } from "./utils.js";

export const DRAFT_SORT_CATEGORIES = [
  { key: "overall_max", label: "Overall Max",     short: "OVR MAX" },
  { key: "overall",     label: "Overall Level 1", short: "OVR Lvl 1" },
  { key: "name",        label: "Player Name",     short: "Name" },
  { key: "position",    label: "Position" },
  { key: "club",        label: "Club" },
  { key: "nationality", label: "Nationality" },
  { key: "height",      label: "Height" },
  { key: "weight",      label: "Weight" },
  { key: "age",         label: "Age" },
];

/**
 * Button label for a base sort key. Unknown keys fall back to the first
 * category, which is also what `normalizeSortValue` falls back to.
 */
export function sortCategoryLabel(key, { short = false } = {}) {
  const cat = DRAFT_SORT_CATEGORIES.find((c) => c.key === key) || DRAFT_SORT_CATEGORIES[0];
  return short ? cat.short || cat.label : cat.label;
}

/**
 * Fills a sort panel. `dataAttr` is the attribute the phase's click handler
 * delegates on — `data-ban-sort-cat` or `data-pick-sort-cat`. The open panel
 * always spells the category out; only the collapsed button abbreviates.
 */
export function renderSortPanel(panel, activeKey, dataAttr) {
  if (!panel) return;
  panel.innerHTML = DRAFT_SORT_CATEGORIES.map((c) => {
    const active = c.key === activeKey ? " active" : "";
    return `<div class="sort-option${active}" ${dataAttr}="${escapeHtml(c.key)}"><span>${escapeHtml(c.label)}</span><span class="sort-check">✓</span></div>`;
  }).join("");
}
