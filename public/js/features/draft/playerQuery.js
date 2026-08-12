/* ============================================================
   Searching, filtering and sorting the draft player lists

   Both phases read from here: `getBanListPlayers` drives the ban grid and
   `getPickListPlayers` the pick board. Those two names keep their phase prefix
   because they really are per-phase — they read from different arrays and pass a
   different prefix. The filtering itself is identical for both and lives in
   `playerFilters.js`; only the source list and the search field differ.

   `toValidPosition` moved to `playerFilters.js` alongside the field tables that
   use it. Import it from there.
   ============================================================ */

import { state } from "./state.js";
import { getPlayerCardValue } from "./players.js";
import { SORT_CATEGORIES } from "@/shared/players/sort.js";
import { applyDraftFilters } from "./playerFilters.js";

/* Every category, both directions. Derived from the one table the sort
   dropdown is built from, so a category cannot be offered and then rejected. */
const VALID_SORT_VALUES = new Set(
  SORT_CATEGORIES.flatMap((c) => [`${c.key}_desc`, `${c.key}_asc`]),
);
const DEFAULT_SORT_VALUE = `${SORT_CATEGORIES[0].key}_desc`;

export function normalizeSortValue(raw) {
  const v = String(raw || "").trim();
  return VALID_SORT_VALUES.has(v) ? v : DEFAULT_SORT_VALUE;
}

/** Internal — the shared comparator behind both list getters. */
function comparePlayersBySort(a, b, sortKey) {
  const sa = String(a?.name || "");
  const sb = String(b?.name || "");
  const key = String(sortKey || "overall_max_desc");
  const dir = key.endsWith("_asc") ? "asc" : "desc";
  const baseKey = key.replace(/_(asc|desc)$/, "");
  const overallMaxA = Number(getPlayerCardValue(a)) || 0;
  const overallMaxB = Number(getPlayerCardValue(b)) || 0;
  const overallA = Number(a?._raw?.overall ?? a?.overall_rating ?? 0) || 0;
  const overallB = Number(b?._raw?.overall ?? b?.overall_rating ?? 0) || 0;
  const posA = String(a?.position || "");
  const posB = String(b?.position || "");
  const heightA = Number(a?._raw?.height ?? a?.height ?? 0) || 0;
  const heightB = Number(b?._raw?.height ?? b?.height ?? 0) || 0;
  const weightA = Number(a?._raw?.weight ?? a?.weight ?? 0) || 0;
  const weightB = Number(b?._raw?.weight ?? b?.weight ?? 0) || 0;
  const ageA = Number(a?._raw?.age ?? a?.age ?? 0) || 0;
  const ageB = Number(b?._raw?.age ?? b?.age ?? 0) || 0;

  let cmp = 0;
  if (baseKey === "overall") cmp = overallA - overallB || sa.localeCompare(sb);
  else if (baseKey === "name") cmp = sb.localeCompare(sa) || overallMaxB - overallMaxA;
  else if (baseKey === "position") cmp = posA.localeCompare(posB) || overallMaxB - overallMaxA;
  else if (baseKey === "height") cmp = heightA - heightB || overallMaxB - overallMaxA;
  else if (baseKey === "weight") cmp = weightA - weightB || overallMaxB - overallMaxA;
  else if (baseKey === "age") cmp = ageA - ageB || overallMaxB - overallMaxA;
  else cmp = overallMaxA - overallMaxB || sa.localeCompare(sb);

  return dir === "asc" ? cmp : -cmp;
}

/** Internal — search + the shared 18-field filter + sort, for one phase. */
function queryPlayers(base, { search, sort, prefix }) {
  const q = String(search || "").trim().toLowerCase();
  const rows = q
    ? base.filter((p) => String(p?.name || "").toLowerCase().includes(q))
    : base;
  return [...applyDraftFilters(rows, state, prefix)]
    .sort((a, b) => comparePlayersBySort(a, b, normalizeSortValue(sort)));
}

/** The opponent's squad, which is what you ban from. */
export function getBanListPlayers() {
  return queryPlayers(Array.isArray(state.opponentBanPlayers) ? state.opponentBanPlayers : [], {
    search: state.banSearch,
    sort: state.banSort,
    prefix: "ban",
  });
}

/** Your own squad, which is what you pick from. */
export function getPickListPlayers() {
  return queryPlayers(Array.isArray(state.players) ? state.players : [], {
    search: state.pickSearch,
    sort: state.pickSort,
    prefix: "pick",
  });
}
