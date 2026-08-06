import { CARD_IMG, ANON_PLAYER_IMG, PAGE_SIZE, makePlayerImg, getUser, showToast, showConfirm,
         posClass, POSITION_LINE_ORDER, positionLineRank,
         tiebreakOverallDescThenName, ovrMaxForSort, tiebreakPositionLineThenName, compareByPositionLine,
         playerDetailSublineHtml, playerDetailTooltipText,
         closeDdPanel, toggleDdPanel } from './utils.js';
import { cb } from './callbacks.js';
import { playerFilterOptionsCache, getPlayerFilterOptions, initAutocomplete, wireAttributeMultiselects } from './catalog.js';
import { buildPlayerFilterPanel, resetPlayerFilterState } from './filterPanel.js';

const squad = {
  players:    [],
  selected:   new Set(),
  selectMode: false,
  showInfo: (() => {
    try {
      return localStorage.getItem("efb_squad_show_info") !== "0";
    } catch {
      return true;
    }
  })(),
  search:     "",
  sortKey:    "overall_max", // overall_max | overall | name | position | height | weight | age
  sortDir:    "desc",
  filterPositions: new Set(),
  filterFoot:          new Set(),
  filterPlayingStyle:  new Set(),
  filterCardType:      new Set(),
  filterLeague:        new Set(),
  filterRegion:        new Set(),
  filterClub:      "",
  filterNation:    "",
  filterOverallMin:     "",
  filterOverallMax:     "",
  filterMaxOverallMin:  "",
  filterMaxOverallMax:  "",
  filterHeightMin: "",
  filterHeightMax: "",
  filterWeightMin: "",
  filterWeightMax: "",
  filterAgeMin:    "",
  filterAgeMax:    "",
};

/** Forward attacking→defensive line; used for position sort (Add catalog, squad, game plan picker). */

const SQUAD_SORT_MAP = {
  overall_max: { desc: (a,b) => { const c = ovrMaxForSort(b) - ovrMaxForSort(a); return c !== 0 ? c : tiebreakPositionLineThenName(a, b); },
                  asc:  (a,b) => { const c = ovrMaxForSort(a) - ovrMaxForSort(b); return c !== 0 ? c : tiebreakPositionLineThenName(a, b); } },
  overall:  { desc: (a,b) => { const c = (b.overall||0)-(a.overall||0); return c !== 0 ? c : tiebreakPositionLineThenName(a, b); },
              asc:  (a,b) => { const c = (a.overall||0)-(b.overall||0); return c !== 0 ? c : tiebreakPositionLineThenName(a, b); } },
  name:     { asc:  (a,b) => { const c = b.name.localeCompare(a.name);   return c !== 0 ? c : tiebreakOverallDescThenName(a, b); },
              desc: (a,b) => { const c = a.name.localeCompare(b.name);   return c !== 0 ? c : tiebreakOverallDescThenName(a, b); } },
  position: { desc: (a,b) => compareByPositionLine(a, b, true),  asc: (a,b) => compareByPositionLine(a, b, false) },
  height:   { desc: (a,b) => { const c = (b.height||0)-(a.height||0); return c !== 0 ? c : tiebreakOverallDescThenName(a, b); },
              asc:  (a,b) => { const c = (a.height||0)-(b.height||0); return c !== 0 ? c : tiebreakOverallDescThenName(a, b); } },
  weight:   { desc: (a,b) => { const c = (b.weight||0)-(a.weight||0); return c !== 0 ? c : tiebreakOverallDescThenName(a, b); },
              asc:  (a,b) => { const c = (a.weight||0)-(b.weight||0); return c !== 0 ? c : tiebreakOverallDescThenName(a, b); } },
  age:      { desc: (a,b) => { const c = (b.age||0)-(a.age||0);       return c !== 0 ? c : tiebreakOverallDescThenName(a, b); },
              asc:  (a,b) => { const c = (a.age||0)-(b.age||0);       return c !== 0 ? c : tiebreakOverallDescThenName(a, b); } },
};


function getFilteredSortedSquad() {
  let list = squad.players.slice();
  const q = squad.search.toLowerCase();
  if (q)  list = list.filter(p => p.name.toLowerCase().includes(q) || (p.club||"").toLowerCase().includes(q));
  if (squad.filterPositions.size) list = list.filter(p => squad.filterPositions.has(p.position));
  if (squad.filterClub)      { const c = squad.filterClub.toLowerCase();      list = list.filter(p => (p.club||"").toLowerCase().includes(c)); }
  if (squad.filterNation)    { const n = squad.filterNation.toLowerCase();    list = list.filter(p => (p.nationality||"").toLowerCase().includes(n)); }
  if (squad.filterHeightMin) list = list.filter(p => (p.height||0) >= Number(squad.filterHeightMin));
  if (squad.filterHeightMax) list = list.filter(p => (p.height||0) <= Number(squad.filterHeightMax));
  if (squad.filterWeightMin) list = list.filter(p => (p.weight||0) >= Number(squad.filterWeightMin));
  if (squad.filterWeightMax) list = list.filter(p => (p.weight||0) <= Number(squad.filterWeightMax));
  if (squad.filterAgeMin)    list = list.filter(p => (p.age||0)    >= Number(squad.filterAgeMin));
  if (squad.filterAgeMax)    list = list.filter(p => (p.age||0)    <= Number(squad.filterAgeMax));
  if (squad.filterFoot.size) {
    list = list.filter((p) => p.foot != null && squad.filterFoot.has(p.foot));
  }
  if (squad.filterPlayingStyle.size) {
    list = list.filter((p) => p.playing_style != null && squad.filterPlayingStyle.has(p.playing_style));
  }
  if (squad.filterCardType.size) {
    list = list.filter((p) => p.card_type != null && squad.filterCardType.has(p.card_type));
  }
  if (squad.filterLeague.size) {
    list = list.filter((p) => p.league != null && squad.filterLeague.has(p.league));
  }
  if (squad.filterRegion.size) {
    list = list.filter((p) => p.region != null && squad.filterRegion.has(p.region));
  }
  if (squad.filterOverallMin) {
    list = list.filter((p) => p.overall != null && p.overall >= Number(squad.filterOverallMin));
  }
  if (squad.filterOverallMax) {
    list = list.filter((p) => p.overall != null && p.overall <= Number(squad.filterOverallMax));
  }
  if (squad.filterMaxOverallMin) {
    list = list.filter((p) => p.overall_max != null && p.overall_max >= Number(squad.filterMaxOverallMin));
  }
  if (squad.filterMaxOverallMax) {
    list = list.filter((p) => p.overall_max != null && p.overall_max <= Number(squad.filterMaxOverallMax));
  }
  const fn = SQUAD_SORT_MAP[squad.sortKey]?.[squad.sortDir];
  if (fn) list.sort(fn);
  return list;
}

function getSquadGrid()     { return document.getElementById("teamGrid"); }
function getSquadCountEl()  { return document.getElementById("teamCount"); }
function getSelectedCountEl(){ return document.getElementById("selectedCount"); }

function updateSquadCountBadge() {
  const el  = getSquadCountEl();
  if (el) el.textContent = `${squad.players.length} PLAYERS`;

  const empty = squad.players.length === 0;

  document.getElementById("selectModeBtn").disabled   = empty;
  document.getElementById("teamSearch").disabled      = empty;
  document.getElementById("teamSortBtn").disabled     = empty;
  document.getElementById("teamSortDirBtn").disabled  = empty;
  document.getElementById("teamFilterBtn").disabled   = empty;

  document.getElementById("teamSearch").placeholder   = empty ? "No players yet…" : "Search players...";
  document.querySelector(".team-search-bar")?.classList.toggle("disabled", empty);
}

function updateSelectionUI() {
  const el        = getSelectedCountEl();
  const deletBtn  = document.getElementById("deleteSelectedBtn");
  const selAllBtn = document.getElementById("selectAllBtn");
  const n         = squad.selected.size;
  const total     = getSquadGrid()?.querySelectorAll(".player-card").length ?? 0;

  if (el)       el.textContent  = n;
  if (deletBtn) deletBtn.disabled = n === 0;
  if (selAllBtn) selAllBtn.textContent = (n > 0 && n === total) ? "DESELECT ALL" : "SELECT ALL";
}

function updateSquadInfoVisibilityUi() {
  const btn = document.getElementById("toggleSquadInfoBtn");
  if (btn) {
    btn.textContent = squad.showInfo ? "HIDE INFO" : "SHOW INFO";
    btn.classList.toggle("is-off", !squad.showInfo);
    btn.setAttribute("aria-pressed", squad.showInfo ? "true" : "false");
  }
  getSquadGrid()?.classList.toggle("info-hidden", !squad.showInfo);
}

/* ──────────────── Load squad ──────────────── */
export async function loadSquad(userId) {
  const grid = getSquadGrid();
  if (!grid) return;

  grid.innerHTML = "";

  try {
    const res  = await fetch(`/api/my-players?userId=${userId}`);
    const data = await res.json();
    squad.players = data.players ?? [];
  } catch {
    showToast("Could not load your players.", "error");
    squad.players = [];
  }

  renderSquad();
  updateSquadCountBadge();
}

/* ──────────────── Render squad ──────────────── */
function renderSquad() {
  const grid = getSquadGrid();
  if (!grid) return;
  grid.innerHTML = "";
  updateSquadInfoVisibilityUi();

  if (!squad.players.length) {
    grid.innerHTML = `
      <div class="team-empty">
        <div class="team-empty-icon">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>
          </svg>
        </div>
        <h3>YOUR PLAYERS LIST IS EMPTY</h3>
        <p>Add players from the catalog to build your players list.</p>
        <button class="add-player-btn" id="emptyAddBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          ADD PLAYER
        </button>
      </div>`;
    document.getElementById("emptyAddBtn")?.addEventListener("click", cb.openAddPlayerModal);
    return;
  }

  const visible = getFilteredSortedSquad();
  if (!visible.length) {
    grid.innerHTML = `<div class="team-empty"><p style="color:var(--text-dim);font-size:0.85rem;">No players match your search.</p></div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  visible.forEach((p) => frag.appendChild(makeSquadCard(p)));
  grid.appendChild(frag);
}

/* ──────────────── Squad card ──────────────── */
function makeSquadCard(player) {
  const card = document.createElement("div");
  card.className = "player-card";
  card.dataset.id = player.id;
  card.title = playerDetailTooltipText(player);
  if (squad.selected.has(player.id)) card.classList.add("selected");

  const imgWrap = document.createElement("div");
  imgWrap.className = "pc-img-wrap";
  imgWrap.dataset.initial = player.name[0] || "?";

  imgWrap.appendChild(makePlayerImg(
    player.pesdb_id ? CARD_IMG(player.pesdb_id) : ANON_PLAYER_IMG,
    player.name,
  ));

  // Delete button (single delete)
  const delBtn = document.createElement("button");
  delBtn.className  = "pc-delete-btn";
  delBtn.title      = "Remove player";
  delBtn.innerHTML  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deletePlayers([player.id]);
  });
  imgWrap.appendChild(delBtn);

  // Checkbox (select mode)
  const checkboxEl = document.createElement("div");
  checkboxEl.className = "pc-checkbox";
  checkboxEl.addEventListener("click", (e) => e.stopPropagation());
  imgWrap.appendChild(checkboxEl);

  card.appendChild(imgWrap);

  // Info footer (name + OVR on card art only; text = region/country / league/club / …)
  const footer = document.createElement("div");
  footer.className = "pc-footer";
  footer.innerHTML = `
    <div class="pc-footer-meta pmeta-in-card pc-footer-detail-only">${playerDetailSublineHtml(player)}</div>
  `;
  card.appendChild(footer);

  // Toggle selection when in select mode
  card.addEventListener("click", () => {
    if (squad.selectMode) {
      const id = player.id;
      if (squad.selected.has(id)) {
        squad.selected.delete(id);
        card.classList.remove("selected");
      } else {
        squad.selected.add(id);
        card.classList.add("selected");
      }
      updateSelectionUI();
    } else {
      // Open detail popup — normalise squad player to catalog-player shape
      const catalogShape = {
        id:             player.pesdb_id,
        name:           player.name,
        position:       player.position,
        club:           player.club,
        league:         player.league,
        overall:        player.overall,
        overall_max:    player.overall_max,
        nationality:    player.nationality,
        region:         player.region,
        card_type:      player.card_type,
        foot:           player.foot,
        playing_style:  player.playing_style,
        height:         player.height,
        weight:         player.weight,
        age:            player.age,
      };
      cb.openPlayerPopup(catalogShape, null);
    }
  });

  return card;
}

/* ──────────────── Select mode ──────────────── */
function enterSelectMode() {
  squad.selectMode = true;
  squad.selected.clear();
  getSquadGrid()?.classList.add("select-mode");
  document.getElementById("teamToolbar").style.display     = "none";
  document.getElementById("selectionToolbar").style.display = "flex";
  updateSelectionUI();
}

function exitSelectMode() {
  squad.selectMode = false;
  squad.selected.clear();
  getSquadGrid()?.classList.remove("select-mode");
  document.getElementById("teamToolbar").style.display     = "flex";
  document.getElementById("selectionToolbar").style.display = "none";
  // clear visual selection
  getSquadGrid()?.querySelectorAll(".player-card.selected")
    .forEach((c) => c.classList.remove("selected"));
}

const SQUAD_SORT_CATEGORIES = [
  { key: "overall_max", label: "Overall Max",      bidir: true  },
  { key: "overall",     label: "Overall Level 1", bidir: true  },
  { key: "name",     label: "Player Name",    bidir: true  },
  { key: "position", label: "Position",       bidir: true  },
  { key: "height",   label: "Height",         bidir: true  },
  { key: "weight",   label: "Weight",         bidir: true  },
  { key: "age",      label: "Age",            bidir: true  },
];
const SQUAD_POSITIONS = ["GK","CB","LB","RB","DMF","CMF","LMF","RMF","AMF","LWF","RWF","SS","CF"];

function updateSquadSortUI() {
  const cat     = SQUAD_SORT_CATEGORIES.find(c => c.key === squad.sortKey);
  const labelEl = document.getElementById("teamSortLabel");
  const btn     = document.getElementById("teamSortBtn");
  const dirBtn  = document.getElementById("teamSortDirBtn");
  const dirIcon = document.getElementById("teamSortDirIcon");
  if (labelEl) labelEl.textContent = cat ? cat.label : "Sort";
  if (btn) btn.classList.toggle("has-active", squad.sortKey !== "overall_max" || squad.sortDir !== "desc");
  if (dirBtn && dirIcon) {
    dirBtn.style.display = "flex";
    dirIcon.textContent  = squad.sortDir === "desc" ? "↓" : "↑";
  }
  document.querySelectorAll(".squad-sort-option").forEach(el => {
    el.classList.toggle("active", el.dataset.sort === squad.sortKey);
  });
}

function updateSquadFilterDot() {
  const dot = document.getElementById("teamFilterDot");
  const btn = document.getElementById("teamFilterBtn");
  const active = squad.filterPositions.size > 0
    || squad.filterFoot.size || squad.filterPlayingStyle.size || squad.filterCardType.size || squad.filterLeague.size || squad.filterRegion.size
    || !!squad.filterClub || !!squad.filterNation
    || !!squad.filterOverallMin || !!squad.filterOverallMax
    || !!squad.filterMaxOverallMin || !!squad.filterMaxOverallMax
    || !!squad.filterHeightMin || !!squad.filterHeightMax
    || !!squad.filterWeightMin || !!squad.filterWeightMax
    || !!squad.filterAgeMin    || !!squad.filterAgeMax;
  if (dot) dot.style.display = active ? "inline-block" : "none";
  if (btn) btn.classList.toggle("has-active", active);
}

function buildSquadSortPanel() {
  const panel = document.createElement("div");
  panel.className = "ap-dd-panel sort-dd-panel";
  panel.id = "squadSortPanel";
  SQUAD_SORT_CATEGORIES.forEach(cat => {
    const item = document.createElement("div");
    item.className  = `sort-option squad-sort-option${cat.key === squad.sortKey ? " active" : ""}`;
    item.dataset.sort = cat.key;
    item.innerHTML  = `<span>${cat.label}</span>
      <svg class="sort-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    item.addEventListener("click", () => {
      squad.sortKey = cat.key;
      updateSquadSortUI();
      closeDdPanel("squadSortPanel", "teamSortBtn", "teamSortWrap");
      renderSquad();
    });
    panel.appendChild(item);
  });
  return panel;
}

const SQUAD_FILTER_IDS = {
  posWrap: "squadPosMultiselect", posBtn: "squadPosMsBtn",
  posLabel: "squadPosMsLabel",    posPanel: "squadPosMsPanel",
  ctWrap: "sqfCtMs",     ctBtn: "sqfCtMsBtn",     ctLabel: "sqfCtMsLabel",     ctPanel: "sqfCtMsPanel",
  psWrap: "sqfPsMs",     psBtn: "sqfPsMsBtn",     psLabel: "sqfPsMsLabel",     psPanel: "sqfPsMsPanel",
  footWrap: "sqfFootMs", footBtn: "sqfFootMsBtn", footLabel: "sqfFootMsLabel", footPanel: "sqfFootMsPanel",
  lgWrap: "sqfLgMs",     lgBtn: "sqfLgMsBtn",     lgLabel: "sqfLgMsLabel",     lgPanel: "sqfLgMsPanel",
  rgWrap: "sqfRgMs",     rgBtn: "sqfRgMsBtn",     rgLabel: "sqfRgMsLabel",     rgPanel: "sqfRgMsPanel",
  ovrMin: "sqfOvrMin",       ovrMax: "sqfOvrMax",
  ovrMaxMin: "sqfOvrMaxMin", ovrMaxMax: "sqfOvrMaxMax",
  club: "sqfClub", clubAc: "sqfClubAc", nation: "sqfNation", nationAc: "sqfNationAc",
  ageMin: "sqfAgeMin",       ageMax: "sqfAgeMax",
  heightMin: "sqfHeightMin", heightMax: "sqfHeightMax",
  weightMin: "sqfWeightMin", weightMax: "sqfWeightMax",
  clearBtn: "squadClearFiltersBtn",
};

function buildSquadFilterPanel() {
  return buildPlayerFilterPanel({
    panelId: "squadFilterPanel",
    ids: SQUAD_FILTER_IDS,
    state: squad,
    autocomplete: true,
    onChange: () => { updateSquadFilterDot(); renderSquad(); },
    onClear: () => {
      resetPlayerFilterState(squad);
      const wrap = document.getElementById("teamFilterWrap");
      document.getElementById("squadFilterPanel")?.remove();
      wrap.appendChild(buildSquadFilterPanel());
      updateSquadFilterDot();
      renderSquad();
    },
  });
}

export function initSquadSearchSortFilter() {
  // Search
  let searchTimer = null;
  document.getElementById("teamSearch")?.addEventListener("input", e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      squad.search = e.target.value.trim();
      renderSquad();
    }, 200);
  });

  // Sort panel
  const sortWrap = document.getElementById("teamSortWrap");
  if (sortWrap) sortWrap.appendChild(buildSquadSortPanel());
  updateSquadSortUI();

  document.getElementById("teamSortBtn")?.addEventListener("click", e => {
    e.stopPropagation();
    toggleDdPanel("squadSortPanel", "teamSortBtn", "squadFilterPanel", "teamFilterBtn");
  });
  document.getElementById("teamSortDirBtn")?.addEventListener("click", e => {
    e.stopPropagation();
    squad.sortDir = squad.sortDir === "desc" ? "asc" : "desc";
    updateSquadSortUI();
    renderSquad();
  });

  // Filter panel
  const filterWrap = document.getElementById("teamFilterWrap");
  if (filterWrap) filterWrap.appendChild(buildSquadFilterPanel());

  document.getElementById("teamFilterBtn")?.addEventListener("click", e => {
    e.stopPropagation();
    toggleDdPanel("squadFilterPanel", "teamFilterBtn", "squadSortPanel", "teamSortBtn");
  });

  document.getElementById("squadSortPanel")?.addEventListener("click",   e => e.stopPropagation());
  document.getElementById("squadFilterPanel")?.addEventListener("click", e => e.stopPropagation());

  document.addEventListener("click", () => {
    closeDdPanel("squadSortPanel",   "teamSortBtn");
    closeDdPanel("squadFilterPanel", "teamFilterBtn");
  });
}

export function initSquadControls(userId) {
  document.getElementById("toggleSquadInfoBtn")?.addEventListener("click", () => {
    squad.showInfo = !squad.showInfo;
    try {
      localStorage.setItem("efb_squad_show_info", squad.showInfo ? "1" : "0");
    } catch {
      /* ignore */
    }
    updateSquadInfoVisibilityUi();
  });
  document.getElementById("selectModeBtn")?.addEventListener("click", enterSelectMode);
  document.getElementById("cancelSelectBtn")?.addEventListener("click", exitSelectMode);

  document.getElementById("selectAllBtn")?.addEventListener("click", () => {
    const allCards  = getSquadGrid()?.querySelectorAll(".player-card");
    const allIds    = [...(allCards || [])].map((c) => Number(c.dataset.id));
    const allSelected = allIds.every((id) => squad.selected.has(id));
    const btn = document.getElementById("selectAllBtn");

    if (allSelected) {
      squad.selected.clear();
      allCards?.forEach((c) => c.classList.remove("selected"));
      if (btn) btn.textContent = "SELECT ALL";
    } else {
      squad.selected.clear();
      allCards?.forEach((c) => {
        squad.selected.add(Number(c.dataset.id));
        c.classList.add("selected");
      });
      if (btn) btn.textContent = "DESELECT ALL";
    }
    updateSelectionUI();
  });

  document.getElementById("deleteSelectedBtn")?.addEventListener("click", () => {
    if (!squad.selected.size) return;
    deletePlayers([...squad.selected], userId);
  });

  document.getElementById("openAddPlayerBtn")?.addEventListener("click", cb.openAddPlayerModal);
}

/* ──────────────── Delete ──────────────── */
async function deletePlayers(playerIds, userId) {
  const user = userId ?? getUser()?.id;
  if (!user) return;

  try {
    const res = await fetch("/api/my-players", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId: user, playerIds }),
    });

    if (!res.ok) {
      const d = await res.json();
      showToast(d.error || "Delete failed.", "error");
      return;
    }

    const n = playerIds.length;
    squad.players = squad.players.filter((p) => !playerIds.includes(p.id));
    squad.selected.clear();
    exitSelectMode();
    renderSquad();
    updateSquadCountBadge();
    showToast(n === 1 ? "Player removed." : `${n} players removed.`, "success");
    cb.refreshRoomsStats();
    cb.onPlayersDeleted();
  } catch {
    showToast("Network error. Please try again.", "error");
  }
}

/* ============================================================
/* ── Wire squad-side callbacks ── */
cb.getSquadPlayers      = () => squad.players;
cb.addToSquadState      = (playerData) => { squad.players.push(playerData); renderSquad(); updateSquadCountBadge(); };
cb.removeFromSquadState = (squadId)    => { squad.players = squad.players.filter((p) => p.id !== squadId); renderSquad(); updateSquadCountBadge(); };
cb.renderSquad          = () => renderSquad();
