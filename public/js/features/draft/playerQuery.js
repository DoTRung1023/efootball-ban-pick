/* ============================================================
   Searching, filtering and sorting the draft player lists

   Both phases read from here: `getBanListPlayers` drives the ban grid and
   `getPickListPlayers` the pick board. Those two names keep their phase
   prefix because they really are per-phase — they read different state and
   apply different filters. Everything else here is phase-neutral and named
   that way.

   `toValidPosition` coerces a *single* value to a valid position or "". Do
   not confuse it with `normalizePositionValue` in allowance.js, which takes a
   comma-separated list and returns an array.
   ============================================================ */

import { state } from "./state.js";
import { POSITION_OPTIONS } from "./constants.js";
import { getPlayerCardValue } from "./players.js";
import { DRAFT_SORT_CATEGORIES } from "./sortPanel.js";

/* Every category, both directions. Derived from the one table the sort
   dropdown is built from, so a category cannot be offered and then rejected. */
const VALID_SORT_VALUES = new Set(
  DRAFT_SORT_CATEGORIES.flatMap((c) => [`${c.key}_desc`, `${c.key}_asc`]),
);
const DEFAULT_SORT_VALUE = `${DRAFT_SORT_CATEGORIES[0].key}_desc`;

export function normalizeSortValue(raw) {
  const v = String(raw || "").trim();
  return VALID_SORT_VALUES.has(v) ? v : DEFAULT_SORT_VALUE;
}

export function toValidPosition(raw) {
  const v = String(raw || "").trim().toUpperCase();
  return POSITION_OPTIONS.includes(v) ? v : "";
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
  const clubA = String(a?._raw?.club ?? a?.club ?? "");
  const clubB = String(b?._raw?.club ?? b?.club ?? "");
  const nationA = String(a?._raw?.nationality ?? a?.nationality ?? a?.nation ?? "");
  const nationB = String(b?._raw?.nationality ?? b?.nationality ?? b?.nation ?? "");

  let cmp = 0;
  if (baseKey === "overall") cmp = overallA - overallB || sa.localeCompare(sb);
  else if (baseKey === "name") cmp = sb.localeCompare(sa) || overallMaxB - overallMaxA;
  else if (baseKey === "position") cmp = posA.localeCompare(posB) || overallMaxB - overallMaxA;
  else if (baseKey === "height") cmp = heightA - heightB || overallMaxB - overallMaxA;
  else if (baseKey === "weight") cmp = weightA - weightB || overallMaxB - overallMaxA;
  else if (baseKey === "age") cmp = ageA - ageB || overallMaxB - overallMaxA;
  else if (baseKey === "club") cmp = clubA.localeCompare(clubB) || overallMaxB - overallMaxA;
  else if (baseKey === "nationality") cmp = nationA.localeCompare(nationB) || overallMaxB - overallMaxA;
  else cmp = overallMaxA - overallMaxB || sa.localeCompare(sb);

  return dir === "asc" ? cmp : -cmp;
}

export function getBanListPlayers() {
  const base = Array.isArray(state.opponentBanPlayers) ? state.opponentBanPlayers : [];
  const q = String(state.banSearch || "").trim().toLowerCase();
  const sortKey = normalizeSortValue(state.banSort);
  const posSet = new Set((Array.isArray(state.banFilterPositions) ? state.banFilterPositions : []).map(toValidPosition).filter(Boolean));
  const footSet = new Set(Array.isArray(state.banFilterFoot) ? state.banFilterFoot : []);
  const psSet = new Set(Array.isArray(state.banFilterPlayingStyle) ? state.banFilterPlayingStyle : []);
  const ctSet = new Set(Array.isArray(state.banFilterCardType) ? state.banFilterCardType : []);
  const lgSet = new Set(Array.isArray(state.banFilterLeague) ? state.banFilterLeague : []);
  const rgSet = new Set(Array.isArray(state.banFilterRegion) ? state.banFilterRegion : []);
  const ovrMin = state.banFilterOverallMin !== "" ? Number(state.banFilterOverallMin) : null;
  const ovrMax = state.banFilterOverallMax !== "" ? Number(state.banFilterOverallMax) : null;
  const ovrMxMin = state.banFilterOverallMaxMin !== "" ? Number(state.banFilterOverallMaxMin) : null;
  const ovrMxMax = state.banFilterOverallMaxMax !== "" ? Number(state.banFilterOverallMaxMax) : null;
  const clubQ = String(state.banFilterClub || "").trim().toLowerCase();
  const nationQ = String(state.banFilterNation || "").trim().toLowerCase();
  const htMin = state.banFilterHeightMin !== "" ? Number(state.banFilterHeightMin) : null;
  const htMax = state.banFilterHeightMax !== "" ? Number(state.banFilterHeightMax) : null;
  const wtMin = state.banFilterWeightMin !== "" ? Number(state.banFilterWeightMin) : null;
  const wtMax = state.banFilterWeightMax !== "" ? Number(state.banFilterWeightMax) : null;
  const ageMin = state.banFilterAgeMin !== "" ? Number(state.banFilterAgeMin) : null;
  const ageMax = state.banFilterAgeMax !== "" ? Number(state.banFilterAgeMax) : null;

  let rows = base;
  if (q) rows = rows.filter((p) => String(p?.name || "").toLowerCase().includes(q));
  if (posSet.size) rows = rows.filter((p) => posSet.has(String(p?.position || "").toUpperCase()));
  if (footSet.size) rows = rows.filter((p) => footSet.has(String(p?.foot ?? p?._raw?.foot ?? "")));
  if (psSet.size) rows = rows.filter((p) => psSet.has(String(p?.playing_style ?? p?._raw?.playing_style ?? "")));
  if (ctSet.size) rows = rows.filter((p) => ctSet.has(String(p?.card_type ?? p?._raw?.card_type ?? "")));
  if (lgSet.size) rows = rows.filter((p) => lgSet.has(String(p?.league ?? p?._raw?.league ?? "")));
  if (rgSet.size) rows = rows.filter((p) => rgSet.has(String(p?.region ?? p?._raw?.region ?? "")));
  if (ovrMin !== null) rows = rows.filter((p) => { const v = Number(p?._raw?.overall ?? p?.overall_rating ?? 0); return !isNaN(v) && v >= ovrMin; });
  if (ovrMax !== null) rows = rows.filter((p) => { const v = Number(p?._raw?.overall ?? p?.overall_rating ?? 0); return !isNaN(v) && v <= ovrMax; });
  if (ovrMxMin !== null) rows = rows.filter((p) => { const v = Number(getPlayerCardValue(p)); return !isNaN(v) && v >= ovrMxMin; });
  if (ovrMxMax !== null) rows = rows.filter((p) => { const v = Number(getPlayerCardValue(p)); return !isNaN(v) && v <= ovrMxMax; });
  if (clubQ) rows = rows.filter((p) => String(p?.club ?? p?._raw?.club ?? "").toLowerCase().includes(clubQ));
  if (nationQ) rows = rows.filter((p) => String(p?.nationality ?? p?.nation ?? p?._raw?.nationality ?? "").toLowerCase().includes(nationQ));
  if (htMin !== null) rows = rows.filter((p) => { const v = Number(p?.height ?? p?._raw?.height ?? 0); return !isNaN(v) && v >= htMin; });
  if (htMax !== null) rows = rows.filter((p) => { const v = Number(p?.height ?? p?._raw?.height ?? 0); return !isNaN(v) && v <= htMax; });
  if (wtMin !== null) rows = rows.filter((p) => { const v = Number(p?.weight ?? p?._raw?.weight ?? 0); return !isNaN(v) && v >= wtMin; });
  if (wtMax !== null) rows = rows.filter((p) => { const v = Number(p?.weight ?? p?._raw?.weight ?? 0); return !isNaN(v) && v <= wtMax; });
  if (ageMin !== null) rows = rows.filter((p) => { const v = Number(p?.age ?? p?._raw?.age ?? 0); return !isNaN(v) && v >= ageMin; });
  if (ageMax !== null) rows = rows.filter((p) => { const v = Number(p?.age ?? p?._raw?.age ?? 0); return !isNaN(v) && v <= ageMax; });
  return [...rows].sort((a, b) => comparePlayersBySort(a, b, sortKey));
}

export function getPickListPlayers() {
  const base = Array.isArray(state.players) ? state.players : [];
  const q = String(state.pickSearch || "").trim().toLowerCase();
  const sortKey = normalizeSortValue(state.pickSort);
  const posSet = new Set((Array.isArray(state.pickFilterPosition) ? state.pickFilterPosition : []).map(toValidPosition).filter(Boolean));
  let rows = base;
  if (q) rows = rows.filter((p) => String(p?.name || "").toLowerCase().includes(q));
  if (posSet.size) rows = rows.filter((p) => posSet.has(String(p?.position || p?._raw?.position || "").toUpperCase()));
  return [...rows].sort((a, b) => comparePlayersBySort(a, b, sortKey));
}
