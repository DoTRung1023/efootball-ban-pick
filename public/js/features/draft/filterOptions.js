/* ============================================================
   Filter option lists, fetched once from the catalog

   `constants.js` declares the option arrays; this fills the league list from
   /api/players/filter-options at runtime. The lobby needs it for the allowance
   pickers and the ban toolbar needs it for its league filter, so it sits at the
   draft root rather than inside ban/.
   ============================================================ */

import {
  CARD_TYPE_OPTIONS,
  PLAYING_STYLE_OPTIONS,
  REGION_OPTIONS,
} from "./constants.js";

export let LEAGUE_OPTIONS = [];

export async function fetchFilterOptions() {
  try {
    const res = await fetch("/api/players/filter-options");
    if (res.ok) {
      const data = await res.json();
      CARD_TYPE_OPTIONS.length = 0;
      (data.card_type || []).forEach((v) => CARD_TYPE_OPTIONS.push(v));
      PLAYING_STYLE_OPTIONS.length = 0;
      (data.playing_style || []).forEach((v) => PLAYING_STYLE_OPTIONS.push(v));
      LEAGUE_OPTIONS.length = 0;
      (data.league || []).forEach((v) => LEAGUE_OPTIONS.push(v));
      REGION_OPTIONS.length = 0;
      (data.region || []).forEach((v) => REGION_OPTIONS.push(v));
    }
  } catch (err) {
    console.warn("Could not fetch filter options:", err);
  }
}
