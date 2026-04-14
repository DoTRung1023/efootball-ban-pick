/* ============================================================
   eFootball Ban & Pick — Home Page
   ============================================================ */

const CARD_IMG    = (id) => `https://pesdb.net/assets/img/card/f${id}.png`;
const PAGE_SIZE   = 50;
const POS_DEF     = ["CB","LB","RB","LWB","RWB"];
const POS_MID     = ["CMF","DMF","AMF"];
const POS_FWD     = ["RWF","LWF","CF","SS"];

/* ============================================================
   Auth
   ============================================================ */
function getUser() {
  try { return JSON.parse(localStorage.getItem("efb_user") || "null"); }
  catch { return null; }
}

function requireAuth() {
  const user = getUser();
  if (!user) { window.location.href = "/signin"; return null; }
  return user;
}

/* ============================================================
   Toast
   ============================================================ */
let toastTimer = null;
function showToast(message, type = "info") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}

/* ============================================================
   User Menu
   ============================================================ */
function initUserMenu(user) {
  const avatar   = document.getElementById("userAvatar");
  const name     = document.getElementById("userName");
  const menu     = document.getElementById("userMenu");
  const trigger  = document.getElementById("userTrigger");
  const dropUser = document.getElementById("dropUsername");
  const dropMail = document.getElementById("dropEmail");

  if (avatar)   avatar.textContent   = user.username[0].toUpperCase();
  if (name)     name.textContent     = user.username;
  if (dropUser) dropUser.textContent = user.username;
  if (dropMail) dropMail.textContent = user.email;

  trigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle("open");
    trigger.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", (e) => {
    if (!menu?.contains(e.target)) {
      menu?.classList.remove("open");
      trigger?.setAttribute("aria-expanded", "false");
    }
  });

  document.getElementById("signOutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("efb_user");
    window.location.href = "/signin";
  });
}

/* ============================================================
   Tabs
   ============================================================ */
function initTabs() {
  const tabs   = document.querySelectorAll(".nav-tab");
  const panels = document.querySelectorAll(".tab-panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((t)   => t.classList.toggle("active", t.dataset.tab === target));
      panels.forEach((p) => p.classList.toggle("active", p.id === target + "Panel"));
    });
  });
}

/* ============================================================
   Helpers
   ============================================================ */
function posClass(pos) {
  if (!pos) return "pos-other";
  if (pos === "GK")           return "pos-gk";
  if (POS_DEF.includes(pos)) return "pos-def";
  if (POS_MID.includes(pos)) return "pos-mid";
  if (POS_FWD.includes(pos)) return "pos-fwd";
  return "pos-other";
}

/* ============================================================
   Squad state
   ============================================================ */
const squad = {
  players:    [],
  selected:   new Set(),
  selectMode: false,
  search:     "",
  sortKey:    "overall",   // overall | name | position | height | weight | age
  sortDir:    "desc",
  filterPositions: new Set(),
};

const SQUAD_SORT_MAP = {
  overall:  { desc: (a,b) => (b.overall||0)-(a.overall||0),  asc: (a,b) => (a.overall||0)-(b.overall||0)  },
  name:     { asc:  (a,b) => a.name.localeCompare(b.name),   desc: (a,b) => b.name.localeCompare(a.name)  },
  position: { asc:  (a,b) => (a.position||"").localeCompare(b.position||""), desc: (a,b) => (b.position||"").localeCompare(a.position||"") },
  height:   { desc: (a,b) => (b.height||0)-(a.height||0),   asc: (a,b) => (a.height||0)-(b.height||0)   },
  weight:   { desc: (a,b) => (b.weight||0)-(a.weight||0),   asc: (a,b) => (a.weight||0)-(b.weight||0)   },
  age:      { desc: (a,b) => (b.age||0)-(a.age||0),         asc: (a,b) => (a.age||0)-(b.age||0)          },
};

function getFilteredSortedSquad() {
  let list = squad.players.slice();
  const q = squad.search.toLowerCase();
  if (q)  list = list.filter(p => p.name.toLowerCase().includes(q) || (p.club||"").toLowerCase().includes(q));
  if (squad.filterPositions.size) list = list.filter(p => squad.filterPositions.has(p.position));
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
  const el  = getSelectedCountEl();
  const btn = document.getElementById("deleteSelectedBtn");
  const n   = squad.selected.size;
  if (el)  el.textContent = n;
  if (btn) btn.disabled = n === 0;
}

/* ──────────────── Load squad ──────────────── */
async function loadSquad(userId) {
  const grid = getSquadGrid();
  if (!grid) return;

  grid.innerHTML = "";

  try {
    const res  = await fetch(`/api/my-players?userId=${userId}`);
    const data = await res.json();
    squad.players = data.players ?? [];
  } catch {
    showToast("Could not load your team.", "error");
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
        <h3>YOUR TEAM IS EMPTY</h3>
        <p>Add players from the catalog to build your team.</p>
        <button class="add-player-btn" id="emptyAddBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          ADD PLAYER
        </button>
      </div>`;
    document.getElementById("emptyAddBtn")?.addEventListener("click", openAddPlayerModal);
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
  if (squad.selected.has(player.id)) card.classList.add("selected");

  const imgWrap = document.createElement("div");
  imgWrap.className = "pc-img-wrap";
  imgWrap.dataset.initial = player.name[0] || "?";

  if (player.pesdb_id) {
    const img = document.createElement("img");
    img.src     = CARD_IMG(player.pesdb_id);
    img.alt     = player.name;
    img.loading = "lazy";
    img.onerror = () => imgWrap.classList.add("no-img");
    imgWrap.appendChild(img);
  } else {
    imgWrap.classList.add("no-img");
  }

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
  const cb = document.createElement("div");
  cb.className = "pc-checkbox";
  cb.addEventListener("click", (e) => e.stopPropagation());
  imgWrap.appendChild(cb);

  card.appendChild(imgWrap);

  // Info footer
  const footer = document.createElement("div");
  footer.className = "pc-footer";
  footer.innerHTML = `
    <div class="pc-footer-name">${player.name}</div>
    <div class="pc-footer-club">
      <span>${player.club || "—"}</span>
      ${player.nationality ? `<span class="pc-footer-sep">·</span><span>${player.nationality}</span>` : ""}
    </div>
    <div class="pc-footer-meta">
      ${player.height  ? `<span>${player.height} cm</span><span class="pc-footer-sep">·</span>` : ""}
      ${player.weight  ? `<span>${player.weight} kg</span><span class="pc-footer-sep">·</span>` : ""}
      ${player.age     ? `<span>${player.age} yo</span>` : ""}
    </div>
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
        id:          player.pesdb_id,
        name:        player.name,
        position:    player.position,
        club:        player.club,
        overall:     player.overall,
        nationality: player.nationality,
        height:      player.height,
        weight:      player.weight,
        age:         player.age,
      };
      openPlayerPopup(catalogShape, null);
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
  { key: "overall",  label: "Overall Rating", bidir: true  },
  { key: "name",     label: "Player Name",    bidir: true  },
  { key: "position", label: "Position",       bidir: false },
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
  if (btn) btn.classList.toggle("has-active", squad.sortKey !== "overall" || squad.sortDir !== "desc");
  if (dirBtn && dirIcon) {
    dirBtn.style.display = (cat && cat.bidir) ? "flex" : "none";
    dirIcon.textContent  = squad.sortDir === "desc" ? "↓" : "↑";
  }
  document.querySelectorAll(".squad-sort-option").forEach(el => {
    el.classList.toggle("active", el.dataset.sort === squad.sortKey);
  });
}

function updateSquadFilterDot() {
  const dot = document.getElementById("teamFilterDot");
  const btn = document.getElementById("teamFilterBtn");
  const active = squad.filterPositions.size > 0;
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
      const c = SQUAD_SORT_CATEGORIES.find(x => x.key === cat.key);
      squad.sortKey = cat.key;
      if (c && !c.bidir) squad.sortDir = "asc";
      updateSquadSortUI();
      closeDdPanel("squadSortPanel", "teamSortBtn", "teamSortWrap");
      renderSquad();
    });
    panel.appendChild(item);
  });
  return panel;
}

function buildSquadFilterPanel() {
  const panel = document.createElement("div");
  panel.className = "ap-dd-panel filter-dd-panel";
  panel.id = "squadFilterPanel";
  panel.innerHTML = `
    <div class="filter-section">
      <div class="filter-section-label">POSITION</div>
      <div class="pos-multiselect" id="squadPosMultiselect">
        <button class="pos-ms-btn" id="squadPosMsBtn" type="button">
          <span id="squadPosMsLabel">All positions</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="squadPosMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <button class="filter-clear-btn" id="squadClearFiltersBtn">CLEAR FILTERS</button>
    </div>
  `;

  const msPanel  = panel.querySelector("#squadPosMsPanel");
  const msBtn    = panel.querySelector("#squadPosMsBtn");
  const msLabel  = panel.querySelector("#squadPosMsLabel");

  function updatePosLabel() {
    const sel = [...squad.filterPositions];
    msLabel.textContent = sel.length === 0 ? "All positions"
      : sel.length <= 7  ? sel.join(", ")
      : `${sel.slice(0,7).join(", ")} +${sel.length-7}`;
    msBtn.classList.toggle("has-pos-filter", sel.length > 0);
  }

  SQUAD_POSITIONS.forEach(pos => {
    const item = document.createElement("div");
    item.className  = `pos-ms-item${squad.filterPositions.has(pos) ? " checked" : ""}`;
    item.dataset.pos = pos;
    item.innerHTML  = `<span class="pos-ms-check"></span><span>${pos}</span>`;
    item.addEventListener("click", e => {
      e.stopPropagation();
      squad.filterPositions.has(pos) ? squad.filterPositions.delete(pos) : squad.filterPositions.add(pos);
      item.classList.toggle("checked", squad.filterPositions.has(pos));
      updatePosLabel();
      updateSquadFilterDot();
      renderSquad();
    });
    msPanel.appendChild(item);
  });

  msBtn.addEventListener("click", e => {
    e.stopPropagation();
    const isOpen = msPanel.classList.toggle("open");
    msBtn.classList.toggle("open", isOpen);
  });
  document.addEventListener("click", () => msPanel.classList.remove("open"));
  msPanel.addEventListener("click", e => e.stopPropagation());
  updatePosLabel();

  panel.querySelector("#squadClearFiltersBtn")?.addEventListener("click", () => {
    squad.filterPositions.clear();
    const wrap = document.getElementById("teamFilterWrap");
    const old  = document.getElementById("squadFilterPanel");
    if (old) old.remove();
    wrap.appendChild(buildSquadFilterPanel());
    updateSquadFilterDot();
    renderSquad();
  });

  return panel;
}

function initSquadSearchSortFilter() {
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

function initSquadControls(userId) {
  document.getElementById("selectModeBtn")?.addEventListener("click", enterSelectMode);
  document.getElementById("cancelSelectBtn")?.addEventListener("click", exitSelectMode);

  document.getElementById("selectAllBtn")?.addEventListener("click", () => {
    const allCards = getSquadGrid()?.querySelectorAll(".player-card");
    squad.selected.clear();
    allCards?.forEach((c) => {
      const id = Number(c.dataset.id);
      squad.selected.add(id);
      c.classList.add("selected");
    });
    updateSelectionUI();
  });

  document.getElementById("deleteSelectedBtn")?.addEventListener("click", () => {
    if (!squad.selected.size) return;
    deletePlayers([...squad.selected], userId);
  });

  document.getElementById("openAddPlayerBtn")?.addEventListener("click", openAddPlayerModal);
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

    // update added set in catalog modal
    playerIds.forEach((id) => {
      const p = squad.players.find((pl) => pl.id === id);
      if (p?.pesdb_id) catalog.addedPesdbIds.delete(String(p.pesdb_id));
    });
    refreshCatalogAddedState();
  } catch {
    showToast("Network error. Please try again.", "error");
  }
}

/* ============================================================
   Catalog (Add Player modal) state
   ============================================================ */
// One entry per category; bidir=true means ↑/↓ toggle is available
const SORT_CATEGORIES = [
  { key: "overall",     label: "Overall Rating", descVal: "overall_desc",    ascVal: "overall_asc",     bidir: true,  descTip: "Highest rating first",  ascTip: "Lowest rating first"   },
  { key: "name",        label: "Player Name",    descVal: "name_asc",        ascVal: "name_desc",       bidir: true,  descTip: "A → Z",                 ascTip: "Z → A"                 },
  { key: "position",    label: "Position",       descVal: "position_asc",    ascVal: "position_asc",    bidir: false                                                                     },
  { key: "height",      label: "Height",         descVal: "height_desc",     ascVal: "height_asc",      bidir: true,  descTip: "Tallest first",          ascTip: "Shortest first"        },
  { key: "weight",      label: "Weight",         descVal: "weight_desc",     ascVal: "weight_asc",      bidir: true,  descTip: "Heaviest first",         ascTip: "Lightest first"        },
  { key: "age",         label: "Age",            descVal: "age_desc",        ascVal: "age_asc",         bidir: true,  descTip: "Oldest first",           ascTip: "Youngest first"        },
  { key: "club",        label: "Club",           descVal: "club_asc",        ascVal: "club_asc",        bidir: false                                                                     },
  { key: "nationality", label: "Nationality",    descVal: "nationality_asc", ascVal: "nationality_asc", bidir: false                                                                     },
];

const catalog = {
  players:       [],
  offset:        0,
  query:         "",
  filterPositions: new Set(),
  sortCategory:  "overall",
  sortDir:       "desc",
  sortBy:        "overall_desc",
  filterClub:       "",
  filterNation:     "",
  filterHeightMin:  "",
  filterHeightMax:  "",
  filterWeightMin:  "",
  filterWeightMax:  "",
  filterAgeMin:     "",
  filterAgeMax:     "",
  hasMore:       true,
  loading:       false,
  addedPesdbIds: new Set(),
};

function initAutocomplete(inputEl, listEl, field, onPick) {
  let timer = null;

  inputEl.addEventListener("input", () => {
    clearTimeout(timer);
    const q = inputEl.value.trim();
    if (!q) { listEl.innerHTML = ""; listEl.classList.remove("open"); return; }

    timer = setTimeout(async () => {
      try {
        const res   = await fetch(`/api/players/distinct?field=${field}&q=${encodeURIComponent(q)}`);
        const items = await res.json();
        if (!items.length) { listEl.innerHTML = ""; listEl.classList.remove("open"); return; }

        listEl.innerHTML = items
          .map((v) => `<div class="autocomplete-item" data-val="${v.replace(/"/g, "&quot;")}">${v}</div>`)
          .join("");
        listEl.classList.add("open");

        listEl.querySelectorAll(".autocomplete-item").forEach((el) => {
          el.addEventListener("mousedown", (e) => {
            e.preventDefault();
            inputEl.value = el.dataset.val;
            onPick(el.dataset.val);
            listEl.innerHTML = "";
            listEl.classList.remove("open");
          });
        });
      } catch (_) {}
    }, 200);
  });

  inputEl.addEventListener("blur", () => {
    setTimeout(() => { listEl.innerHTML = ""; listEl.classList.remove("open"); }, 150);
  });
}

function hasActiveFilters() {
  return catalog.filterPositions.size || catalog.filterClub || catalog.filterNation ||
    catalog.filterHeightMin || catalog.filterHeightMax ||
    catalog.filterWeightMin || catalog.filterWeightMax ||
    catalog.filterAgeMin    || catalog.filterAgeMax;
}

function updateFilterBadge() {
  const dot = document.getElementById("activeFilterDot");
  const btn = document.getElementById("filterDropBtn");
  const active = !!hasActiveFilters();
  if (dot) dot.style.display = active ? "inline-block" : "none";
  if (btn) btn.classList.toggle("has-active", active);
}

function getSortVal() {
  const cat = SORT_CATEGORIES.find((c) => c.key === catalog.sortCategory);
  if (!cat) return "overall_desc";
  return catalog.sortDir === "asc" ? cat.ascVal : cat.descVal;
}

function applySort(categoryKey) {
  const cat = SORT_CATEGORIES.find((c) => c.key === categoryKey);
  catalog.sortCategory = categoryKey;
  // Keep the current direction; only force "asc" for non-bidirectional categories
  if (cat && !cat.bidir) catalog.sortDir = "asc";
  catalog.sortBy = getSortVal();
  updateSortUI();
}

function toggleSortDir() {
  catalog.sortDir = catalog.sortDir === "desc" ? "asc" : "desc";
  catalog.sortBy  = getSortVal();
  updateSortUI();
  reloadCatalog();
}

function updateSortUI() {
  const cat     = SORT_CATEGORIES.find((c) => c.key === catalog.sortCategory);
  const labelEl = document.getElementById("sortDropLabel");
  const btn     = document.getElementById("sortDropBtn");
  const dirBtn  = document.getElementById("sortDirBtn");
  const dirIcon = document.getElementById("sortDirIcon");

  if (labelEl) labelEl.textContent = cat ? cat.label : "SORT";
  if (btn)     btn.classList.toggle("has-active", catalog.sortCategory !== "overall" || catalog.sortDir !== "desc");

  if (dirBtn && dirIcon) {
    const show = !!(cat && cat.bidir);
    dirBtn.style.display = show ? "flex" : "none";
    dirIcon.textContent  = catalog.sortDir === "desc" ? "↓" : "↑";
    dirBtn.title = show
      ? (catalog.sortDir === "desc" ? cat.descTip : cat.ascTip)
      : "";
  }

  document.querySelectorAll(".sort-option").forEach((el) => {
    el.classList.toggle("active", el.dataset.sort === catalog.sortCategory);
  });
}

function syncAddedPesdbIds() {
  catalog.addedPesdbIds.clear();
  squad.players.forEach((p) => {
    if (p.pesdb_id) catalog.addedPesdbIds.add(String(p.pesdb_id));
  });
}

/* ──────────────── Fetch catalog ──────────────── */
async function fetchCatalog(reset = false) {
  if (catalog.loading) return;
  if (!catalog.hasMore && !reset) return;

  if (reset) {
    catalog.offset  = 0;
    catalog.hasMore = true;
    catalog.players = [];
  }

  catalog.loading = true;

  const params = new URLSearchParams({ limit: PAGE_SIZE, offset: catalog.offset, sortBy: catalog.sortBy });
  if (catalog.query)          params.set("q",           catalog.query);
  if (catalog.filterPositions.size) params.set("positions", [...catalog.filterPositions].join(","));
  if (catalog.filterClub)     params.set("club",         catalog.filterClub);
  if (catalog.filterNation)   params.set("nationality",  catalog.filterNation);
  if (catalog.filterHeightMin) params.set("heightMin",   catalog.filterHeightMin);
  if (catalog.filterHeightMax) params.set("heightMax",   catalog.filterHeightMax);
  if (catalog.filterWeightMin) params.set("weightMin",   catalog.filterWeightMin);
  if (catalog.filterWeightMax) params.set("weightMax",   catalog.filterWeightMax);
  if (catalog.filterAgeMin)   params.set("ageMin",       catalog.filterAgeMin);
  if (catalog.filterAgeMax)   params.set("ageMax",       catalog.filterAgeMax);

  try {
    const res   = await fetch("/api/players?" + params);
    const data  = await res.json();
    const fresh = data.players ?? [];
    catalog.players = reset ? fresh : [...catalog.players, ...fresh];
    catalog.offset += fresh.length;
    catalog.hasMore = fresh.length === PAGE_SIZE;
  } catch {
    showToast("Could not load catalog.", "error");
  } finally {
    catalog.loading = false;
  }
}

/* ──────────────── Render catalog list ──────────────── */
function renderCatalogList() {
  const list = document.getElementById("catalogList");
  if (!list) return;

  list.innerHTML = "";

  if (!catalog.players.length) {
    list.innerHTML = `<div class="catalog-empty"><p>NO PLAYERS FOUND</p></div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  catalog.players.forEach((p) => frag.appendChild(makeCatalogRow(p)));

  if (catalog.hasMore) {
    const btn = document.createElement("button");
    btn.className = "load-more-btn";
    btn.id        = "apLoadMoreBtn";
    btn.textContent = "LOAD MORE";
    btn.addEventListener("click", async () => {
      btn.disabled    = true;
      btn.textContent = "LOADING…";
      await fetchCatalog();
      renderCatalogList();
    });
    frag.appendChild(btn);
  }

  list.appendChild(frag);
}

function makeCatalogRow(player) {
  const row = document.createElement("div");
  row.className       = "catalog-row";
  row.dataset.pesdbId = player.id;

  const isAdded = catalog.addedPesdbIds.has(String(player.id));

  const imgWrap = document.createElement("div");
  imgWrap.className = "cr-img";
  imgWrap.dataset.initial = player.name[0] || "?";
  const img = document.createElement("img");
  img.src     = CARD_IMG(player.id);
  img.alt     = player.name;
  img.loading = "lazy";
  img.onerror = () => { imgWrap.classList.add("no-img"); imgWrap.textContent = player.name[0] || "?"; };
  imgWrap.appendChild(img);

  const info = document.createElement("div");
  info.className = "cr-info";
  info.innerHTML = `
    <div class="cr-name">${player.name}</div>
    <div class="cr-club">
      <span>${player.club || "—"}</span>
      ${player.nationality ? `<span class="cr-meta-sep">·</span><span class="cr-nationality">${player.nationality}</span>` : ""}
    </div>
  `;

  const meta = document.createElement("div");
  meta.className = "cr-meta";
  meta.innerHTML = `
    <span class="cr-meta-item" title="Height">${player.height ? player.height + " cm" : "—"}</span>
    <span class="cr-meta-sep">·</span>
    <span class="cr-meta-item" title="Weight">${player.weight ? player.weight + " kg" : "—"}</span>
    <span class="cr-meta-sep">·</span>
    <span class="cr-meta-item" title="Age">${player.age ? player.age + " yo" : "—"}</span>
  `;

  const pos = document.createElement("span");
  pos.className   = `cr-pos ${posClass(player.position)}`;
  pos.textContent = player.position || "?";

  const ovr = document.createElement("span");
  ovr.className   = "cr-ovr";
  ovr.textContent = player.overall ?? "—";

  const addBtn = document.createElement("button");
  addBtn.className = `cr-add-btn ${isAdded ? "added" : ""}`;
  addBtn.title     = isAdded ? "Remove from team" : "Add to team";
  addBtn.innerHTML = isAdded
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (addBtn.classList.contains("added")) {
      removePlayerFromCatalog(player, addBtn);
    } else {
      addPlayerToSquad(player, addBtn);
    }
  });

  // Click row → open detail popup
  row.addEventListener("click", () => openPlayerPopup(player, addBtn));

  info.appendChild(meta);
  row.appendChild(imgWrap);
  row.appendChild(info);
  row.appendChild(pos);
  row.appendChild(ovr);
  row.appendChild(addBtn);
  return row;
}

/* ──────────────── Add player to team ──────────────── */
async function addPlayerToSquad(player, btn) {
  const user = getUser();
  if (!user) return;

  btn.disabled = true;

  try {
    const res = await fetch("/api/my-players", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        userId: user.id, name: player.name, position: player.position,
        club: player.club, overall: player.overall, pesdbId: player.id,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 409) { showToast("Already in your team.", "error"); markAdded(btn, player.id); }
      else { showToast(data.error || "Could not add player.", "error"); btn.disabled = false; }
      return;
    }

    squad.players.push({
      id:          data.id,
      name:        player.name,
      position:    player.position,
      club:        player.club,
      overall:     player.overall,
      pesdb_id:    player.id,
      nationality: player.nationality ?? null,
      height:      player.height      ?? null,
      weight:      player.weight      ?? null,
      age:         player.age         ?? null,
    });

    markAdded(btn, player.id);
    renderSquad();
    updateSquadCountBadge();
    showToast(`${player.name} added to team!`, "success");
  } catch {
    showToast("Network error. Please try again.", "error");
    btn.disabled = false;
  }
}

function markAdded(btn, pesdbId) {
  btn.disabled  = false;
  btn.className = "cr-add-btn added";
  btn.title     = "Remove from team";
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
  catalog.addedPesdbIds.add(String(pesdbId));
}

function markRemoved(btn, pesdbId) {
  btn.disabled  = false;
  btn.className = "cr-add-btn";
  btn.title     = "Add to team";
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  catalog.addedPesdbIds.delete(String(pesdbId));
}

async function removePlayerFromCatalog(player, btn) {
  const user = getUser();
  if (!user) return;

  // Find the squad player id by pesdb_id
  const squadPlayer = squad.players.find((p) => String(p.pesdb_id) === String(player.id));
  if (!squadPlayer) return;

  if (btn) btn.disabled = true;
  try {
    const res = await fetch("/api/my-players", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId: user.id, playerIds: [squadPlayer.id] }),
    });
    if (!res.ok) {
      showToast("Could not remove player.", "error");
      if (btn) btn.disabled = false;
      return;
    }

    squad.players = squad.players.filter((p) => p.id !== squadPlayer.id);
    renderSquad();
    updateSquadCountBadge();
    if (btn) markRemoved(btn, player.id);

    showToast(`${player.name} removed from team.`);
    return true;
  } catch {
    showToast("Network error. Please try again.", "error");
    if (btn) btn.disabled = false;
    return false;
  }
}

function refreshCatalogAddedState() {
  syncAddedPesdbIds();
  document.querySelectorAll(".catalog-row").forEach((row) => {
    const id  = row.dataset.pesdbId;
    const btn = row.querySelector(".cr-add-btn");
    if (btn && catalog.addedPesdbIds.has(String(id)) && !btn.classList.contains("added"))
      markAdded(btn, id);
  });
}

/* ──────────────── Sort & Filter dropdowns ──────────────── */
function buildSortPanel() {
  const panel = document.createElement("div");
  panel.className = "ap-dd-panel sort-dd-panel";
  panel.id        = "sortPanel";

  SORT_CATEGORIES.forEach((cat) => {
    const item = document.createElement("div");
    item.className    = `sort-option${cat.key === catalog.sortCategory ? " active" : ""}`;
    item.dataset.sort = cat.key;
    item.innerHTML    = `<span>${cat.label}</span>
      <svg class="sort-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>`;
    item.addEventListener("click", () => {
      applySort(cat.key);
      closeDdPanel("sortPanel", "sortDropBtn", "sortDropWrap");
      reloadCatalog();
    });
    panel.appendChild(item);
  });

  return panel;
}

function buildFilterPanel() {
  const panel = document.createElement("div");
  panel.className = "ap-dd-panel filter-dd-panel";
  panel.id        = "filterPanel";

  panel.innerHTML = `
    <div class="filter-section">
      <div class="filter-section-label">POSITION</div>
      <div class="pos-multiselect" id="posMultiselect">
        <button class="pos-ms-btn" id="posMsBtn" type="button">
          <span id="posMsLabel">All positions</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="posMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">CLUB</div>
      <div class="autocomplete-wrap">
        <input type="text" class="filter-input" id="fcClub" placeholder="e.g. FC Barcelona" value="${catalog.filterClub}" autocomplete="off">
        <div class="autocomplete-list" id="fcClubAc"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">NATIONALITY</div>
      <div class="autocomplete-wrap">
        <input type="text" class="filter-input" id="fcNation" placeholder="e.g. Brazil" value="${catalog.filterNation}" autocomplete="off">
        <div class="autocomplete-list" id="fcNationAc"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">HEIGHT (cm)</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="fcHeightMin" placeholder="Min" value="${catalog.filterHeightMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="fcHeightMax" placeholder="Max" value="${catalog.filterHeightMax}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">WEIGHT (kg)</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="fcWeightMin" placeholder="Min" value="${catalog.filterWeightMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="fcWeightMax" placeholder="Max" value="${catalog.filterWeightMax}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">AGE</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="fcAgeMin" placeholder="Min" value="${catalog.filterAgeMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="fcAgeMax" placeholder="Max" value="${catalog.filterAgeMax}">
      </div>
    </div>
    <div class="filter-section">
      <button class="filter-clear-btn" id="clearFiltersBtn">CLEAR ALL FILTERS</button>
    </div>
  `;

  // Position multi-select dropdown
  const POS_LIST = ["GK","CB","LB","RB","DMF","CMF","LMF","RMF","AMF","LWF","RWF","SS","CF"];
  const msPanel  = panel.querySelector("#posMsPanel");
  const msBtn    = panel.querySelector("#posMsBtn");
  const msLabel  = panel.querySelector("#posMsLabel");

  function updatePosLabel() {
    const sel = [...catalog.filterPositions];
    msLabel.textContent = sel.length === 0 ? "All positions"
      : sel.length <= 7  ? sel.join(", ")
      : `${sel.slice(0, 7).join(", ")} +${sel.length - 7}`;
    msBtn.classList.toggle("has-pos-filter", sel.length > 0);
  }

  POS_LIST.forEach((pos) => {
    const item = document.createElement("div");
    item.className  = `pos-ms-item${catalog.filterPositions.has(pos) ? " checked" : ""}`;
    item.dataset.pos = pos;
    item.innerHTML  = `<span class="pos-ms-check"></span><span>${pos}</span>`;
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      if (catalog.filterPositions.has(pos)) {
        catalog.filterPositions.delete(pos);
        item.classList.remove("checked");
      } else {
        catalog.filterPositions.add(pos);
        item.classList.add("checked");
      }
      updatePosLabel();
      updateFilterBadge();
      reloadCatalog();
    });
    msPanel.appendChild(item);
  });

  msBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = msPanel.classList.toggle("open");
    msBtn.classList.toggle("open", isOpen);
  });

  // Close pos panel when clicking outside
  document.addEventListener("click", () => msPanel.classList.remove("open"));
  msPanel.addEventListener("click", (e) => e.stopPropagation());

  updatePosLabel();

  // Text inputs (debounced)
  let filterTimer = null;
  function onFilterInput(id, key) {
    const el = panel.querySelector(`#${id}`);
    el?.addEventListener("input", () => {
      clearTimeout(filterTimer);
      catalog[key] = el.value.trim();
      filterTimer = setTimeout(() => { updateFilterBadge(); reloadCatalog(); }, 400);
    });
  }
  onFilterInput("fcClub",      "filterClub");
  onFilterInput("fcNation",    "filterNation");

  // Autocomplete for club & nationality
  initAutocomplete(
    panel.querySelector("#fcClub"),
    panel.querySelector("#fcClubAc"),
    "club",
    (val) => { catalog.filterClub = val; updateFilterBadge(); reloadCatalog(); }
  );
  initAutocomplete(
    panel.querySelector("#fcNation"),
    panel.querySelector("#fcNationAc"),
    "nationality",
    (val) => { catalog.filterNation = val; updateFilterBadge(); reloadCatalog(); }
  );
  onFilterInput("fcHeightMin", "filterHeightMin");
  onFilterInput("fcHeightMax", "filterHeightMax");
  onFilterInput("fcWeightMin", "filterWeightMin");
  onFilterInput("fcWeightMax", "filterWeightMax");
  onFilterInput("fcAgeMin",    "filterAgeMin");
  onFilterInput("fcAgeMax",    "filterAgeMax");

  // Clear all
  panel.querySelector("#clearFiltersBtn")?.addEventListener("click", () => {
    catalog.filterPositions.clear();
    catalog.filterClub = catalog.filterNation = "";
    catalog.filterHeightMin = catalog.filterHeightMax = "";
    catalog.filterWeightMin = catalog.filterWeightMax = "";
    catalog.filterAgeMin    = catalog.filterAgeMax    = "";
    // Rebuild filter panel to reset inputs visually
    const wrap = document.getElementById("filterDropWrap");
    const old  = document.getElementById("filterPanel");
    if (old) old.remove();
    wrap.appendChild(buildFilterPanel());
    updateFilterBadge();
    reloadCatalog();
  });

  return panel;
}

function openDdPanel(panelId, btnId) {
  const panel = document.getElementById(panelId);
  const btn   = document.getElementById(btnId);
  panel?.classList.add("open");
  btn?.classList.add("open");
  btn?.setAttribute("aria-expanded", "true");
}

function closeDdPanel(panelId, btnId) {
  const panel = document.getElementById(panelId);
  const btn   = document.getElementById(btnId);
  panel?.classList.remove("open");
  btn?.classList.remove("open");
  btn?.setAttribute("aria-expanded", "false");
}

function toggleDdPanel(panelId, btnId, otherPanelId, otherBtnId) {
  const panel = document.getElementById(panelId);
  if (panel?.classList.contains("open")) {
    closeDdPanel(panelId, btnId);
  } else {
    closeDdPanel(otherPanelId, otherBtnId);
    openDdPanel(panelId, btnId);
  }
}

/* ──────────────── Add Player Modal ──────────────── */
let addPlayerModalOpen = false;

function openAddPlayerModal() {
  if (addPlayerModalOpen) return;
  addPlayerModalOpen = true;
  syncAddedPesdbIds();
  reloadCatalog();
  document.getElementById("addPlayerOverlay")?.classList.add("open");
  document.body.style.overflow = "hidden";
  setTimeout(() => document.getElementById("apSearch")?.focus(), 100);
}

function closeAddPlayerModal() {
  addPlayerModalOpen = false;
  closeDdPanel("sortPanel",   "sortDropBtn");
  closeDdPanel("filterPanel", "filterDropBtn");
  document.getElementById("addPlayerOverlay")?.classList.remove("open");
  document.body.style.overflow = "";
  renderSquad();
}

async function reloadCatalog() {
  const list = document.getElementById("catalogList");
  if (list) list.innerHTML = "";
  await fetchCatalog(true);
  renderCatalogList();
}

/* ──────────────── Player detail popup ──────────────── */
let popupCurrentPlayer = null;
let popupCurrentAddBtn = null;

function openPlayerPopup(player, rowAddBtn) {
  popupCurrentPlayer = player;
  popupCurrentAddBtn = rowAddBtn;

  const overlay = document.getElementById("playerPopupOverlay");
  const imgWrap = document.getElementById("playerPopupImg");
  const nameEl  = document.getElementById("playerPopupName");
  const clubEl  = document.getElementById("playerPopupClub");
  const statsEl = document.getElementById("playerPopupStats");
  const addBtn  = document.getElementById("playerPopupAdd");

  // Image
  imgWrap.innerHTML = "";
  imgWrap.classList.remove("no-img");
  const img = document.createElement("img");
  img.src     = CARD_IMG(player.id);
  img.alt     = player.name;
  img.onerror = () => { imgWrap.innerHTML = player.name[0] || "?"; imgWrap.classList.add("no-img"); };
  imgWrap.appendChild(img);

  nameEl.textContent = player.name;

  clubEl.innerHTML = `
    <span>${player.club || "—"}</span>
    ${player.nationality ? `<span class="pp-sep">·</span><span>${player.nationality}</span>` : ""}
  `;

  const parts = [];
  if (player.height)  parts.push(`<span>${player.height} cm</span>`);
  if (player.weight)  parts.push(`<span>${player.weight} kg</span>`);
  if (player.age)     parts.push(`<span>${player.age} yo</span>`);
  statsEl.innerHTML = parts.join('<span class="pp-sep"> · </span>');

  const fromSquad = (rowAddBtn === null);
  const isAdded   = fromSquad || catalog.addedPesdbIds.has(String(player.id));
  addBtn.disabled    = false;
  addBtn.textContent = fromSquad  ? "− REMOVE FROM TEAM"
    : isAdded ? "✓ IN TEAM — click to remove"
    : "+ ADD TO TEAM";
  addBtn.classList.toggle("added", isAdded);

  overlay.classList.add("open");
}

function closePlayerPopup() {
  document.getElementById("playerPopupOverlay")?.classList.remove("open");
  popupCurrentPlayer = null;
  popupCurrentAddBtn = null;
}

function initPlayerPopup() {
  document.getElementById("playerPopupClose")?.addEventListener("click", closePlayerPopup);
  document.getElementById("playerPopupOverlay")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("playerPopupOverlay")) closePlayerPopup();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePlayerPopup();
  });
  document.getElementById("playerPopupAdd")?.addEventListener("click", async () => {
    if (!popupCurrentPlayer) return;
    const addBtn = document.getElementById("playerPopupAdd");

    if (addBtn.classList.contains("added")) {
      // Remove from team
      addBtn.disabled = true;
      const ok = await removePlayerFromCatalog(popupCurrentPlayer, popupCurrentAddBtn);
      if (ok) {
        // If opened from squad card, close popup since player is gone
        if (!popupCurrentAddBtn) {
          closePlayerPopup();
        } else {
          addBtn.textContent = "+ ADD TO TEAM";
          addBtn.classList.remove("added");
          addBtn.disabled = false;
        }
      } else {
        addBtn.disabled = false;
      }
    } else {
      // Add to team
      addBtn.disabled = true;
      await addPlayerToSquad(popupCurrentPlayer, popupCurrentAddBtn);
      addBtn.textContent = "✓ IN TEAM — click to remove";
      addBtn.classList.add("added");
      addBtn.disabled = false;
    }
  });
}

function initAddPlayerModal() {
  const overlay    = document.getElementById("addPlayerOverlay");
  const closeBtn   = document.getElementById("addPlayerClose");
  const searchIn   = document.getElementById("apSearch");

  // Build & inject dropdown panels
  const sortWrap   = document.getElementById("sortDropWrap");
  const filterWrap = document.getElementById("filterDropWrap");
  if (sortWrap)   sortWrap.appendChild(buildSortPanel());
  if (filterWrap) filterWrap.appendChild(buildFilterPanel());

  // Reflect the default sort in the button label immediately
  updateSortUI();

  // Sort button toggle
  document.getElementById("sortDropBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDdPanel("sortPanel", "sortDropBtn", "filterPanel", "filterDropBtn");
  });

  // Direction toggle (outside dropdown)
  document.getElementById("sortDirBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSortDir();
  });

  // Filter button toggle
  document.getElementById("filterDropBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDdPanel("filterPanel", "filterDropBtn", "sortPanel", "sortDropBtn");
  });

  // Click inside a panel doesn't close it
  document.getElementById("sortPanel")?.addEventListener("click",   (e) => e.stopPropagation());
  document.getElementById("filterPanel")?.addEventListener("click", (e) => e.stopPropagation());

  // Click outside closes open panels
  document.addEventListener("click", () => {
    closeDdPanel("sortPanel",   "sortDropBtn");
    closeDdPanel("filterPanel", "filterDropBtn");
  });

  closeBtn?.addEventListener("click", closeAddPlayerModal);

  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) closeAddPlayerModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && addPlayerModalOpen) closeAddPlayerModal();
  });

  // Search
  let searchTimer = null;
  searchIn?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      catalog.query = searchIn.value.trim();
      reloadCatalog();
    }, 350);
  });

}

/* ============================================================
   Game Plans
   ============================================================ */
async function loadGamePlans(userId) {
  const grid = document.getElementById("plansGrid");
  if (!grid) return;

  grid.innerHTML = "";

  try {
    const res   = await fetch(`/api/game-plans?userId=${userId}`);
    const data  = await res.json();
    const plans = data.plans ?? [];

    grid.innerHTML = "";

    if (!plans.length) {
      grid.innerHTML = `
        <div class="plans-empty">
          <div class="plans-empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          </div>
          <h3>NO GAME PLANS YET</h3>
          <p>Create a game plan to organise your team for upcoming matches.</p>
        </div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    plans.forEach((plan) => {
      const card = document.createElement("div");
      card.className = "plan-card";
      card.innerHTML = `
        <div class="plan-formation">${plan.formation || "—"}</div>
        <div class="plan-name">${plan.name}</div>
        <div class="plan-date">${new Date(plan.created_at).toLocaleDateString()}</div>`;
      frag.appendChild(card);
    });
    grid.appendChild(frag);
  } catch {
    showToast("Could not load game plans.", "error");
  }
}

/* ============================================================
   Create Room Modal
   ============================================================ */
function genCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function initNumberPicker(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const dec = el.querySelector(".num-dec");
  const inc = el.querySelector(".num-inc");
  const val = el.querySelector(".num-val");
  const min = Number(el.dataset.min);
  const max = Number(el.dataset.max);
  let   cur = Number(el.dataset.val);

  function update() {
    val.textContent = cur;
    dec.disabled    = cur <= min;
    inc.disabled    = cur >= max;
    el.dataset.val  = cur;
  }
  dec?.addEventListener("click", () => { if (cur > min) { cur--; update(); } });
  inc?.addEventListener("click", () => { if (cur < max) { cur++; update(); } });
  update();
}

function initRoomModal() {
  const overlay   = document.getElementById("roomOverlay");
  const codeInput = document.getElementById("roomCode");

  if (!overlay) return;
  initNumberPicker("bansCounter");
  initNumberPicker("picksCounter");

  const open  = () => { if (codeInput) codeInput.value = genCode(); overlay.classList.add("open"); document.body.style.overflow = "hidden"; };
  const close = () => { overlay.classList.remove("open"); document.body.style.overflow = ""; };

  document.getElementById("openRoomBtn")?.addEventListener("click", open);
  document.getElementById("roomClose")?.addEventListener("click", close);
  document.getElementById("roomCancel")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open") && !addPlayerModalOpen) close();
  });

  document.getElementById("regenCode")?.addEventListener("click", () => { if (codeInput) codeInput.value = genCode(); });

  document.getElementById("copyCode")?.addEventListener("click", async () => {
    const code = codeInput?.value;
    if (!code) return;
    try { await navigator.clipboard.writeText(code); showToast("Room code copied!", "success"); }
    catch { showToast(code, "info"); }
  });

  document.getElementById("startRoomBtn")?.addEventListener("click", () => {
    const code  = codeInput?.value;
    const bans  = document.getElementById("bansCounter")?.dataset.val ?? 3;
    const picks = document.getElementById("picksCounter")?.dataset.val ?? 5;
    showToast(`Room ${code} — ${bans} bans, ${picks} picks per side`, "success");
    close();
  });
}

/* ============================================================
   Boot
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth();
  if (!user) return;

  initUserMenu(user);
  initTabs();
  initRoomModal();
  initAddPlayerModal();
  initSquadSearchSortFilter();
  initPlayerPopup();
  initSquadControls(user.id);

  await loadSquad(user.id);
  loadGamePlans(user.id);
});
