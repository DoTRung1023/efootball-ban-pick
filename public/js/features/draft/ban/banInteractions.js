/* ============================================================
   Ban phase event wiring — bound once, then driven by state

   `bindBanPhaseUiOnce` is idempotent: the ban board re-renders on every
   presence poll, so handlers must not be re-attached per render.

   Everything inside the FILTER panel is handled by `bindDraftFilterPanel`,
   shared with the pick board.
   ============================================================ */

import { cb } from "@/features/draft/callbacks.js";
import { state } from "@/features/draft/state.js";
import { normalizeSortValue } from "@/features/draft/playerQuery.js";
import { bindDraftFilterPanel } from "@/features/draft/playerFilters.js";
import { bindGridInfoToggle } from "@/features/draft/shell/cardGrid.js";
import { renderBanToolbar } from "./banToolbar.js";

export function bindBanPhaseUiOnce() {
  if (state.banUiBound) return;
  const search = document.getElementById("banSearch");
  const sort = document.getElementById("banSort");
  const pos = document.getElementById("banPosition");
  const sortBtn = document.getElementById("banSortBtn");
  const sortWrap = document.getElementById("banSortWrap");
  const sortPanel = document.getElementById("banSortPanel");
  const sortDirBtn = document.getElementById("banSortDirBtn");
  const posBtn = document.getElementById("banPosBtn");
  const posWrap = document.getElementById("banPosWrap");
  const posPanel = document.getElementById("banPosPanel");
  if (!search || !sort || !pos) return;
  state.banUiBound = true;

  search.addEventListener("input", (e) => {
    state.banSearch = String(e.target.value || "");
    cb.renderDraftUi();
  });
  sort.addEventListener("change", (e) => {
    state.banSort = normalizeSortValue(e.target.value);
    cb.renderDraftUi();
  });

  const closeAll = () => {
    sortBtn?.classList.remove("open");
    posBtn?.classList.remove("open");
    sortPanel?.classList.remove("open");
    posPanel?.classList.remove("open");
    sortBtn?.setAttribute("aria-expanded", "false");
    posBtn?.setAttribute("aria-expanded", "false");
  };

  document.addEventListener("click", (e) => {
    const t = e.target;
    const insideSort = sortWrap && t instanceof Element ? Boolean(t.closest("#banSortWrap")) : false;
    const insidePos = posWrap && t instanceof Element ? Boolean(t.closest("#banPosWrap")) : false;
    if (!insideSort && !insidePos) closeAll();
  });

  sortBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const open = !Boolean(sortPanel?.classList.contains("open"));
    closeAll();
    if (open) {
      renderBanToolbar();
      sortBtn.classList.add("open");
      sortPanel?.classList.add("open");
      sortBtn.setAttribute("aria-expanded", "true");
    }
  });

  sortDirBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const cur = normalizeSortValue(state.banSort);
    const baseKey = cur.replace(/_(asc|desc)$/, "");
    const next = cur.endsWith("_asc") ? `${baseKey}_desc` : `${baseKey}_asc`;
    sort.value = normalizeSortValue(next);
    sort.dispatchEvent(new Event("change", { bubbles: true }));
  });

  posBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const open = !Boolean(posPanel?.classList.contains("open"));
    closeAll();
    if (open) {
      renderBanToolbar();
      posBtn.classList.add("open");
      posPanel?.classList.add("open");
      posBtn.setAttribute("aria-expanded", "true");
    }
  });

  sortPanel?.addEventListener("click", (e) => {
    const opt = e.target instanceof Element ? e.target.closest("[data-ban-sort-cat]") : null;
    if (!opt) return;
    const cat = String(opt.getAttribute("data-ban-sort-cat") || "");
    const cur = normalizeSortValue(state.banSort);
    const dir = cur.endsWith("_asc") ? "asc" : "desc";
    sort.value = normalizeSortValue(`${cat}_${dir}`);
    sort.dispatchEvent(new Event("change", { bubbles: true }));
    closeAll();
  });

  bindDraftFilterPanel(posPanel, state, "ban", () => cb.renderDraftUi());
  bindGridInfoToggle("toggleInfoBtn", "banGrid", "banGridInfoHidden");
}
