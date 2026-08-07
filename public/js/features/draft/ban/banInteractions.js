/* ============================================================
   Ban phase event wiring — bound once, then driven by state

   `bindBanPhaseUiOnce` is idempotent: the ban board re-renders on every
   presence poll, so handlers must not be re-attached per render.
   ============================================================ */

import { cb } from "@/features/draft/callbacks.js";
import { state } from "@/features/draft/state.js";
import { toValidPosition, normalizeSortValue } from "@/features/draft/playerQuery.js";
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
  pos.addEventListener("change", () => {
    // kept for compatibility; filtering is driven by state.banFilterPositions
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
    const v = `${cat}_${dir}`;
    sort.value = normalizeSortValue(v);
    sort.dispatchEvent(new Event("change", { bubbles: true }));
    closeAll();
  });

  // Helper: wire a multiselect sub-panel inside posPanel
  function bindBanMs(btnId, panelId, getState, setState, normalize) {
    posPanel?.addEventListener("click", (e) => {
      if (!(e.target instanceof Element)) return;
      const btn = e.target.closest(`#${btnId}`);
      const panel = document.getElementById(panelId);
      const panelBtn = document.getElementById(btnId);
      if (btn && panel && panelBtn) {
        const open = !panel.classList.contains("open");
        panel.classList.toggle("open", open);
        panelBtn.classList.toggle("open", open);
        e.stopPropagation();
      }
    });
  }

  posPanel?.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const clear = e.target.closest("#banClearFiltersBtn");
    if (clear) {
      state.banFilterPositions = [];
      state.banFilterFoot = [];
      state.banFilterPlayingStyle = [];
      state.banFilterCardType = [];
      state.banFilterLeague = [];
      state.banFilterRegion = [];
      state.banFilterOverallMin = "";
      state.banFilterOverallMax = "";
      state.banFilterOverallMaxMin = "";
      state.banFilterOverallMaxMax = "";
      state.banFilterClub = "";
      state.banFilterNation = "";
      state.banFilterHeightMin = "";
      state.banFilterHeightMax = "";
      state.banFilterWeightMin = "";
      state.banFilterWeightMax = "";
      state.banFilterAgeMin = "";
      state.banFilterAgeMax = "";
      cb.renderDraftUi();
      return;
    }

    // Multiselect item clicks
    const msConfigs = [
      { attr: "ban-pos-ms",  stateKey: "banFilterPositions",   normalize: toValidPosition },
      { attr: "ban-foot-ms", stateKey: "banFilterFoot",         normalize: (v) => v },
      { attr: "ban-ps-ms",   stateKey: "banFilterPlayingStyle", normalize: (v) => v },
      { attr: "ban-ct-ms",   stateKey: "banFilterCardType",     normalize: (v) => v },
      { attr: "ban-lg-ms",   stateKey: "banFilterLeague",       normalize: (v) => v },
      { attr: "ban-rg-ms",   stateKey: "banFilterRegion",       normalize: (v) => v },
    ];
    for (const cfg of msConfigs) {
      const item = e.target.closest(`[data-${cfg.attr}]`);
      if (item) {
        const raw = item.getAttribute(`data-${cfg.attr}`) || "";
        const v = cfg.normalize(raw);
        if (!v) return;
        const cur = new Set((Array.isArray(state[cfg.stateKey]) ? state[cfg.stateKey] : []).map(cfg.normalize).filter(Boolean));
        cur.has(v) ? cur.delete(v) : cur.add(v);
        state[cfg.stateKey] = [...cur];
        cb.renderDraftUi();
        return;
      }
    }

    // Toggle sub-panel open/close
    const subBtns = ["banPosMsBtn", "banFootMsBtn", "banPsMsBtn", "banCtMsBtn", "banLgMsBtn", "banRgMsBtn"];
    for (const btnId of subBtns) {
      const btn = e.target.closest(`#${btnId}`);
      if (btn) {
        const panelId = btnId.replace("Btn", "Panel");
        const panel = document.getElementById(panelId);
        if (panel) {
          const open = !panel.classList.contains("open");
          panel.classList.toggle("open", open);
          btn.classList.toggle("open", open);
        }
        e.stopPropagation();
        return;
      }
    }
  });

  // Range + text inputs inside posPanel (use input event delegation)
  posPanel?.addEventListener("input", (e) => {
    if (!(e.target instanceof Element)) return;
    const id = e.target.id;
    const v = e.target.value;
    if (id === "banFcOvrMin")   { state.banFilterOverallMin = v; cb.renderDraftUi(); }
    else if (id === "banFcOvrMax")   { state.banFilterOverallMax = v; cb.renderDraftUi(); }
    else if (id === "banFcOvrMxMin") { state.banFilterOverallMaxMin = v; cb.renderDraftUi(); }
    else if (id === "banFcOvrMxMax") { state.banFilterOverallMaxMax = v; cb.renderDraftUi(); }
    else if (id === "banFcClub")     { state.banFilterClub = v; cb.renderDraftUi(); }
    else if (id === "banFcNation")   { state.banFilterNation = v; cb.renderDraftUi(); }
    else if (id === "banFcHtMin")    { state.banFilterHeightMin = v; cb.renderDraftUi(); }
    else if (id === "banFcHtMax")    { state.banFilterHeightMax = v; cb.renderDraftUi(); }
    else if (id === "banFcWtMin")    { state.banFilterWeightMin = v; cb.renderDraftUi(); }
    else if (id === "banFcWtMax")    { state.banFilterWeightMax = v; cb.renderDraftUi(); }
    else if (id === "banFcAgeMin")   { state.banFilterAgeMin = v; cb.renderDraftUi(); }
    else if (id === "banFcAgeMax")   { state.banFilterAgeMax = v; cb.renderDraftUi(); }
  });

  void bindBanMs;
}

// Toggle showing player footer info in ban grid
export function initBanGridInfoToggle() {
  try {
    const btn = document.getElementById("toggleInfoBtn");
    const grid = document.getElementById("banGrid");
    if (!btn || !grid) return;
    // initialize from saved pref if desired (localStorage)
    const key = "banGridInfoHidden";
    const hidden = localStorage.getItem(key) === "1";
    if (hidden) grid.classList.add("info-hidden");
    btn.setAttribute("aria-pressed", hidden ? "true" : "false");
    // reflect label + visual state like home toolbar
    const setBtnState = (isHidden) => {
      btn.textContent = isHidden ? "SHOW INFO" : "HIDE INFO";
      if (isHidden) btn.classList.add("is-off"); else btn.classList.remove("is-off");
    };
    setBtnState(hidden);

    btn.addEventListener("click", () => {
      const isHidden = grid.classList.toggle("info-hidden");
      btn.setAttribute("aria-pressed", isHidden ? "true" : "false");
      setBtnState(isHidden);
      localStorage.setItem(key, isHidden ? "1" : "0");
    });
  } catch (e) {
    console.error("initBanGridInfoToggle error", e);
  }
}

// Run ban grid info toggle init after DOM content loaded
document.addEventListener("DOMContentLoaded", () => {
  initBanGridInfoToggle();
});
