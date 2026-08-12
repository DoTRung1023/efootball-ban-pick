/* ============================================================
   Player sorting — the toolbar categories and the comparators

   `SORT_CATEGORIES` drives **every** sort dropdown in the app — My Players, the
   catalog toolbar, the plan picker, and the room's ban and pick boards, which
   read it through `features/draft/sortPanel.js`. One table, so the five cannot
   drift into different orders again.

   `descVal` / `ascVal` are the `sortBy` values the API accepts (see `SORT_MAP`
   in `src/features/players/catalogQuery.js`). The server still maps
   `club_*` / `nationality_*`; the seven below are simply what the UI offers.
   ============================================================ */

import { positionLineRank } from "./positions.js";

export const SORT_CATEGORIES = [
  { key: "overall_max", label: "Overall Max",       descVal: "overall_max_desc", ascVal: "overall_max_asc", bidir: true,  descTip: "Highest max rating first", ascTip: "Lowest max rating first" },
  { key: "overall",     label: "Overall Level 1",   descVal: "overall_desc",     ascVal: "overall_asc",     bidir: true,  descTip: "Highest Level 1 first",    ascTip: "Lowest Level 1 first"    },
  { key: "name",        label: "Player Name",    descVal: "name_asc",        ascVal: "name_desc",       bidir: true,  descTip: "A → Z",                 ascTip: "Z → A"                 },
  { key: "position",    label: "Position",       descVal: "position_asc",    ascVal: "position_desc",   bidir: true,  descTip: "CF → SS → … → GK",     ascTip: "GK → … → SS → CF"       },
  { key: "height",      label: "Height",         descVal: "height_desc",     ascVal: "height_asc",      bidir: true,  descTip: "Tallest first",          ascTip: "Shortest first"        },
  { key: "weight",      label: "Weight",         descVal: "weight_desc",     ascVal: "weight_asc",      bidir: true,  descTip: "Heaviest first",         ascTip: "Lightest first"        },
  { key: "age",         label: "Age",            descVal: "age_desc",        ascVal: "age_asc",         bidir: true,  descTip: "Oldest first",           ascTip: "Youngest first"        },
];

/** When the primary sort key ties, order by overall (highest first), then name. */
export function tiebreakOverallDescThenName(a, b) {
  const oa = Number(a.overall ?? -1);
  const ob = Number(b.overall ?? -1);
  if (ob !== oa) return ob - oa;
  return (a.name || "").localeCompare(b.name || "");
}

/** Max OVR for sorting; falls back to level-1 overall when max is unknown. */
export function ovrMaxForSort(p) {
  const mx = p?.overall_max;
  if (mx != null && Number.isFinite(Number(mx))) return Number(mx);
  if (p?.overall != null && Number.isFinite(Number(p.overall))) return Number(p.overall);
  return -1;
}

/** When overall rating ties: line order CF→…→GK, then name. */
export function tiebreakPositionLineThenName(a, b) {
  const ra = positionLineRank(a.position);
  const rb = positionLineRank(b.position);
  if (ra !== rb) return ra - rb;
  return (a.name || "").localeCompare(b.name || "");
}

export function compareByPositionLine(a, b, forwardCfToGk) {
  const ra = positionLineRank(a.position);
  const rb = positionLineRank(b.position);
  if (ra !== rb) return forwardCfToGk ? ra - rb : rb - ra;
  return tiebreakOverallDescThenName(a, b);
}
