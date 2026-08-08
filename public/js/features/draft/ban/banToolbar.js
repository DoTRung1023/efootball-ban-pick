/* ============================================================
   Ban phase toolbar — search, sort and the filter panel

   The filter panel itself is `playerFilters.js`, shared with the pick board;
   only the sort control is ban-specific, and only because the ban page keeps a
   pair of hidden `<select>`s as its source of truth.
   ============================================================ */

import { state } from "@/features/draft/state.js";
import { normalizeSortValue } from "@/features/draft/playerQuery.js";
import { renderDraftFilterPanel } from "@/features/draft/playerFilters.js";
import { renderSortPanel, sortCategoryLabel } from "@/features/draft/sortPanel.js";

export function renderBanToolbar() {
  const sortSelect = document.getElementById("banSort");
  const posSelect = document.getElementById("banPosition");
  const sortLabel = document.getElementById("banSortLabel");
  const sortPanel = document.getElementById("banSortPanel");
  const posPanel = document.getElementById("banPosPanel");
  const posDot = document.getElementById("banPosDot");
  const sortDirIcon = document.getElementById("banSortDirIcon");
  if (!sortSelect || !posSelect || !sortLabel || !sortPanel || !posPanel) return;

  const sortVal = normalizeSortValue(state.banSort);
  sortSelect.value = sortVal;
  posSelect.value = "";

  const dir = sortVal.endsWith("_asc") ? "asc" : "desc";
  const baseKey = sortVal.replace(/_(asc|desc)$/, "");
  sortLabel.textContent = sortCategoryLabel(baseKey);
  if (sortDirIcon) sortDirIcon.textContent = dir === "asc" ? "↑" : "↓";

  renderSortPanel(sortPanel, baseKey, "data-ban-sort-cat");
  renderDraftFilterPanel(posPanel, state, "ban", posDot);
}
