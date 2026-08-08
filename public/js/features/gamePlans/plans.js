import { escapeHtml, CARD_IMG, ANON_PLAYER_IMG, makePlayerImg,
         playerDetailSublineHtml } from '@/shared/players/playerMeta.js';
import { FORMATION_LAYOUTS, normalizeFormation,
         getFormationLayout } from '@/shared/players/formations.js';
import { SORT_CATEGORIES, tiebreakOverallDescThenName, ovrMaxForSort,
         tiebreakPositionLineThenName, compareByPositionLine } from '@/shared/players/sort.js';
import { buildPlayerFilterPanel, getPlayerFilterOptions } from '@/shared/players/filterPanel.js';
import { getUser } from '@/shared/lib/session.js';
import { showToast } from '@/shared/ui/toast.js';
import { showConfirm } from '@/shared/ui/confirm.js';
import { closeDdPanel, toggleDdPanel } from '@/shared/ui/dropdown.js';
import { cb } from '@/pages/home/callbacks.js';

const gamePlans = {
  plans:      [],
  currentId:  null,
  slots:      {},   // { slotNumber: { player_id, name, position, overall, club, pesdb_id } }
  activeSlot: null, // currently selected slot for assignment
  pickerPendingPlayerId: null, // squad player chosen first; click a slot to assign
  selectMode: false,
  selected:   new Set(),
  formation:  null,
};

/** The rows to render for whichever formation the open plan is on. */
function getPitchLayout() {
  return getFormationLayout(gamePlans.formation);
}

function closePlanFormationPanel() {
  const panel = document.getElementById("planFormationPanel");
  const btn   = document.getElementById("planFormationBtn");
  if (panel) {
    panel.classList.remove("open");
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
  }
  if (btn) {
    btn.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  }
}

function updatePlanFormationDropdownUI() {
  const label = document.getElementById("planFormationLabel");
  const f       = normalizeFormation(gamePlans.formation);
  if (label) label.textContent = f;
  document.querySelectorAll(".plan-formation-option").forEach((el) => {
    const active = el.dataset.formation === f;
    el.classList.toggle("active", active);
    el.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function initFormationDropdown(userId) {
  const wrap  = document.getElementById("planFormationWrap");
  const panel = document.getElementById("planFormationPanel");
  const btn   = document.getElementById("planFormationBtn");
  if (!wrap || !panel || !btn || wrap.dataset.inited === "1") return;
  wrap.dataset.inited = "1";

  const keys = Object.keys(FORMATION_LAYOUTS);
  panel.innerHTML = keys
    .map(
      (k) => `<button type="button" class="plan-formation-option" data-formation="${k}" role="option">
      <span class="plan-formation-opt-text">${k}</span>
      <svg class="plan-formation-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
    </button>`,
    )
    .join("");

  panel.querySelectorAll(".plan-formation-option").forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const v = el.dataset.formation;
      if (!v || v === gamePlans.formation) {
        closePlanFormationPanel();
        return;
      }
      const ok = await savePlanFormation(userId, v);
      if (ok) closePlanFormationPanel();
    });
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.classList.contains("open")) closePlanFormationPanel();
    else {
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
      panel.classList.add("open");
      btn.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
    }
  });
}

const ppState = {
  query:           "",
  sortCategory:    "overall_max",
  sortDir:         "desc",
  filterPositions: new Set(),
  filterFoot:          new Set(),
  filterPlayingStyle:  new Set(),
  filterCardType:      new Set(),
  filterLeague:        new Set(),
  filterRegion:        new Set(),
  filterClub:      "",
  filterNation:    "",
  filterOverallMin:     "", filterOverallMax:     "",
  filterMaxOverallMin:  "", filterMaxOverallMax:  "",
  filterHeightMin: "", filterHeightMax: "",
  filterWeightMin: "", filterWeightMax: "",
  filterAgeMin:    "", filterAgeMax:    "",
};

function resetPpState() {
  ppState.query         = "";
  ppState.sortCategory  = "overall_max";
  ppState.sortDir       = "desc";
  ppState.filterPositions.clear();
  ppState.filterFoot.clear();
  ppState.filterPlayingStyle.clear();
  ppState.filterCardType.clear();
  ppState.filterLeague.clear();
  ppState.filterRegion.clear();
  ppState.filterClub      = "";
  ppState.filterNation    = "";
  ppState.filterOverallMin = ppState.filterOverallMax = "";
  ppState.filterMaxOverallMin = ppState.filterMaxOverallMax = "";
  ppState.filterHeightMin = ppState.filterHeightMax = "";
  ppState.filterWeightMin = ppState.filterWeightMax = "";
  ppState.filterAgeMin    = ppState.filterAgeMax    = "";
}


export async function loadGamePlans(userId) {
  const grid = document.getElementById("plansGrid");
  if (!grid) return;
  grid.innerHTML = "";
  try {
    const res  = await fetch(`/api/game-plans?userId=${userId}`);
    const data = await res.json();
    gamePlans.plans = data.plans ?? [];
    renderPlansGrid(userId);
  } catch {
    showToast("Could not load game plans.", "error");
  }
}

function renderPlansGrid(userId) {
  const grid      = document.getElementById("plansGrid");
  const countEl   = document.getElementById("plansCount");
  const createBtn = document.getElementById("createPlanBtn");
  if (!grid) return;

  const count = gamePlans.plans.length;
  if (countEl)   countEl.textContent  = `${count} / 20 GAME PLANS`;
  if (createBtn) createBtn.disabled   = count >= 20;
  const selBtn = document.getElementById("planSelectModeBtn");
  if (selBtn) selBtn.disabled = count === 0;

  grid.innerHTML = "";

  if (!count) {
    grid.innerHTML = `
      <div class="plans-empty">
        <div class="plans-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
        </div>
        <h3>NO GAME PLANS YET</h3>
        <p>Click <strong>NEW PLAN</strong> to create your first game plan.</p>
      </div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  gamePlans.plans.forEach((plan) => {
    const card = document.createElement("div");
    card.className = "plan-card";
    card.dataset.planId = plan.id;

    card.innerHTML = `
      <div class="plan-checkbox"></div>
      <button class="plan-delete-btn" title="Delete plan" aria-label="Delete plan">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
      <div class="plan-name">${escapeHtml(plan.name)}</div>
      <div class="plan-formation-tag">${escapeHtml(normalizeFormation(plan.formation))}</div>
      <div class="plan-date">Created: ${new Date(plan.created_at).toLocaleDateString()}</div>`;

    card.querySelector(".plan-delete-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await showConfirm(`Delete "${plan.name}"?`);
      if (!ok) return;
      await deletePlan(userId, plan.id);
    });

    card.addEventListener("click", () => {
      if (gamePlans.selectMode) {
        if (gamePlans.selected.has(plan.id)) {
          gamePlans.selected.delete(plan.id);
          card.classList.remove("selected");
        } else {
          gamePlans.selected.add(plan.id);
          card.classList.add("selected");
        }
        updatePlanSelectionUI();
      } else {
        openPlanDetail(userId, plan);
      }
    });
    frag.appendChild(card);
  });
  grid.appendChild(frag);
}

async function createPlan(userId) {
  const createBtn = document.getElementById("createPlanBtn");
  if (createBtn) createBtn.disabled = true;
  try {
    const num  = gamePlans.plans.length + 1;
    const name = `Game Plan ${num}`;
    const res  = await fetch("/api/game-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, name }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Could not create plan.", "error"); return; }
    gamePlans.plans.push(data.plan);
    renderPlansGrid(userId);
    cb.refreshRoomsStats();
  } catch {
    showToast("Could not create plan.", "error");
  } finally {
    const btn = document.getElementById("createPlanBtn");
    if (btn) btn.disabled = gamePlans.plans.length >= 20;
  }
}

async function deletePlan(userId, planId) {
  try {
    const res = await fetch(`/api/game-plans/${planId}?userId=${userId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Could not delete plan.", "error");
      return;
    }
    gamePlans.plans = gamePlans.plans.filter((p) => p.id !== planId);
    renderPlansGrid(userId);
    showToast("Game plan deleted.", "success");
    cb.refreshRoomsStats();
  } catch {
    showToast("Could not delete plan.", "error");
  }
}

async function openPlanDetail(userId, plan) {
  const planId   = plan.id;
  const planName = plan.name;
  gamePlans.currentId  = planId;
  gamePlans.slots      = {};
  gamePlans.activeSlot = null;
  gamePlans.pickerPendingPlayerId = null;
  gamePlans.formation    = normalizeFormation(plan.formation);

  const overlay   = document.getElementById("planDetailOverlay");
  const nameInput = document.getElementById("planDetailName");
  if (!overlay) return;

  if (nameInput) {
    nameInput.value            = planName;
    nameInput.dataset.original = planName;
  }
  updatePlanFormationDropdownUI();

  // Reset picker state
  resetPpState();
  getPlayerFilterOptions();
  const ppSearch = document.getElementById("ppSearch");
  if (ppSearch) ppSearch.value = "";
  rebuildPpPanels();
  updatePpSortUI();
  updatePpFilterDot();
  setPickerHint(null);

  renderDetailSlots();
  renderPlanPicker();
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";

  try {
    const res  = await fetch(`/api/game-plans/${planId}/players?userId=${userId}`);
    const data = await res.json();
    gamePlans.slots = {};
    (data.players ?? []).forEach((p) => { gamePlans.slots[p.slot] = p; });
    renderDetailSlots();
    renderPlanPicker();
  } catch {
    showToast("Could not load plan players.", "error");
  }
}

function closePlanDetail() {
  closePlanFormationPanel();
  document.getElementById("planDetailOverlay")?.classList.remove("open");
  document.body.style.overflow = "";
  gamePlans.currentId  = null;
  gamePlans.activeSlot = null;
  gamePlans.pickerPendingPlayerId = null;
  gamePlans.formation  = null;
  closeDdPanel("ppSortPanel",   "ppSortBtn");
  closeDdPanel("ppFilterPanel", "ppFilterBtn");
}

function renderDetailSlots() {
  renderStartingXI();
  renderBench();
}

function renderStartingXI() {
  getPitchLayout().forEach(({ id, slots }) => {
    const row = document.getElementById(id);
    if (!row) return;
    row.innerHTML = "";
    slots.forEach((slot) => row.appendChild(makePitchSlotEl(slot, gamePlans.slots[slot] ?? null)));
  });
}

function renderBench() {
  const benchEl = document.getElementById("benchSlots");
  if (!benchEl) return;
  benchEl.innerHTML = "";
  for (let s = 12; s <= 23; s++) {
    benchEl.appendChild(makeBenchSlotEl(s, gamePlans.slots[s] ?? null));
  }
}

function makePitchSlotEl(slot, player) {
  const el = document.createElement("div");
  const isActive = gamePlans.activeSlot === slot;
  el.className  = `pitch-slot ${player ? "filled" : "empty"}${isActive ? " active" : ""}`;
  el.dataset.slot = slot;

  if (player) {
    const hasImg = !!player.pesdb_id;
    el.innerHTML = `
      <div class="pitch-card-wrap">
        <img class="pitch-card-img" src="${hasImg ? CARD_IMG(player.pesdb_id) : ANON_PLAYER_IMG}" loading="lazy"
             onerror="if(this.dataset.fallbackApplied==='1')return;this.dataset.fallbackApplied='1';this.src='${ANON_PLAYER_IMG}';" alt="" />
        <button class="pitch-remove-btn" title="Remove">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`;
    el.querySelector(".pitch-remove-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      removeFromSlot(slot);
    });
  } else {
    el.innerHTML = `
      <div class="pitch-slot-placeholder">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </div>`;
  }
  el.addEventListener("click", () => selectPlanSlot(slot));
  return el;
}

function makeBenchSlotEl(slot, player) {
  const el = document.createElement("div");
  const isActive = gamePlans.activeSlot === slot;
  el.className  = `bench-slot ${player ? "filled" : "empty"}${isActive ? " active" : ""}`;
  el.dataset.slot = slot;

  if (player) {
    const hasImg = !!player.pesdb_id;
    el.innerHTML = `
      <div class="pitch-card-wrap">
        <img class="pitch-card-img" src="${hasImg ? CARD_IMG(player.pesdb_id) : ANON_PLAYER_IMG}" loading="lazy"
             onerror="if(this.dataset.fallbackApplied==='1')return;this.dataset.fallbackApplied='1';this.src='${ANON_PLAYER_IMG}';" alt="" />
        <button class="pitch-remove-btn" title="Remove">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`;
    el.querySelector(".pitch-remove-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      removeFromSlot(slot);
    });
  } else {
    el.innerHTML = `
      <div class="pitch-slot-placeholder">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </div>`;
  }
  el.addEventListener("click", () => selectPlanSlot(slot));
  return el;
}

/* Below 900px the plan detail modal stacks its three columns into one scrolling
   sheet (see responsive.css), so the picker sits far below the pitch. Move the
   sheet to whichever section the user needs next instead of making them hunt. */
const STACKED_PLAN_LAYOUT = "(max-width: 900px)";

function scrollPlanSectionIntoView(selector) {
  if (!window.matchMedia(STACKED_PLAN_LAYOUT).matches) return;
  const el       = document.querySelector(selector);
  const scroller = document.querySelector(".plan-detail-cols");
  if (!el || !scroller) return;

  // Already looking at it — scrolling again would just yank the view around.
  const box  = el.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  const visible = Math.min(box.bottom, view.bottom) - Math.max(box.top, view.top);
  if (visible >= Math.min(box.height, view.height) * 0.6) return;

  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function selectPlanSlot(slot) {
  const pendingId = gamePlans.pickerPendingPlayerId;
  if (pendingId != null) {
    const player = cb.getSquadPlayers().find((x) => Number(x.id) === Number(pendingId));
    document.querySelectorAll(".pitch-slot, .bench-slot").forEach((el) => el.classList.remove("active"));
    gamePlans.activeSlot = null;
    if (player) {
      assignToSlot(slot, player);
      return;
    }
    gamePlans.pickerPendingPlayerId = null;
  }

  const prev = gamePlans.activeSlot;

  // Clicking the same slot → deselect
  if (prev === slot) {
    gamePlans.activeSlot = null;
    document.querySelectorAll(".pitch-slot, .bench-slot").forEach((el) => el.classList.remove("active"));
    setPickerHint(null);
    renderPlanPicker();
    return;
  }

  // A different slot is already active → swap or move
  if (prev !== null) {
    const prevPlayer = gamePlans.slots[prev] ?? null;
    const thisPlayer = gamePlans.slots[slot] ?? null;
    if (prevPlayer || thisPlayer) {
      swapSlots(prev, slot);
      return;
    }
    // Both empty → just switch active slot to this one
  }

  gamePlans.activeSlot = slot;
  gamePlans.pickerPendingPlayerId = null;
  document.querySelectorAll(".pitch-slot, .bench-slot").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.slot) === slot);
  });
  setPickerHint(slot);
  renderPlanPicker();
  scrollPlanSectionIntoView(".plan-right-col");
}

async function swapSlots(slotA, slotB) {
  const user = getUser();
  if (!user || !gamePlans.currentId) return;

  const playerA = gamePlans.slots[slotA] ?? null;
  const playerB = gamePlans.slots[slotB] ?? null;

  gamePlans.activeSlot = null;
  gamePlans.pickerPendingPlayerId = null;
  setPickerHint(null);

  try {
    const res = await fetch(`/api/game-plans/${gamePlans.currentId}/swap`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId: user.id, slotA, slotB }),
    });

    if (!res.ok) {
      showToast((await res.json()).error || "Could not swap players.", "error");
      return;
    }

    if (playerB) gamePlans.slots[slotA] = playerB;
    else delete gamePlans.slots[slotA];

    if (playerA) gamePlans.slots[slotB] = playerA;
    else delete gamePlans.slots[slotB];

    renderDetailSlots();
    renderPlanPicker();
    syncPlanCounts(gamePlans.currentId, user.id);
  } catch {
    showToast("Could not swap players.", "error");
  }
}

function setPickerHint() {}

function updatePpSortUI() {
  const cat     = SORT_CATEGORIES.find((c) => c.key === ppState.sortCategory);
  const lbl     = document.getElementById("ppSortLabel");
  const btn     = document.getElementById("ppSortBtn");
  const dirBtn  = document.getElementById("ppSortDirBtn");
  const dirIcon = document.getElementById("ppSortDirIcon");
  if (lbl)     lbl.textContent = cat ? cat.label : "SORT";
  if (btn)     btn.classList.toggle("has-active", ppState.sortCategory !== "overall_max" || ppState.sortDir !== "desc");
  if (dirBtn)  dirBtn.style.display  = "flex";
  if (dirIcon) dirIcon.textContent   = ppState.sortDir === "desc" ? "↓" : "↑";
  if (dirBtn) {
    dirBtn.title = cat
      ? (ppState.sortDir === "desc" ? cat.descTip : cat.ascTip)
      : "Toggle sort direction";
  }
  document.querySelectorAll(".pp-sort-opt").forEach((el) =>
    el.classList.toggle("active", el.dataset.sort === ppState.sortCategory));
}

function updatePpFilterDot() {
  const hasFilter = ppState.filterPositions.size > 0 || ppState.filterFoot.size
    || ppState.filterPlayingStyle.size || ppState.filterCardType.size || ppState.filterLeague.size || ppState.filterRegion.size
    || ppState.filterClub || ppState.filterNation
    || ppState.filterOverallMin || ppState.filterOverallMax
    || ppState.filterMaxOverallMin || ppState.filterMaxOverallMax
    || ppState.filterHeightMin || ppState.filterHeightMax
    || ppState.filterWeightMin || ppState.filterWeightMax || ppState.filterAgeMin || ppState.filterAgeMax;
  const dot = document.getElementById("ppFilterDot");
  const btn = document.getElementById("ppFilterBtn");
  if (dot) dot.style.display = hasFilter ? "inline-block" : "none";
  if (btn) btn.classList.toggle("has-active", hasFilter);
}

function rebuildPpPanels() {
  const sortWrap   = document.getElementById("ppSortWrap");
  const filterWrap = document.getElementById("ppFilterWrap");
  document.getElementById("ppSortPanel")?.remove();
  document.getElementById("ppFilterPanel")?.remove();
  if (sortWrap)   sortWrap.appendChild(buildPpSortPanel());
  if (filterWrap) filterWrap.appendChild(buildPpFilterPanel());
}

function buildPpSortPanel() {
  const panel = document.createElement("div");
  panel.className = "ap-dd-panel sort-dd-panel";
  panel.id = "ppSortPanel";
  SORT_CATEGORIES.forEach(({ key, label }) => {
    const item = document.createElement("div");
    item.className    = `sort-option pp-sort-opt${key === ppState.sortCategory ? " active" : ""}`;
    item.dataset.sort = key;
    item.innerHTML    = `<span>${label}</span>
      <svg class="sort-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    item.addEventListener("click", () => {
      ppState.sortCategory = key;
      updatePpSortUI();
      closeDdPanel("ppSortPanel", "ppSortBtn");
      renderPlanPicker();
    });
    panel.appendChild(item);
  });
  return panel;
}

const PP_FILTER_IDS = {
  posWrap: "ppPosMs",   posBtn: "ppPosMsBtn",   posLabel: "ppPosMsLabel",   posPanel: "ppPosMsPanel",
  ctWrap: "ppCtMs",     ctBtn: "ppCtMsBtn",     ctLabel: "ppCtMsLabel",     ctPanel: "ppCtMsPanel",
  psWrap: "ppPsMs",     psBtn: "ppPsMsBtn",     psLabel: "ppPsMsLabel",     psPanel: "ppPsMsPanel",
  footWrap: "ppFootMs", footBtn: "ppFootMsBtn", footLabel: "ppFootMsLabel", footPanel: "ppFootMsPanel",
  lgWrap: "ppLgMs",     lgBtn: "ppLgMsBtn",     lgLabel: "ppLgMsLabel",     lgPanel: "ppLgMsPanel",
  rgWrap: "ppRgMs",     rgBtn: "ppRgMsBtn",     rgLabel: "ppRgMsLabel",     rgPanel: "ppRgMsPanel",
  ovrMin: "ppFcOvrMin",       ovrMax: "ppFcOvrMax",
  ovrMaxMin: "ppFcOvrMaxMin", ovrMaxMax: "ppFcOvrMaxMax",
  club: "ppFcClub", nation: "ppFcNation",   // no autocomplete lists on the plan picker
  ageMin: "ppFcAMin",    ageMax: "ppFcAMax",
  heightMin: "ppFcHMin", heightMax: "ppFcHMax",
  weightMin: "ppFcWMin", weightMax: "ppFcWMax",
  clearBtn: "ppClearFilters",
};

function buildPpFilterPanel() {
  return buildPlayerFilterPanel({
    panelId: "ppFilterPanel",
    ids: PP_FILTER_IDS,
    state: ppState,
    onChange: () => { updatePpFilterDot(); renderPlanPicker(); },
    onClear: () => {
      resetPpState();
      rebuildPpPanels();
      updatePpSortUI();
      updatePpFilterDot();
      renderPlanPicker();
    },
  });
}

function renderPlanPicker() {
  const listEl = document.getElementById("planPickerList");
  if (!listEl) return;

  const q         = (document.getElementById("ppSearch")?.value ?? "").toLowerCase().trim();
  const usedIds   = new Set(
    Object.values(gamePlans.slots)
      .filter(Boolean)
      .map((s) => Number(s.player_id)),
  );
  const curPlayer = gamePlans.activeSlot ? gamePlans.slots[gamePlans.activeSlot] : null;

  let list = cb.getSquadPlayers().filter((p) => {
    if (ppState.filterPositions.size && !ppState.filterPositions.has(p.position)) return false;
    if (ppState.filterClub    && !(p.club        || "").toLowerCase().includes(ppState.filterClub.toLowerCase()))   return false;
    if (ppState.filterNation  && !(p.nationality || "").toLowerCase().includes(ppState.filterNation.toLowerCase())) return false;
    if (ppState.filterHeightMin && (p.height == null || p.height < +ppState.filterHeightMin)) return false;
    if (ppState.filterHeightMax && (p.height == null || p.height > +ppState.filterHeightMax)) return false;
    if (ppState.filterWeightMin && (p.weight == null || p.weight < +ppState.filterWeightMin)) return false;
    if (ppState.filterWeightMax && (p.weight == null || p.weight > +ppState.filterWeightMax)) return false;
    if (ppState.filterAgeMin    && (p.age    == null || p.age    < +ppState.filterAgeMin))    return false;
    if (ppState.filterAgeMax    && (p.age    == null || p.age    > +ppState.filterAgeMax))    return false;
    if (ppState.filterFoot.size && (p.foot == null || !ppState.filterFoot.has(p.foot))) return false;
    if (ppState.filterPlayingStyle.size && (p.playing_style == null || !ppState.filterPlayingStyle.has(p.playing_style))) return false;
    if (ppState.filterCardType.size && (p.card_type == null || !ppState.filterCardType.has(p.card_type))) return false;
    if (ppState.filterLeague.size && (p.league == null || !ppState.filterLeague.has(p.league))) return false;
    if (ppState.filterRegion.size && (p.region == null || !ppState.filterRegion.has(p.region))) return false;
    if (ppState.filterOverallMin && (p.overall == null || p.overall < +ppState.filterOverallMin)) return false;
    if (ppState.filterOverallMax && (p.overall == null || p.overall > +ppState.filterOverallMax)) return false;
    if (ppState.filterMaxOverallMin && (p.overall_max == null || p.overall_max < +ppState.filterMaxOverallMin)) return false;
    if (ppState.filterMaxOverallMax && (p.overall_max == null || p.overall_max > +ppState.filterMaxOverallMax)) return false;
    if (q && !p.name.toLowerCase().includes(q) &&
        !(p.position || "").toLowerCase().includes(q) &&
        !(p.club     || "").toLowerCase().includes(q)) return false;
    return true;
  });

  list = [...list].sort((a, b) => {
    const dir = ppState.sortDir === "desc" ? -1 : 1;
    switch (ppState.sortCategory) {
      case "position":
        return compareByPositionLine(a, b, ppState.sortDir === "desc");
      case "name": {
        const p = dir * (a.name || "").localeCompare(b.name || "");
        return p !== 0 ? p : tiebreakOverallDescThenName(a, b);
      }
      case "height": {
        const p = dir * ((a.height ?? -1) - (b.height ?? -1));
        return p !== 0 ? p : tiebreakOverallDescThenName(a, b);
      }
      case "weight": {
        const p = dir * ((a.weight ?? -1) - (b.weight ?? -1));
        return p !== 0 ? p : tiebreakOverallDescThenName(a, b);
      }
      case "age": {
        const p = dir * ((a.age ?? -1) - (b.age ?? -1));
        return p !== 0 ? p : tiebreakOverallDescThenName(a, b);
      }
      case "club": {
        const p = dir * (a.club || "").localeCompare(b.club || "");
        return p !== 0 ? p : tiebreakOverallDescThenName(a, b);
      }
      case "nationality": {
        const p = dir * (a.nationality || "").localeCompare(b.nationality || "");
        return p !== 0 ? p : tiebreakOverallDescThenName(a, b);
      }
      case "overall": {
        const p = ppState.sortDir === "desc"
          ? (b.overall ?? -1) - (a.overall ?? -1)
          : (a.overall ?? -1) - (b.overall ?? -1);
        return p !== 0 ? p : tiebreakPositionLineThenName(a, b);
      }
      case "overall_max":
      default: {
        const p = ppState.sortDir === "desc"
          ? ovrMaxForSort(b) - ovrMaxForSort(a)
          : ovrMaxForSort(a) - ovrMaxForSort(b);
        return p !== 0 ? p : tiebreakPositionLineThenName(a, b);
      }
    }
  });

  const countEl = document.getElementById("ppListCount");
  if (countEl) countEl.textContent = list.length ? `${list.length} player${list.length !== 1 ? "s" : ""}` : "";

  if (!list.length) {
    listEl.innerHTML = `<div class="sp-empty">No players found</div>`;
    return;
  }

  listEl.innerHTML = "";
  list.forEach((p) => {
    const row       = document.createElement("div");
    const pid       = Number(p.id);
    const isUsed    = usedIds.has(pid) && pid !== Number(curPlayer?.player_id);
    const isCurrent = curPlayer && Number(curPlayer.player_id) === pid;
    const isPending =
      gamePlans.pickerPendingPlayerId != null &&
      Number(gamePlans.pickerPendingPlayerId) === Number(p.id);
    row.className   = "pp-player-row";
    if (isCurrent) row.classList.add("pp-row-current");
    if (isUsed)    row.classList.add("pp-row-used");
    if (isPending) row.classList.add("pp-row-pending");

    // Card image
    const imgWrap = document.createElement("div");
    imgWrap.className = "cr-img";
    imgWrap.dataset.initial = p.name[0] || "?";
    imgWrap.appendChild(makePlayerImg(
      p.pesdb_id ? CARD_IMG(p.pesdb_id) : ANON_PLAYER_IMG,
      p.name,
    ));

    // Info block
    const info = document.createElement("div");
    info.className = "cr-info";
    info.innerHTML = `
      <div class="cr-name">${escapeHtml(p.name)}</div>
      <div class="cr-detail">${playerDetailSublineHtml(p)}</div>`;

    row.appendChild(imgWrap);
    row.appendChild(info);

    row.addEventListener("click", () => {
      if (gamePlans.activeSlot) {
        if (isUsed) {
          showToast("Player is already in this plan.", "error");
          return;
        }
        gamePlans.pickerPendingPlayerId = null;
        assignToSlot(gamePlans.activeSlot, p);
        return;
      }
      if (isUsed) {
        showToast("Player is already in this plan.", "error");
        return;
      }
      gamePlans.pickerPendingPlayerId = isPending ? null : p.id;
      renderPlanPicker();
    });
    listEl.appendChild(row);
  });
}

async function removeFromSlot(slot) {
  const user = getUser();
  if (!user || !gamePlans.currentId) return;
  try {
    const res = await fetch(`/api/game-plans/${gamePlans.currentId}/players/${slot}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId: user.id, playerId: null }),
    });
    if (!res.ok) { showToast((await res.json()).error || "Could not remove player.", "error"); return; }
    delete gamePlans.slots[slot];
    if (gamePlans.activeSlot === slot) {
      gamePlans.activeSlot = null;
      setPickerHint(null);
    }
    renderDetailSlots();
    renderPlanPicker();
    syncPlanCounts(gamePlans.currentId, user.id);
  } catch {
    showToast("Could not remove player.", "error");
  }
}

async function assignToSlot(slot, player) {
  const user = getUser();
  if (!user || !gamePlans.currentId) return;
  try {
    const res = await fetch(`/api/game-plans/${gamePlans.currentId}/players/${slot}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId: user.id, playerId: player.id }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Could not assign player.", "error"); return; }
    gamePlans.slots[slot] = {
      player_id:   player.id,
      name:        player.name,
      position:    player.position,
      overall:     player.overall,
      overall_max: player.overall_max ?? null,
      club:        player.club,
      pesdb_id:    player.pesdb_id,
    };
    // Deselect slot after successful assignment
    gamePlans.activeSlot = null;
    gamePlans.pickerPendingPlayerId = null;
    setPickerHint(null);
    renderDetailSlots();
    renderPlanPicker();
    syncPlanCounts(gamePlans.currentId, user.id);
    scrollPlanSectionIntoView(slot <= 11 ? ".plan-left-col" : ".plan-mid-col");
  } catch {
    showToast("Could not assign player.", "error");
  }
}

function syncPlanCounts(planId, userId) {
  const plan = gamePlans.plans.find((p) => p.id === planId);
  if (!plan) return;
  let lu = 0, su = 0;
  Object.entries(gamePlans.slots).forEach(([k, v]) => {
    if (v) { if (Number(k) <= 11) lu++; else su++; }
  });
  plan.lineup_count = lu;
  plan.sub_count    = su;
  renderPlansGrid(userId);
}

async function savePlanFormation(userId, formation) {
  const user = getUser();
  if (!user || !gamePlans.currentId) return false;
  const f = normalizeFormation(formation);
  try {
    const res = await fetch(`/api/game-plans/${gamePlans.currentId}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId: user.id, formation: f }),
    });
    if (!res.ok) {
      showToast((await res.json()).error || "Could not save formation.", "error");
      updatePlanFormationDropdownUI();
      return false;
    }
    gamePlans.formation = f;
    const plan = gamePlans.plans.find((p) => p.id === gamePlans.currentId);
    if (plan) plan.formation = f;
    updatePlanFormationDropdownUI();
    renderPlansGrid(userId);
    renderDetailSlots();
    return true;
  } catch {
    showToast("Could not save formation.", "error");
    updatePlanFormationDropdownUI();
    return false;
  }
}

function enterPlanSelectMode() {
  gamePlans.selectMode = true;
  gamePlans.selected.clear();
  document.getElementById("plansGrid")?.classList.add("select-mode");
  document.getElementById("plansToolbar").style.display        = "none";
  document.getElementById("planSelectionToolbar").style.display = "flex";
  updatePlanSelectionUI();
}

function exitPlanSelectMode() {
  gamePlans.selectMode = false;
  gamePlans.selected.clear();
  document.getElementById("plansGrid")?.classList.remove("select-mode");
  document.getElementById("plansToolbar").style.display        = "flex";
  document.getElementById("planSelectionToolbar").style.display = "none";
  document.getElementById("plansGrid")?.querySelectorAll(".plan-card.selected")
    .forEach((c) => c.classList.remove("selected"));
}

function updatePlanSelectionUI() {
  const count   = gamePlans.selected.size;
  const countEl = document.getElementById("planSelectedCount");
  const delBtn  = document.getElementById("planDeleteSelectedBtn");
  const selAllBtn = document.getElementById("planSelectAllBtn");
  const total   = gamePlans.plans.length;
  if (countEl) countEl.textContent = count;
  if (delBtn)  delBtn.disabled     = count === 0;
  if (selAllBtn) selAllBtn.textContent = (count > 0 && count === total) ? "DESELECT ALL" : "SELECT ALL";
}

async function deleteSelectedPlans(userId) {
  const ids = [...gamePlans.selected];
  if (!ids.length) return;

  const label = ids.length === 1 ? `1 game plan` : `${ids.length} game plans`;
  const ok = await showConfirm(`Delete ${label}?`);
  if (!ok) return;

  const delBtn = document.getElementById("planDeleteSelectedBtn");
  const originalHTML = delBtn?.innerHTML;
  if (delBtn) { delBtn.disabled = true; delBtn.textContent = "DELETING…"; }

  let failed = 0;
  for (const id of ids) {
    try {
      const res = await fetch(`/api/game-plans/${id}?userId=${userId}`, { method: "DELETE" });
      if (res.ok) gamePlans.plans = gamePlans.plans.filter((p) => p.id !== id);
      else failed++;
    } catch { failed++; }
  }

  if (delBtn && originalHTML) { delBtn.innerHTML = originalHTML; delBtn.disabled = false; }
  exitPlanSelectMode();
  renderPlansGrid(userId);
  if (failed) showToast(`${failed} plan(s) could not be deleted.`, "error");
  else showToast(`${ids.length} game plan${ids.length > 1 ? "s" : ""} deleted.`, "success");
  cb.refreshRoomsStats();
}

export function initGamePlans(userId) {
  document.getElementById("createPlanBtn")?.addEventListener("click",      () => createPlan(userId));
  document.getElementById("planSelectModeBtn")?.addEventListener("click",   enterPlanSelectMode);
  document.getElementById("planCancelSelectBtn")?.addEventListener("click", exitPlanSelectMode);
  document.getElementById("planSelectAllBtn")?.addEventListener("click", () => {
    const grid = document.getElementById("plansGrid");
    const allSelected = gamePlans.plans.length > 0 && gamePlans.selected.size === gamePlans.plans.length;
    if (allSelected) {
      gamePlans.selected.clear();
      grid?.querySelectorAll(".plan-card.selected").forEach((c) => c.classList.remove("selected"));
    } else {
      gamePlans.plans.forEach((p) => gamePlans.selected.add(p.id));
      grid?.querySelectorAll(".plan-card").forEach((c) => c.classList.add("selected"));
    }
    updatePlanSelectionUI();
  });
  document.getElementById("planDeleteSelectedBtn")?.addEventListener("click", () => deleteSelectedPlans(userId));

  document.getElementById("planDetailClose")?.addEventListener("click", closePlanDetail);
  document.getElementById("planDetailOverlay")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("planDetailOverlay")) closePlanDetail();
  });

  initFormationDropdown(userId);

  const nameInput = document.getElementById("planDetailName");
  nameInput?.addEventListener("blur", async () => {
    const newName  = nameInput.value.trim();
    const original = nameInput.dataset.original;
    if (!newName || newName === original || !gamePlans.currentId) return;
    const user = getUser();
    if (!user) return;
    try {
      const res = await fetch(`/api/game-plans/${gamePlans.currentId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ userId: user.id, name: newName }),
      });
      if (!res.ok) {
        showToast((await res.json()).error || "Could not rename plan.", "error");
        nameInput.value = original;
        return;
      }
      nameInput.dataset.original = newName;
      const plan = gamePlans.plans.find((p) => p.id === gamePlans.currentId);
      if (plan) { plan.name = newName; renderPlansGrid(userId); }
      showToast("Plan renamed.", "success");
    } catch {
      showToast("Could not rename plan.", "error");
      nameInput.value = original;
    }
  });
  nameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  nameInput.blur();
    if (e.key === "Escape") { nameInput.value = nameInput.dataset.original || ""; nameInput.blur(); }
  });

  // Plan picker: search
  let ppTimer = null;
  document.getElementById("ppSearch")?.addEventListener("input", () => {
    clearTimeout(ppTimer);
    ppTimer = setTimeout(renderPlanPicker, 180);
  });

  // Plan picker: sort button
  document.getElementById("ppSortBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDdPanel("ppSortPanel", "ppSortBtn", "ppFilterPanel", "ppFilterBtn");
  });

  // Plan picker: sort direction
  document.getElementById("ppSortDirBtn")?.addEventListener("click", () => {
    ppState.sortDir = ppState.sortDir === "desc" ? "asc" : "desc";
    updatePpSortUI();
    renderPlanPicker();
  });

  // Plan picker: filter button
  document.getElementById("ppFilterBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDdPanel("ppFilterPanel", "ppFilterBtn", "ppSortPanel", "ppSortBtn");
  });

  // Close picker dropdowns on outside click
  document.addEventListener("click", (e) => {
    const sortWrap   = document.getElementById("ppSortWrap");
    const filterWrap = document.getElementById("ppFilterWrap");
    const formWrap   = document.getElementById("planFormationWrap");
    if (sortWrap   && !sortWrap.contains(e.target))   closeDdPanel("ppSortPanel",   "ppSortBtn");
    if (filterWrap && !filterWrap.contains(e.target)) closeDdPanel("ppFilterPanel", "ppFilterBtn");
    if (formWrap   && !formWrap.contains(e.target))   closePlanFormationPanel();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.getElementById("confirmOverlay")?.classList.contains("open")) return;
    if (document.getElementById("planDetailOverlay")?.classList.contains("open")) {
      if (document.getElementById("planFormationPanel")?.classList.contains("open")) {
        closePlanFormationPanel();
        return;
      }
      if (gamePlans.pickerPendingPlayerId != null) {
        gamePlans.pickerPendingPlayerId = null;
        renderPlanPicker();
        return;
      }
      closePlanDetail();
    }
  });
}

/* ============================================================
   Create Room Modal
   ============================================================ */
