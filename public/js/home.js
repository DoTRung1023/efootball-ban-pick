/* ============================================================
   eFootball Ban & Pick — Home Page
   ============================================================ */

const CARD_IMG    = (id) => `/img/card/${id}.png`;
const ANON_PLAYER_IMG = "/img/anonymous_player.jpeg";
const PAGE_SIZE   = 50;
const POS_DEF     = ["CB","LB","RB"];
const POS_MID     = ["CMF","DMF", "RMF", "LMF", "AMF"];
const POS_FWD     = ["RWF","LWF","CF","SS"];

function makePlayerImg(src, alt = "Player image") {
  const img = document.createElement("img");
  img.src = src || ANON_PLAYER_IMG;
  img.alt = alt;
  img.loading = "lazy";
  img.addEventListener("error", () => {
    if (img.dataset.fallbackApplied === "1") {
      return;
    }
    img.dataset.fallbackApplied = "1";
    img.src = ANON_PLAYER_IMG;
  });
  return img;
}

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
   Confirm Dialog
   ============================================================ */
let _confirmResolve = null;

function showConfirm(message) {
  return new Promise((resolve) => {
    _confirmResolve = resolve;
    const overlay = document.getElementById("confirmOverlay");
    const msgEl   = document.getElementById("confirmMessage");
    if (msgEl) msgEl.textContent = message;
    overlay?.classList.add("open");
  });
}

function _closeConfirm(result) {
  document.getElementById("confirmOverlay")?.classList.remove("open");
  if (_confirmResolve) { _confirmResolve(result); _confirmResolve = null; }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("confirmOk")?.addEventListener("click",     () => _closeConfirm(true));
  document.getElementById("confirmCancel")?.addEventListener("click", () => _closeConfirm(false));
  document.getElementById("confirmOverlay")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("confirmOverlay")) _closeConfirm(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("confirmOverlay")?.classList.contains("open"))
      _closeConfirm(false);
  });
});

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

  document.getElementById("editProfileBtn")?.addEventListener("click", () => {
    menu?.classList.remove("open");
    trigger?.setAttribute("aria-expanded", "false");
    openEditProfile();
  });
}

/* ============================================================
   Edit Profile Modal
   ============================================================ */
function openEditProfile() {
  const user = getUser();
  if (!user) return;

  document.getElementById("epUsername").value = user.username || "";
  document.getElementById("epEmail").value    = user.email    || "";
  document.getElementById("epPassword").value = "";
  document.getElementById("epConfirm").value  = "";
  clearEpErrors();

  document.getElementById("epOverlay")?.classList.add("open");
}

function closeEditProfile() {
  document.getElementById("epOverlay")?.classList.remove("open");
}

function clearEpErrors() {
  ["epUsernameErr", "epEmailErr", "epPasswordErr", "epConfirmErr"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });
  ["epUsername", "epEmail", "epPassword", "epConfirm"].forEach((id) => {
    document.getElementById(id)?.classList.remove("error");
  });
}

function initEditProfile() {
  const overlay = document.getElementById("epOverlay");
  const form    = document.getElementById("epForm");

  document.getElementById("epClose")?.addEventListener("click", closeEditProfile);
  overlay?.addEventListener("click", (e) => { if (e.target === overlay) closeEditProfile(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay?.classList.contains("open")) closeEditProfile();
  });

  // Block copy/cut on password fields
  ["epPassword", "epConfirm"].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener("copy", (e) => e.preventDefault());
    el?.addEventListener("cut",  (e) => e.preventDefault());
  });

  // Password toggle
  document.getElementById("epPwToggle")?.addEventListener("click", () => {
    const inp = document.getElementById("epPassword");
    inp.type = inp.type === "password" ? "text" : "password";
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearEpErrors();

    const user     = getUser();
    if (!user) return;

    const username = document.getElementById("epUsername").value.trim();
    const email    = document.getElementById("epEmail").value.trim();
    const password = document.getElementById("epPassword").value;
    const confirm  = document.getElementById("epConfirm").value;
    const submit   = document.getElementById("epSubmit");

    // Client-side validation
    let valid = true;
    if (!username || username.length < 3) {
      document.getElementById("epUsernameErr").textContent = "Username must be at least 3 characters.";
      document.getElementById("epUsername").classList.add("error");
      valid = false;
    } else if (username.length > 50) {
      document.getElementById("epUsernameErr").textContent = "Username must be 50 characters or fewer.";
      document.getElementById("epUsername").classList.add("error");
      valid = false;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      document.getElementById("epEmailErr").textContent = "Enter a valid email address.";
      document.getElementById("epEmail").classList.add("error");
      valid = false;
    }
    if (password && password.length < 6) {
      document.getElementById("epPasswordErr").textContent = "Password must be at least 6 characters.";
      document.getElementById("epPassword").classList.add("error");
      valid = false;
    }
    if (password && password !== confirm) {
      document.getElementById("epConfirmErr").textContent = "Passwords do not match.";
      document.getElementById("epConfirm").classList.add("error");
      valid = false;
    }
    if (!valid) return;

    submit.disabled = true;
    submit.textContent = "SAVING…";

    try {
      const body = { userId: user.id, username, email };
      if (password) body.password = password;

      const res  = await fetch("/api/profile", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        const errEl = data.field
          ? document.getElementById(`ep${data.field.charAt(0).toUpperCase() + data.field.slice(1)}Err`)
          : null;
        if (errEl) {
          errEl.textContent = data.error;
          document.getElementById(`ep${data.field.charAt(0).toUpperCase() + data.field.slice(1)}`)?.classList.add("error");
        } else {
          showToast(data.error || "Something went wrong.", "error");
        }
        return;
      }

      // Persist updated user info
      const updated = { ...user, ...data.user };
      localStorage.setItem("efb_user", JSON.stringify(updated));

      // Refresh displayed name & email in nav
      document.getElementById("userName").textContent   = updated.username;
      document.getElementById("dropUsername").textContent = updated.username;
      document.getElementById("dropEmail").textContent    = updated.email;

      showToast("Profile updated successfully.");
      closeEditProfile();
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      submit.disabled = false;
      submit.textContent = "SAVE CHANGES";
    }
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
const POSITION_LINE_ORDER = ["CF", "SS", "RWF", "LWF", "AMF", "RMF", "LMF", "CMF", "DMF", "RB", "LB", "CB", "GK"];

function positionLineRank(pos) {
  const p = String(pos || "").toUpperCase().trim();
  const i = POSITION_LINE_ORDER.indexOf(p);
  return i === -1 ? POSITION_LINE_ORDER.length : i;
}

/** When the primary sort key ties, order by overall (highest first), then name. */
function tiebreakOverallDescThenName(a, b) {
  const oa = Number(a.overall ?? -1);
  const ob = Number(b.overall ?? -1);
  if (ob !== oa) return ob - oa;
  return (a.name || "").localeCompare(b.name || "");
}

/** Max OVR for sorting; falls back to level-1 overall when max is unknown. */
function ovrMaxForSort(p) {
  const mx = p?.overall_max;
  if (mx != null && Number.isFinite(Number(mx))) return Number(mx);
  if (p?.overall != null && Number.isFinite(Number(p.overall))) return Number(p.overall);
  return -1;
}

/** When overall rating ties: line order CF→…→GK, then name. */
function tiebreakPositionLineThenName(a, b) {
  const ra = positionLineRank(a.position);
  const rb = positionLineRank(b.position);
  if (ra !== rb) return ra - rb;
  return (a.name || "").localeCompare(b.name || "");
}

function compareByPositionLine(a, b, forwardCfToGk) {
  const ra = positionLineRank(a.position);
  const rb = positionLineRank(b.position);
  if (ra !== rb) return forwardCfToGk ? ra - rb : rb - ra;
  return tiebreakOverallDescThenName(a, b);
}

const SQUAD_SORT_MAP = {
  overall_max: { desc: (a,b) => { const c = ovrMaxForSort(b) - ovrMaxForSort(a); return c !== 0 ? c : tiebreakPositionLineThenName(a, b); },
                  asc:  (a,b) => { const c = ovrMaxForSort(a) - ovrMaxForSort(b); return c !== 0 ? c : tiebreakPositionLineThenName(a, b); } },
  overall:  { desc: (a,b) => { const c = (b.overall||0)-(a.overall||0); return c !== 0 ? c : tiebreakPositionLineThenName(a, b); },
              asc:  (a,b) => { const c = (a.overall||0)-(b.overall||0); return c !== 0 ? c : tiebreakPositionLineThenName(a, b); } },
  name:     { asc:  (a,b) => { const c = a.name.localeCompare(b.name);   return c !== 0 ? c : tiebreakOverallDescThenName(a, b); },
              desc: (a,b) => { const c = b.name.localeCompare(a.name);   return c !== 0 ? c : tiebreakOverallDescThenName(a, b); } },
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
async function loadSquad(userId) {
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
  card.title = player.name || "";
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
  const cb = document.createElement("div");
  cb.className = "pc-checkbox";
  cb.addEventListener("click", (e) => e.stopPropagation());
  imgWrap.appendChild(cb);

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
    || squad.filterFoot.size || squad.filterPlayingStyle.size || squad.filterCardType.size || squad.filterLeague.size
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
      <div class="filter-section-label">FOOT</div>
      <div class="pos-multiselect" id="sqfFootMs">
        <button class="pos-ms-btn" id="sqfFootMsBtn" type="button">
          <span id="sqfFootMsLabel">Any foot</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="sqfFootMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">PLAYING STYLE</div>
      <div class="pos-multiselect" id="sqfPsMs">
        <button class="pos-ms-btn" id="sqfPsMsBtn" type="button">
          <span id="sqfPsMsLabel">Any playing style</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="sqfPsMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">CARD TYPE</div>
      <div class="pos-multiselect" id="sqfCtMs">
        <button class="pos-ms-btn" id="sqfCtMsBtn" type="button">
          <span id="sqfCtMsLabel">Any card type</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="sqfCtMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">LEAGUE</div>
      <div class="pos-multiselect" id="sqfLgMs">
        <button class="pos-ms-btn" id="sqfLgMsBtn" type="button">
          <span id="sqfLgMsLabel">Any league</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="sqfLgMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">OVERALL LEVEL 1</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="sqfOvrMin" placeholder="Min" value="${squad.filterOverallMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="sqfOvrMax" placeholder="Max" value="${squad.filterOverallMax}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">OVERALL MAX</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="sqfOvrMaxMin" placeholder="Min" value="${squad.filterMaxOverallMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="sqfOvrMaxMax" placeholder="Max" value="${squad.filterMaxOverallMax}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">CLUB</div>
      <div class="autocomplete-wrap">
        <input type="text" class="filter-input" id="sqfClub" placeholder="e.g. FC Barcelona" value="${squad.filterClub}" autocomplete="off">
        <div class="autocomplete-list" id="sqfClubAc"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">NATIONALITY</div>
      <div class="autocomplete-wrap">
        <input type="text" class="filter-input" id="sqfNation" placeholder="e.g. Brazil" value="${squad.filterNation}" autocomplete="off">
        <div class="autocomplete-list" id="sqfNationAc"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">HEIGHT (cm)</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="sqfHeightMin" placeholder="Min" value="${squad.filterHeightMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="sqfHeightMax" placeholder="Max" value="${squad.filterHeightMax}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">WEIGHT (kg)</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="sqfWeightMin" placeholder="Min" value="${squad.filterWeightMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="sqfWeightMax" placeholder="Max" value="${squad.filterWeightMax}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">AGE</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="sqfAgeMin" placeholder="Min" value="${squad.filterAgeMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="sqfAgeMax" placeholder="Max" value="${squad.filterAgeMax}">
      </div>
    </div>
    <div class="filter-section">
      <button class="filter-clear-btn" id="squadClearFiltersBtn">CLEAR ALL FILTERS</button>
    </div>
  `;

  // Position multi-select
  const msPanel = panel.querySelector("#squadPosMsPanel");
  const msBtn   = panel.querySelector("#squadPosMsBtn");
  const msLabel = panel.querySelector("#squadPosMsLabel");

  function updatePosLabel() {
    const sel = [...squad.filterPositions];
    msLabel.textContent = sel.length === 0 ? "All positions"
      : sel.length <= 7 ? sel.join(", ")
      : `${sel.slice(0, 7).join(", ")} +${sel.length - 7}`;
    msBtn.classList.toggle("has-pos-filter", sel.length > 0);
  }

  SQUAD_POSITIONS.forEach(pos => {
    const item = document.createElement("div");
    item.className   = `pos-ms-item${squad.filterPositions.has(pos) ? " checked" : ""}`;
    item.dataset.pos = pos;
    item.innerHTML   = `<span class="pos-ms-check"></span><span>${pos}</span>`;
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
    msPanel.classList.toggle("open");
    msBtn.classList.toggle("open", msPanel.classList.contains("open"));
  });
  document.addEventListener("click", () => msPanel.classList.remove("open"));
  msPanel.addEventListener("click", e => e.stopPropagation());
  updatePosLabel();

  // Debounced text inputs
  let sqfTimer = null;
  function onSqfInput(id, key) {
    const el = panel.querySelector(`#${id}`);
    el?.addEventListener("input", () => {
      clearTimeout(sqfTimer);
      squad[key] = el.value.trim();
      sqfTimer = setTimeout(() => { updateSquadFilterDot(); renderSquad(); }, 300);
    });
  }
  onSqfInput("sqfClub",      "filterClub");
  onSqfInput("sqfNation",    "filterNation");
  onSqfInput("sqfOvrMin",    "filterOverallMin");
  onSqfInput("sqfOvrMax",    "filterOverallMax");
  onSqfInput("sqfOvrMaxMin", "filterMaxOverallMin");
  onSqfInput("sqfOvrMaxMax", "filterMaxOverallMax");
  onSqfInput("sqfHeightMin", "filterHeightMin");
  onSqfInput("sqfHeightMax", "filterHeightMax");
  onSqfInput("sqfWeightMin", "filterWeightMin");
  onSqfInput("sqfWeightMax", "filterWeightMax");
  onSqfInput("sqfAgeMin",    "filterAgeMin");
  onSqfInput("sqfAgeMax",    "filterAgeMax");

  const runSquadMs = (o) =>
    wireAttributeMultiselects(panel, o, [
      {
        optionsKey: "foot",
        stateSet: squad.filterFoot,
        panelSel: "#sqfFootMsPanel",
        btnSel: "#sqfFootMsBtn",
        labelSel: "#sqfFootMsLabel",
        allLabel: "Any foot",
        onChange: () => { updateSquadFilterDot(); renderSquad(); },
      },
      {
        optionsKey: "playing_style",
        stateSet: squad.filterPlayingStyle,
        panelSel: "#sqfPsMsPanel",
        btnSel: "#sqfPsMsBtn",
        labelSel: "#sqfPsMsLabel",
        allLabel: "Any playing style",
        onChange: () => { updateSquadFilterDot(); renderSquad(); },
      },
      {
        optionsKey: "card_type",
        stateSet: squad.filterCardType,
        panelSel: "#sqfCtMsPanel",
        btnSel: "#sqfCtMsBtn",
        labelSel: "#sqfCtMsLabel",
        allLabel: "Any card type",
        onChange: () => { updateSquadFilterDot(); renderSquad(); },
      },
      {
        optionsKey: "league",
        stateSet: squad.filterLeague,
        panelSel: "#sqfLgMsPanel",
        btnSel: "#sqfLgMsBtn",
        labelSel: "#sqfLgMsLabel",
        allLabel: "Any league",
        onChange: () => { updateSquadFilterDot(); renderSquad(); },
      },
    ]);
  if (playerFilterOptionsCache) runSquadMs(playerFilterOptionsCache);
  else getPlayerFilterOptions().then(runSquadMs);

  // Autocomplete for club & nationality
  initAutocomplete(panel.querySelector("#sqfClub"), panel.querySelector("#sqfClubAc"), "club", (val) => {
    squad.filterClub = val;
    updateSquadFilterDot();
    renderSquad();
  });
  initAutocomplete(panel.querySelector("#sqfNation"), panel.querySelector("#sqfNationAc"), "nationality", (val) => {
    squad.filterNation = val;
    updateSquadFilterDot();
    renderSquad();
  });

  // Clear all
  panel.querySelector("#squadClearFiltersBtn")?.addEventListener("click", () => {
    squad.filterPositions.clear();
    squad.filterFoot.clear();
    squad.filterPlayingStyle.clear();
    squad.filterCardType.clear();
    squad.filterLeague.clear();
    squad.filterClub = squad.filterNation = "";
    squad.filterOverallMin = squad.filterOverallMax = "";
    squad.filterMaxOverallMin = squad.filterMaxOverallMax = "";
    squad.filterHeightMin = squad.filterHeightMax = "";
    squad.filterWeightMin = squad.filterWeightMax = "";
    squad.filterAgeMin    = squad.filterAgeMax    = "";
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
// descVal / ascVal map to server SORT_MAP; descTip / ascTip are shown on the direction button
const SORT_CATEGORIES = [
  { key: "overall_max", label: "Overall Max",       descVal: "overall_max_desc", ascVal: "overall_max_asc", bidir: true,  descTip: "Highest max rating first", ascTip: "Lowest max rating first" },
  { key: "overall",     label: "Overall Level 1",   descVal: "overall_desc",     ascVal: "overall_asc",     bidir: true,  descTip: "Highest Level 1 first",    ascTip: "Lowest Level 1 first"    },
  { key: "name",        label: "Player Name",    descVal: "name_asc",        ascVal: "name_desc",       bidir: true,  descTip: "A → Z",                 ascTip: "Z → A"                 },
  { key: "position",    label: "Position",       descVal: "position_asc",    ascVal: "position_desc",   bidir: true,  descTip: "CF → SS → … → GK",     ascTip: "GK → … → SS → CF"       },
  { key: "height",      label: "Height",         descVal: "height_desc",     ascVal: "height_asc",      bidir: true,  descTip: "Tallest first",          ascTip: "Shortest first"        },
  { key: "weight",      label: "Weight",         descVal: "weight_desc",     ascVal: "weight_asc",      bidir: true,  descTip: "Heaviest first",         ascTip: "Lightest first"        },
  { key: "age",         label: "Age",            descVal: "age_desc",        ascVal: "age_asc",         bidir: true,  descTip: "Oldest first",           ascTip: "Youngest first"        },
  { key: "club",        label: "Club",           descVal: "club_asc",        ascVal: "club_desc",       bidir: true,  descTip: "A → Z (club)",          ascTip: "Z → A (club)"          },
  { key: "nationality", label: "Nationality",    descVal: "nationality_asc", ascVal: "nationality_desc", bidir: true, descTip: "A → Z (nationality)", ascTip: "Z → A (nationality)" },
];

const catalog = {
  players:       [],
  offset:        0,
  query:         "",
  filterPositions: new Set(),
  filterFoot:          new Set(),
  filterPlayingStyle:  new Set(),
  filterCardType:      new Set(),
  filterLeague:        new Set(),
  sortCategory:  "overall_max",
  sortDir:       "desc",
  sortBy:        "overall_max_desc",
  filterClub:       "",
  filterNation:     "",
  filterOverallMin:     "",
  filterOverallMax:     "",
  filterMaxOverallMin:  "",
  filterMaxOverallMax:  "",
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

let playerFilterOptionsCache = null;

async function getPlayerFilterOptions() {
  if (playerFilterOptionsCache) return playerFilterOptionsCache;
  try {
    const res = await fetch("/api/players/filter-options");
    playerFilterOptionsCache = res.ok ? await res.json() : null;
  } catch {
    playerFilterOptionsCache = null;
  }
  if (!playerFilterOptionsCache) {
    playerFilterOptionsCache = { foot: [], playing_style: [], card_type: [], league: [] };
  }
  return playerFilterOptionsCache;
}

/** Multiselect dropdowns backed by distinct catalog values (foot, style, card type, league). */
function wireAttributeMultiselects(panel, optionsByKey, configs) {
  for (const cfg of configs) {
    const values = optionsByKey[cfg.optionsKey] ?? [];
    const msPanel = panel.querySelector(cfg.panelSel);
    const msBtn = panel.querySelector(cfg.btnSel);
    const msLabel = panel.querySelector(cfg.labelSel);
    if (!msPanel || !msBtn || !msLabel) continue;

    const stateSet = cfg.stateSet;
    msPanel.innerHTML = "";

    function updateLabel() {
      const sel = [...stateSet];
      msLabel.textContent =
        sel.length === 0
          ? cfg.allLabel
          : sel.length <= 3
            ? sel.join(", ")
            : `${sel.slice(0, 3).join(", ")} +${sel.length - 3}`;
      msBtn.classList.toggle("has-pos-filter", sel.length > 0);
    }

    values.forEach((val) => {
      const item = document.createElement("div");
      item.className = `pos-ms-item${stateSet.has(val) ? " checked" : ""}`;
      item.innerHTML = `<span class="pos-ms-check"></span><span>${escapeHtml(val)}</span>`;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        if (stateSet.has(val)) {
          stateSet.delete(val);
          item.classList.remove("checked");
        } else {
          stateSet.add(val);
          item.classList.add("checked");
        }
        updateLabel();
        cfg.onChange();
      });
      msPanel.appendChild(item);
    });

    msBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = msPanel.classList.toggle("open");
      msBtn.classList.toggle("open", open);
    });
    document.addEventListener("click", () => {
      msPanel.classList.remove("open");
      msBtn.classList.remove("open");
    });
    msPanel.addEventListener("click", (e) => e.stopPropagation());

    updateLabel();
  }
}

function hasActiveFilters() {
  return catalog.filterPositions.size || catalog.filterFoot.size || catalog.filterPlayingStyle.size
    || catalog.filterCardType.size || catalog.filterLeague.size
    || catalog.filterClub || catalog.filterNation
    || catalog.filterOverallMin || catalog.filterOverallMax
    || catalog.filterMaxOverallMin || catalog.filterMaxOverallMax
    || catalog.filterHeightMin || catalog.filterHeightMax
    || catalog.filterWeightMin || catalog.filterWeightMax
    || catalog.filterAgeMin    || catalog.filterAgeMax;
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
  if (!cat) return "overall_max_desc";
  return catalog.sortDir === "asc" ? cat.ascVal : cat.descVal;
}

function applySort(categoryKey) {
  catalog.sortCategory = categoryKey;
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
  if (btn)     btn.classList.toggle("has-active", catalog.sortCategory !== "overall_max" || catalog.sortDir !== "desc");

  if (dirBtn && dirIcon) {
    dirBtn.style.display = "flex";
    dirIcon.textContent  = catalog.sortDir === "desc" ? "↓" : "↑";
    dirBtn.title = cat
      ? (catalog.sortDir === "desc" ? cat.descTip : cat.ascTip)
      : "Toggle sort direction";
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
  if (catalog.filterFoot.size)         params.set("foot",         [...catalog.filterFoot].join(","));
  if (catalog.filterPlayingStyle.size)  params.set("playingStyle", [...catalog.filterPlayingStyle].join(","));
  if (catalog.filterCardType.size)      params.set("cardType",     [...catalog.filterCardType].join(","));
  if (catalog.filterLeague.size)        params.set("league",       [...catalog.filterLeague].join(","));
  if (catalog.filterOverallMin)        params.set("overallMin",        catalog.filterOverallMin);
  if (catalog.filterOverallMax)        params.set("overallMax",        catalog.filterOverallMax);
  if (catalog.filterMaxOverallMin)     params.set("maxOverallMin",     catalog.filterMaxOverallMin);
  if (catalog.filterMaxOverallMax)     params.set("maxOverallMax",     catalog.filterMaxOverallMax);

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
  imgWrap.appendChild(makePlayerImg(CARD_IMG(player.id), player.name));

  const info = document.createElement("div");
  info.className = "cr-info";
  info.innerHTML = `
    <div class="cr-name">${escapeHtml(player.name)}</div>
    <div class="cr-detail">${playerDetailSublineHtml(player)}</div>
  `;

  const pos = document.createElement("span");
  pos.className   = `cr-pos ${posClass(player.position)}`;
  pos.textContent = player.position || "?";

  const ovr = document.createElement("span");
  ovr.className = `cr-ovr${hasFullOvrPair(player) ? " cr-ovr-dual" : ""}`;
  ovr.innerHTML = ovrPairInnerHtml(player);

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
      if (res.status === 409) { showToast("Already in your players.", "error"); markAdded(btn, player.id); }
      else { showToast(data.error || "Could not add player.", "error"); btn.disabled = false; }
      return;
    }

    squad.players.push({
      id:             data.id,
      name:           player.name,
      position:       player.position,
      club:           player.club,
      league:         player.league ?? null,
      overall:        player.overall,
      overall_max:    player.overall_max ?? null,
      pesdb_id:       player.id,
      nationality:    player.nationality ?? null,
      region:         player.region ?? null,
      card_type:      player.card_type ?? null,
      foot:           player.foot ?? null,
      playing_style:  player.playing_style ?? null,
      height:         player.height ?? null,
      weight:         player.weight ?? null,
      age:            player.age ?? null,
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
      <div class="filter-section-label">FOOT</div>
      <div class="pos-multiselect" id="fcFootMs">
        <button class="pos-ms-btn" id="fcFootMsBtn" type="button">
          <span id="fcFootMsLabel">Any foot</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="fcFootMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">PLAYING STYLE</div>
      <div class="pos-multiselect" id="fcPsMs">
        <button class="pos-ms-btn" id="fcPsMsBtn" type="button">
          <span id="fcPsMsLabel">Any playing style</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="fcPsMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">CARD TYPE</div>
      <div class="pos-multiselect" id="fcCtMs">
        <button class="pos-ms-btn" id="fcCtMsBtn" type="button">
          <span id="fcCtMsLabel">Any card type</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="fcCtMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">LEAGUE</div>
      <div class="pos-multiselect" id="fcLgMs">
        <button class="pos-ms-btn" id="fcLgMsBtn" type="button">
          <span id="fcLgMsLabel">Any league</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="fcLgMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">OVERALL LEVEL 1</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="fcOvrMin" placeholder="Min" value="${catalog.filterOverallMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="fcOvrMax" placeholder="Max" value="${catalog.filterOverallMax}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">OVERALL MAX</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="fcOvrMaxMin" placeholder="Min" value="${catalog.filterMaxOverallMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="fcOvrMaxMax" placeholder="Max" value="${catalog.filterMaxOverallMax}">
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
  onFilterInput("fcOvrMin",    "filterOverallMin");
  onFilterInput("fcOvrMax",    "filterOverallMax");
  onFilterInput("fcOvrMaxMin", "filterMaxOverallMin");
  onFilterInput("fcOvrMaxMax", "filterMaxOverallMax");
  onFilterInput("fcHeightMin", "filterHeightMin");
  onFilterInput("fcHeightMax", "filterHeightMax");
  onFilterInput("fcWeightMin", "filterWeightMin");
  onFilterInput("fcWeightMax", "filterWeightMax");
  onFilterInput("fcAgeMin",    "filterAgeMin");
  onFilterInput("fcAgeMax",    "filterAgeMax");

  const runCatMs = (o) =>
    wireAttributeMultiselects(panel, o, [
      {
        optionsKey: "foot",
        stateSet: catalog.filterFoot,
        panelSel: "#fcFootMsPanel",
        btnSel: "#fcFootMsBtn",
        labelSel: "#fcFootMsLabel",
        allLabel: "Any foot",
        onChange: () => { updateFilterBadge(); reloadCatalog(); },
      },
      {
        optionsKey: "playing_style",
        stateSet: catalog.filterPlayingStyle,
        panelSel: "#fcPsMsPanel",
        btnSel: "#fcPsMsBtn",
        labelSel: "#fcPsMsLabel",
        allLabel: "Any playing style",
        onChange: () => { updateFilterBadge(); reloadCatalog(); },
      },
      {
        optionsKey: "card_type",
        stateSet: catalog.filterCardType,
        panelSel: "#fcCtMsPanel",
        btnSel: "#fcCtMsBtn",
        labelSel: "#fcCtMsLabel",
        allLabel: "Any card type",
        onChange: () => { updateFilterBadge(); reloadCatalog(); },
      },
      {
        optionsKey: "league",
        stateSet: catalog.filterLeague,
        panelSel: "#fcLgMsPanel",
        btnSel: "#fcLgMsBtn",
        labelSel: "#fcLgMsLabel",
        allLabel: "Any league",
        onChange: () => { updateFilterBadge(); reloadCatalog(); },
      },
    ]);
  if (playerFilterOptionsCache) runCatMs(playerFilterOptionsCache);
  else getPlayerFilterOptions().then(runCatMs);

  // Clear all
  panel.querySelector("#clearFiltersBtn")?.addEventListener("click", () => {
    catalog.filterPositions.clear();
    catalog.filterFoot.clear();
    catalog.filterPlayingStyle.clear();
    catalog.filterCardType.clear();
    catalog.filterLeague.clear();
    catalog.filterClub = catalog.filterNation = "";
    catalog.filterOverallMin = catalog.filterOverallMax = "";
    catalog.filterMaxOverallMin = catalog.filterMaxOverallMax = "";
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
  getPlayerFilterOptions();
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
  const ovrEl   = document.getElementById("playerPopupOvr");
  const addBtn  = document.getElementById("playerPopupAdd");

  // Image
  imgWrap.innerHTML = "";
  imgWrap.classList.remove("no-img");
  imgWrap.appendChild(makePlayerImg(player.id ? CARD_IMG(player.id) : ANON_PLAYER_IMG, player.name));

  nameEl.textContent = player.name;

  clubEl.innerHTML = playerDetailSublineHtml(player);

  if (ovrEl) ovrEl.innerHTML = "";

  statsEl.innerHTML = "";

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

const DEFAULT_FORMATION = "4-3-3";

// Pitch rows: top (attack) → mid → defense → GK (bottom). Slots 1–11 map to lineup positions.
const FORMATION_LAYOUTS = {
  "4-3-3": [
    { id: "pitchRowFwd", slots: [9, 10, 11] },
    { id: "pitchRowMid", slots: [6, 7, 8] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "4-4-2": [
    { id: "pitchRowFwd", slots: [10, 11] },
    { id: "pitchRowMid", slots: [6, 7, 8, 9] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "4-5-1": [
    { id: "pitchRowFwd", slots: [11] },
    { id: "pitchRowMid", slots: [6, 7, 8, 9, 10] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "3-6-1": [
    { id: "pitchRowFwd", slots: [11] },
    { id: "pitchRowMid", slots: [5, 6, 7, 8, 9, 10] },
    { id: "pitchRowDef", slots: [2, 3, 4] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "3-4-3": [
    { id: "pitchRowFwd", slots: [9, 10, 11] },
    { id: "pitchRowMid", slots: [5, 6, 7, 8] },
    { id: "pitchRowDef", slots: [2, 3, 4] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "3-5-2": [
    { id: "pitchRowFwd", slots: [10, 11] },
    { id: "pitchRowMid", slots: [5, 6, 7, 8, 9] },
    { id: "pitchRowDef", slots: [2, 3, 4] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "5-2-3": [
    { id: "pitchRowFwd", slots: [9, 10, 11] },
    { id: "pitchRowMid", slots: [7, 8] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5, 6] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "5-3-2": [
    { id: "pitchRowFwd", slots: [10, 11] },
    { id: "pitchRowMid", slots: [7, 8, 9] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5, 6] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "5-4-1": [
    { id: "pitchRowFwd", slots: [11] },
    { id: "pitchRowMid", slots: [7, 8, 9, 10] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5, 6] },
    { id: "pitchRowGk", slots: [1] },
  ],
};

function normalizeFormation(f) {
  const s = f == null ? "" : String(f);
  return FORMATION_LAYOUTS[s] ? s : DEFAULT_FORMATION;
}

function getPitchLayout() {
  return FORMATION_LAYOUTS[normalizeFormation(gamePlans.formation)] ?? FORMATION_LAYOUTS[DEFAULT_FORMATION];
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
  ppState.filterClub      = "";
  ppState.filterNation    = "";
  ppState.filterOverallMin = ppState.filterOverallMax = "";
  ppState.filterMaxOverallMin = ppState.filterMaxOverallMax = "";
  ppState.filterHeightMin = ppState.filterHeightMax = "";
  ppState.filterWeightMin = ppState.filterWeightMax = "";
  ppState.filterAgeMin    = ppState.filterAgeMax    = "";
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

/**
 * Stacked lines (each "/" in the spec = newline): region - country; league - club; foot - style; H - W - age.
 * Hyphens only within a line. Catalog, popup, plan picker, squad footer.
 */
function playerDetailSublineHtml(player) {
  const h = (s) => (s != null && String(s).trim() ? escapeHtml(String(s).trim()) : "");
  const hyph = `<span class="pmeta-sep pmeta-hyphen"> - </span>`;

  function dashLine(...raw) {
    const bits = raw
      .filter((v) => v != null && String(v).trim())
      .map((v) => h(String(v).trim()));
    return bits.length ? bits.join(hyph) : "";
  }

  const phys = [
    player.height ? `${player.height} cm` : null,
    player.weight ? `${player.weight} kg` : null,
    player.age ? `${player.age} yo` : null,
  ];

  const rows = [
    dashLine(player.region, player.nationality),
    dashLine(player.league, player.club),
    dashLine(player.foot, player.playing_style),
    dashLine(...phys),
  ].filter(Boolean);

  if (!rows.length) {
    return `<div class="pmeta-stack"><div class="pmeta-row pmeta-empty">—</div></div>`;
  }
  return `<div class="pmeta-stack">${rows.map((line) => `<div class="pmeta-row">${line}</div>`).join("")}</div>`;
}

/** Both ratings known — show level 1 and max side by side (compact layout in catalog rows). */
function hasFullOvrPair(p) {
  return p?.overall != null && p?.overall_max != null;
}

/** HTML snippet: Level 1 and max OVR (uses overall + overall_max from API). */
function ovrPairInnerHtml(p) {
  if (p?.overall == null && p?.overall_max == null) return "—";
  if (hasFullOvrPair(p)) {
    return (
      `<span class="ovr-pair" title="Level 1 / Max level">` +
      `<span class="ovr-l1">${escapeHtml(String(p.overall))}</span>` +
      `<span class="ovr-slash">/</span>` +
      `<span class="ovr-max">${escapeHtml(String(p.overall_max))}</span>` +
      `</span>`
    );
  }
  if (p?.overall != null) return escapeHtml(String(p.overall));
  return escapeHtml(String(p.overall_max ?? ""));
}

async function loadGamePlans(userId) {
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

function selectPlanSlot(slot) {
  const pendingId = gamePlans.pickerPendingPlayerId;
  if (pendingId != null) {
    const player = squad.players.find((x) => Number(x.id) === Number(pendingId));
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
    || ppState.filterPlayingStyle.size || ppState.filterCardType.size || ppState.filterLeague.size
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

function buildPpFilterPanel() {
  const panel = document.createElement("div");
  panel.className = "ap-dd-panel filter-dd-panel";
  panel.id = "ppFilterPanel";

  const POS_LIST = ["GK","CB","LB","RB","DMF","CMF","LMF","RMF","AMF","LWF","RWF","SS","CF"];

  panel.innerHTML = `
    <div class="filter-section">
      <div class="filter-section-label">POSITION</div>
      <div class="pos-multiselect" id="ppPosMs">
        <button class="pos-ms-btn" id="ppPosMsBtn" type="button">
          <span id="ppPosMsLabel">All positions</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="ppPosMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">FOOT</div>
      <div class="pos-multiselect" id="ppFootMs">
        <button class="pos-ms-btn" id="ppFootMsBtn" type="button">
          <span id="ppFootMsLabel">Any foot</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="ppFootMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">PLAYING STYLE</div>
      <div class="pos-multiselect" id="ppPsMs">
        <button class="pos-ms-btn" id="ppPsMsBtn" type="button">
          <span id="ppPsMsLabel">Any playing style</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="ppPsMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">CARD TYPE</div>
      <div class="pos-multiselect" id="ppCtMs">
        <button class="pos-ms-btn" id="ppCtMsBtn" type="button">
          <span id="ppCtMsLabel">Any card type</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="ppCtMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">LEAGUE</div>
      <div class="pos-multiselect" id="ppLgMs">
        <button class="pos-ms-btn" id="ppLgMsBtn" type="button">
          <span id="ppLgMsLabel">Any league</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="ppLgMsPanel"></div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">OVERALL LEVEL 1</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="ppFcOvrMin" placeholder="Min" value="${ppState.filterOverallMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="ppFcOvrMax" placeholder="Max" value="${ppState.filterOverallMax}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">OVERALL MAX</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="ppFcOvrMaxMin" placeholder="Min" value="${ppState.filterMaxOverallMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="ppFcOvrMaxMax" placeholder="Max" value="${ppState.filterMaxOverallMax}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">CLUB</div>
      <input type="text" class="filter-input" id="ppFcClub" placeholder="e.g. FC Barcelona" value="${ppState.filterClub}" autocomplete="off">
    </div>
    <div class="filter-section">
      <div class="filter-section-label">NATIONALITY</div>
      <input type="text" class="filter-input" id="ppFcNation" placeholder="e.g. Brazil" value="${ppState.filterNation}" autocomplete="off">
    </div>
    <div class="filter-section">
      <div class="filter-section-label">HEIGHT (cm)</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="ppFcHMin" placeholder="Min" value="${ppState.filterHeightMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="ppFcHMax" placeholder="Max" value="${ppState.filterHeightMax}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">WEIGHT (kg)</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="ppFcWMin" placeholder="Min" value="${ppState.filterWeightMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="ppFcWMax" placeholder="Max" value="${ppState.filterWeightMax}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">AGE</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="ppFcAMin" placeholder="Min" value="${ppState.filterAgeMin}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="ppFcAMax" placeholder="Max" value="${ppState.filterAgeMax}">
      </div>
    </div>
    <div class="filter-section">
      <button class="filter-clear-btn" id="ppClearFilters">CLEAR ALL FILTERS</button>
    </div>`;

  const msPanel = panel.querySelector("#ppPosMsPanel");
  const msBtn   = panel.querySelector("#ppPosMsBtn");
  const msLabel = panel.querySelector("#ppPosMsLabel");

  function updatePosLabel() {
    const sel = [...ppState.filterPositions];
    msLabel.textContent = sel.length === 0 ? "All positions"
      : sel.length <= 5 ? sel.join(", ")
      : `${sel.slice(0,5).join(", ")} +${sel.length - 5}`;
    msBtn.classList.toggle("has-pos-filter", sel.length > 0);
  }

  POS_LIST.forEach((pos) => {
    const item = document.createElement("div");
    item.className   = `pos-ms-item${ppState.filterPositions.has(pos) ? " checked" : ""}`;
    item.dataset.pos = pos;
    item.innerHTML   = `<span class="pos-ms-check"></span><span>${pos}</span>`;
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      if (ppState.filterPositions.has(pos)) { ppState.filterPositions.delete(pos); item.classList.remove("checked"); }
      else { ppState.filterPositions.add(pos); item.classList.add("checked"); }
      updatePosLabel();
      updatePpFilterDot();
      renderPlanPicker();
    });
    msPanel.appendChild(item);
  });

  msBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = msPanel.classList.toggle("open");
    msBtn.classList.toggle("open", open);
  });
  document.addEventListener("click", () => msPanel.classList.remove("open"));
  msPanel.addEventListener("click", (e) => e.stopPropagation());
  updatePosLabel();

  let ft = null;
  function onIn(id, key) {
    const el = panel.querySelector(`#${id}`);
    el?.addEventListener("input", () => {
      clearTimeout(ft);
      ppState[key] = el.value.trim();
      ft = setTimeout(() => { updatePpFilterDot(); renderPlanPicker(); }, 300);
    });
  }
  onIn("ppFcClub",  "filterClub");   onIn("ppFcNation", "filterNation");
  onIn("ppFcOvrMin", "filterOverallMin"); onIn("ppFcOvrMax", "filterOverallMax");
  onIn("ppFcOvrMaxMin", "filterMaxOverallMin"); onIn("ppFcOvrMaxMax", "filterMaxOverallMax");
  onIn("ppFcHMin",  "filterHeightMin"); onIn("ppFcHMax", "filterHeightMax");
  onIn("ppFcWMin",  "filterWeightMin"); onIn("ppFcWMax", "filterWeightMax");
  onIn("ppFcAMin",  "filterAgeMin");    onIn("ppFcAMax", "filterAgeMax");

  const runPpMs = (o) =>
    wireAttributeMultiselects(panel, o, [
      {
        optionsKey: "foot",
        stateSet: ppState.filterFoot,
        panelSel: "#ppFootMsPanel",
        btnSel: "#ppFootMsBtn",
        labelSel: "#ppFootMsLabel",
        allLabel: "Any foot",
        onChange: () => { updatePpFilterDot(); renderPlanPicker(); },
      },
      {
        optionsKey: "playing_style",
        stateSet: ppState.filterPlayingStyle,
        panelSel: "#ppPsMsPanel",
        btnSel: "#ppPsMsBtn",
        labelSel: "#ppPsMsLabel",
        allLabel: "Any playing style",
        onChange: () => { updatePpFilterDot(); renderPlanPicker(); },
      },
      {
        optionsKey: "card_type",
        stateSet: ppState.filterCardType,
        panelSel: "#ppCtMsPanel",
        btnSel: "#ppCtMsBtn",
        labelSel: "#ppCtMsLabel",
        allLabel: "Any card type",
        onChange: () => { updatePpFilterDot(); renderPlanPicker(); },
      },
      {
        optionsKey: "league",
        stateSet: ppState.filterLeague,
        panelSel: "#ppLgMsPanel",
        btnSel: "#ppLgMsBtn",
        labelSel: "#ppLgMsLabel",
        allLabel: "Any league",
        onChange: () => { updatePpFilterDot(); renderPlanPicker(); },
      },
    ]);
  if (playerFilterOptionsCache) runPpMs(playerFilterOptionsCache);
  else getPlayerFilterOptions().then(runPpMs);

  panel.querySelector("#ppClearFilters")?.addEventListener("click", () => {
    resetPpState();
    rebuildPpPanels();
    updatePpSortUI();
    updatePpFilterDot();
    renderPlanPicker();
  });

  return panel;
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

  let list = squad.players.filter((p) => {
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
}

function initGamePlans(userId) {
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
function normalizeRoomCode(raw) {
  const code = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[IO]/g, ""); // avoid ambiguous chars
  return code;
}

function goToRoom({ code, mode }) {
  const c = normalizeRoomCode(code);
  if (!c || c.length < 4) {
    showToast("Enter a valid room code.", "info");
    return;
  }
  const url = new URL(window.location.origin + `/room/${encodeURIComponent(c)}`);
  if (mode) url.searchParams.set("mode", String(mode));
  window.location.href = url.pathname + url.search;
}

function genCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function initRoomModal() {
  const overlay   = document.getElementById("roomOverlay");
  const codeInput = document.getElementById("roomCode");

  if (!overlay) return;

  const open  = () => { if (codeInput) codeInput.value = genCode(); overlay.classList.add("open"); document.body.style.overflow = "hidden"; };
  const close = () => { overlay.classList.remove("open"); document.body.style.overflow = ""; };

  document.getElementById("openRoomBtn")?.addEventListener("click", open);
  document.getElementById("roomHubCreateBtn")?.addEventListener("click", open);
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
    close();
    goToRoom({ code, mode: "host" });
  });
}

/* ============================================================
   Room Hub (Create / Join)
   ============================================================ */
function initRoomHub() {
  const input = document.getElementById("joinRoomCode");
  const btn   = document.getElementById("joinRoomBtn");
  if (!input || !btn) return;

  const submit = () => goToRoom({ code: input.value, mode: "join" });

  input.addEventListener("input", () => {
    input.value = normalizeRoomCode(input.value).slice(0, 10);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  btn.addEventListener("click", submit);
}

/* ============================================================
   Boot
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth();
  if (!user) return;

  initUserMenu(user);
  initEditProfile();
  initTabs();
  initRoomHub();
  initRoomModal();
  initAddPlayerModal();
  initSquadSearchSortFilter();
  initPlayerPopup();
  initSquadControls(user.id);
  initGamePlans(user.id);

  await loadSquad(user.id);
  loadGamePlans(user.id);
});
