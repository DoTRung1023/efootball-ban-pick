// Admin dashboard — vanilla ES module, no build step

const KEY_STORE = "efb_admin_key";

let adminKey = sessionStorage.getItem(KEY_STORE) || "";

// ── Auth ─────────────────────────────────────────────────────
async function verifyKey(key) {
  const r = await fetch("/api/admin/stats?adminKey=" + encodeURIComponent(key));
  return r.ok;
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = document.getElementById("loginKey").value.trim();
  if (!key) return;
  const ok = await verifyKey(key);
  if (ok) {
    adminKey = key;
    sessionStorage.setItem(KEY_STORE, key);
    document.getElementById("loginError").textContent = "";
    document.getElementById("loginOverlay").remove();
    document.getElementById("dashboard").hidden = false;
    initDashboard();
  } else {
    document.getElementById("loginError").textContent = "Invalid admin key.";
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem(KEY_STORE);
  location.reload();
});

// ── Fetch helper ─────────────────────────────────────────────
async function apiFetch(path) {
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(path + sep + "adminKey=" + encodeURIComponent(adminKey));
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ── Utility ──────────────────────────────────────────────────
function fmtNum(n) {
  return n == null ? "—" : Number(n).toLocaleString();
}

function fmtAge(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m " + (s % 60) + "s";
  return Math.floor(s / 3600) + "h " + Math.floor((s % 3600) / 60) + "m";
}

function fmtRelative(ts) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

function fmtDuration(start, end) {
  if (!start) return "—";
  const endTs = end ? new Date(end).getTime() : Date.now();
  const ms = endTs - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m + ":" + String(rem).padStart(2, "0");
}

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-AU", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function phasePill(phase) {
  const cls = { ban: "is-ban", pick: "is-pick", lobby: "is-lobby", ready: "is-ready", done: "is-done" };
  return `<span class="phase-pill ${cls[phase] || "is-lobby"}">${escHtml(phase.toUpperCase())}</span>`;
}

function statusPill(log) {
  if (!log.finished_at) return `<span class="status-pill is-running">RUNNING</span>`;
  if (log.players_upserted > 0) return `<span class="status-pill is-success">SUCCESS</span>`;
  return `<span class="status-pill is-success">DONE</span>`;
}

function cardTypeBadge(type) {
  if (!type) return "";
  const t = type.toLowerCase();
  let cls = "";
  if (t.includes("iconic")) cls = "is-iconic";
  else if (t.includes("highlight")) cls = "is-highlight";
  else if (t.includes("epic")) cls = "is-epic";
  return `<span class="card-type-badge ${cls}" title="${escHtml(type)}">${escHtml(type)}</span>`;
}

// ── Tab navigation ────────────────────────────────────────────
const TABS = ["overview", "scrapes", "players", "users", "rooms"];
let activeTab = "overview";

function switchTab(tab) {
  if (!TABS.includes(tab)) return;
  activeTab = tab;
  TABS.forEach((t) => {
    document.querySelector(`.admin-tab[data-tab="${t}"]`).classList.toggle("is-active", t === tab);
    document.getElementById("tab" + t.charAt(0).toUpperCase() + t.slice(1)).hidden = t !== tab;
  });
  if (tab === "scrapes") loadScrapesFull();
  if (tab === "players") loadCatalog();
  if (tab === "users") loadUsers();
  if (tab === "rooms") loadRoomsFull();
}

document.querySelectorAll(".admin-tab").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});
document.querySelectorAll("[data-tab-switch]").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tabSwitch));
});

// ── Stats ─────────────────────────────────────────────────────
async function loadStats() {
  try {
    const d = await apiFetch("/api/admin/stats");
    document.getElementById("statCatalog").textContent = fmtNum(d.catalogCount);
    document.getElementById("statUsers").textContent = fmtNum(d.userCount);
    const sub = document.getElementById("statUsersSub");
    if (d.newUsersThisWeek > 0) {
      sub.textContent = `+${d.newUsersThisWeek} this week`;
      sub.className = "stat-sub is-pos";
    } else {
      sub.textContent = "0 this week";
      sub.className = "stat-sub";
    }

    document.getElementById("statRooms").textContent = fmtNum(d.activeRoomCount);
    const roomSub = document.getElementById("statRoomsSub");
    roomSub.textContent = d.draftRoomCount > 0 ? `${d.draftRoomCount} in draft` : "none in draft";
    roomSub.className = d.draftRoomCount > 0 ? "stat-sub is-pos" : "stat-sub";

    if (d.lastScrape) {
      document.getElementById("statScrape").textContent = fmtRelative(d.lastScrape.started_at);
      const scrapeSub = document.getElementById("statScrapeSub");
      scrapeSub.textContent = d.lastScrape.finished_at ? "✓ complete" : "⟳ running";
      scrapeSub.className = d.lastScrape.finished_at ? "stat-sub is-pos" : "stat-sub is-warn";
    }
  } catch {
    // silent
  }
}

// ── Scrape logs (overview panel) ──────────────────────────────
async function loadScrapeOverview() {
  try {
    const d = await apiFetch("/api/admin/scrape-logs?limit=8");
    const running = d.logs.find((l) => !l.finished_at);

    const banner = document.getElementById("scrapeRunningBanner");
    if (running) {
      banner.hidden = false;
      document.getElementById("scrapeRunningLabel").textContent =
        `Full scrape #${running.id}`;
      const fill = document.getElementById("scrapeRunningFill");
      if (running.players_upserted) {
        fill.style.width = "60%";
      } else {
        fill.style.width = "20%";
      }
    } else {
      banner.hidden = true;
    }

    const tbody = document.getElementById("scrapeLogsBody");
    if (!d.logs.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="td-empty">No scrape runs yet</td></tr>`;
      return;
    }
    tbody.innerHTML = d.logs.map((l) => `
      <tr>
        <td class="td-mono">#${l.id}</td>
        <td><span class="phase-pill is-lobby">${escHtml(l.scrape_type.toUpperCase())}</span></td>
        <td>${l.players_upserted != null ? fmtNum(l.players_upserted) : "—"}</td>
        <td class="td-dim">${fmtDuration(l.started_at, l.finished_at)}</td>
        <td class="td-dim">${fmtDate(l.started_at)}</td>
        <td>${statusPill(l)}</td>
      </tr>
    `).join("");
  } catch {
    document.getElementById("scrapeLogsBody").innerHTML =
      `<tr><td colspan="6" class="td-empty">Failed to load</td></tr>`;
  }
}

// ── Scrape logs (full tab) ────────────────────────────────────
async function loadScrapesFull() {
  const tbody = document.getElementById("scrapeFullBody");
  tbody.innerHTML = `<tr><td colspan="8" class="td-empty">Loading…</td></tr>`;
  try {
    const d = await apiFetch("/api/admin/scrape-logs?limit=50");
    if (!d.logs.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="td-empty">No scrape runs yet</td></tr>`;
      return;
    }
    tbody.innerHTML = d.logs.map((l) => `
      <tr>
        <td class="td-mono">#${l.id}</td>
        <td><span class="phase-pill is-lobby">${escHtml(l.scrape_type.toUpperCase())}</span></td>
        <td>${l.players_upserted != null ? fmtNum(l.players_upserted) : "—"}</td>
        <td class="td-dim">${fmtDuration(l.started_at, l.finished_at)}</td>
        <td class="td-dim">${fmtDate(l.started_at)}</td>
        <td class="td-dim">${fmtDate(l.finished_at)}</td>
        <td class="td-mono td-dim">${l.max_pesdb_id ? fmtNum(l.max_pesdb_id) : "—"}</td>
        <td>${statusPill(l)}</td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = `<tr><td colspan="8" class="td-empty">Failed to load</td></tr>`;
  }
}

document.getElementById("refreshScrapes").addEventListener("click", loadScrapeOverview);
document.getElementById("refreshScrapesFull").addEventListener("click", loadScrapesFull);

// ── Active Rooms (overview) ───────────────────────────────────
async function loadRoomsOverview() {
  try {
    const d = await apiFetch("/api/admin/rooms");
    const liveEl = document.getElementById("roomsLiveCount");
    liveEl.textContent = `${d.rooms.length} LIVE`;
    const tbody = document.getElementById("roomsBody");
    if (!d.rooms.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="td-empty">No active rooms</td></tr>`;
      return;
    }
    tbody.innerHTML = d.rooms.map((r) => `
      <tr>
        <td class="td-mono">${escHtml(r.code)}</td>
        <td>${escHtml(r.host || "—")}</td>
        <td>${escHtml(r.guest || "—")}</td>
        <td>${phasePill(r.phase)}</td>
        <td class="td-dim">${fmtAge(r.ageSec * 1000)}</td>
        <td><a href="/room/${escHtml(r.code)}" target="_blank" class="watch-btn">WATCH</a></td>
      </tr>
    `).join("");
  } catch {
    document.getElementById("roomsBody").innerHTML =
      `<tr><td colspan="6" class="td-empty">Failed to load</td></tr>`;
  }
}

// ── Active Rooms (full tab) ───────────────────────────────────
async function loadRoomsFull() {
  const tbody = document.getElementById("roomsFullBody");
  tbody.innerHTML = `<tr><td colspan="6" class="td-empty">Loading…</td></tr>`;
  try {
    const d = await apiFetch("/api/admin/rooms");
    document.getElementById("roomsFullCount").textContent = `${d.rooms.length} LIVE`;
    if (!d.rooms.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="td-empty">No active rooms</td></tr>`;
      return;
    }
    tbody.innerHTML = d.rooms.map((r) => `
      <tr>
        <td class="td-mono">${escHtml(r.code)}</td>
        <td>${escHtml(r.host || "—")}</td>
        <td>${escHtml(r.guest || "—")}</td>
        <td>${phasePill(r.phase)}</td>
        <td class="td-dim">${fmtAge(r.ageSec * 1000)}</td>
        <td><a href="/room/${escHtml(r.code)}" target="_blank" class="watch-btn">WATCH</a></td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = `<tr><td colspan="6" class="td-empty">Failed to load</td></tr>`;
  }
}

document.getElementById("refreshRooms").addEventListener("click", loadRoomsOverview);
document.getElementById("refreshRoomsFull").addEventListener("click", loadRoomsFull);

// ── Recent Signups ────────────────────────────────────────────
async function loadSignups() {
  try {
    const d = await apiFetch("/api/admin/recent-users?limit=8");
    const tbody = document.getElementById("signupsBody");
    if (!d.users.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="td-empty">No users yet</td></tr>`;
      return;
    }
    tbody.innerHTML = d.users.map((u) => `
      <tr>
        <td>${escHtml(u.username)}</td>
        <td>${fmtNum(u.playerCount)}</td>
        <td>${fmtNum(u.planCount)}</td>
        <td class="td-dim">${fmtRelative(u.created_at)}</td>
      </tr>
    `).join("");
  } catch {
    document.getElementById("signupsBody").innerHTML =
      `<tr><td colspan="4" class="td-empty">Failed to load</td></tr>`;
  }
}

// ── Users (full tab) ──────────────────────────────────────────
async function loadUsers() {
  const tbody = document.getElementById("usersFullBody");
  tbody.innerHTML = `<tr><td colspan="6" class="td-empty">Loading…</td></tr>`;
  try {
    const d = await apiFetch("/api/admin/recent-users?limit=50");
    if (!d.users.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="td-empty">No users yet</td></tr>`;
      return;
    }
    tbody.innerHTML = d.users.map((u, i) => `
      <tr>
        <td class="td-dim">${i + 1}</td>
        <td>${escHtml(u.username)}</td>
        <td class="td-dim">${escHtml(u.email)}</td>
        <td>${fmtNum(u.playerCount)}</td>
        <td>${fmtNum(u.planCount)}</td>
        <td class="td-dim">${fmtDate(u.created_at)}</td>
      </tr>
    `).join("");
  } catch {
    tbody.innerHTML = `<tr><td colspan="6" class="td-empty">Failed to load</td></tr>`;
  }
}

document.getElementById("refreshUsers").addEventListener("click", loadUsers);

// ── Data Quality ──────────────────────────────────────────────
async function loadDataQuality() {
  try {
    const d = await apiFetch("/api/admin/data-quality");
    const total = d.total || 1;

    const rows = [
      { label: "Missing playing style", count: d.missingStyle },
      { label: "Missing region",        count: d.missingRegion },
      { label: "Missing overall max",   count: d.missingOverallMax },
      { label: "Duplicate pesdb_id",    count: d.dupPesdbId },
    ];

    document.getElementById("dataQualityBody").innerHTML = rows.map((r) => {
      const pct = ((r.count / total) * 100).toFixed(2);
      const barClass = r.count === 0 ? "is-ok" : pct > 10 ? "is-bad" : "is-warn";
      const barW = Math.min(100, (r.count / total) * 100 * 5).toFixed(1); // scaled 5x for visibility
      return `
        <div class="dq-row">
          <span class="dq-label">${escHtml(r.label)}</span>
          <span class="dq-count">${fmtNum(r.count)}</span>
          <span class="dq-pct">(${pct}%)</span>
          <div class="dq-bar-wrap">
            <div class="dq-bar ${barClass}" style="width:${Math.min(100, (r.count / total) * 800).toFixed(1)}%"></div>
          </div>
        </div>
      `;
    }).join("");
  } catch {
    document.getElementById("dataQualityBody").innerHTML =
      `<div class="dq-row dq-skeleton">Failed to load</div>`;
  }
}

// ── Catalog ───────────────────────────────────────────────────
let catalogPage = 0;
let catalogTotal = 0;
const CATALOG_LIMIT = 8;
let catalogSort = "overall_max_desc";
let catalogSearch = "";
let catalogSortAsc = false;
let searchTimer = null;

const CATALOG_SORTS = [
  { key: "overall_max_desc", label: "OVERALL MAX ↓" },
  { key: "overall_max_asc",  label: "OVERALL MAX ↑" },
  { key: "overall_desc",     label: "OVERALL ↓" },
  { key: "name_asc",         label: "NAME A–Z" },
  { key: "position_asc",     label: "POSITION" },
];
let sortIdx = 0;

document.getElementById("catalogSortBtn").addEventListener("click", () => {
  sortIdx = (sortIdx + 1) % CATALOG_SORTS.length;
  catalogSort = CATALOG_SORTS[sortIdx].key;
  document.getElementById("catalogSortLabel").textContent = CATALOG_SORTS[sortIdx].label;
  catalogPage = 0;
  loadCatalog();
});

document.getElementById("catalogSearch").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    catalogSearch = e.target.value.trim();
    catalogPage = 0;
    loadCatalog();
  }, 300);
});

document.getElementById("catalogPrev").addEventListener("click", () => {
  if (catalogPage > 0) { catalogPage--; loadCatalog(); }
});

document.getElementById("catalogNext").addEventListener("click", () => {
  if ((catalogPage + 1) * CATALOG_LIMIT < catalogTotal) { catalogPage++; loadCatalog(); }
});

async function loadCatalog() {
  const tbody = document.getElementById("catalogBody");
  tbody.innerHTML = `<tr><td colspan="11" class="td-empty">Loading…</td></tr>`;
  try {
    const offset = catalogPage * CATALOG_LIMIT;
    let url = `/api/players?sortBy=${catalogSort}&limit=${CATALOG_LIMIT}&offset=${offset}`;
    if (catalogSearch) url += `&q=${encodeURIComponent(catalogSearch)}`;

    const r = await fetch(url);
    const d = await r.json();
    const players = d.players || [];

    if (!players.length) {
      tbody.innerHTML = `<tr><td colspan="11" class="td-empty">No players found</td></tr>`;
      document.getElementById("catalogPageInfo").textContent = "0 results";
      document.getElementById("catalogPrev").disabled = true;
      document.getElementById("catalogNext").disabled = true;
      return;
    }

    catalogTotal = players.length < CATALOG_LIMIT
      ? offset + players.length
      : offset + players.length + 1; // approximate

    tbody.innerHTML = players.map((p, i) => `
      <tr>
        <td class="td-rank">${offset + i + 1}</td>
        <td>${escHtml(p.name)}</td>
        <td class="td-dim">${escHtml(p.position || "—")}</td>
        <td class="td-ovr">${p.overall ?? "—"}</td>
        <td class="td-max">${p.overall_max ?? "—"}</td>
        <td>${cardTypeBadge(p.card_type)}</td>
        <td class="td-dim">${escHtml(p.club || "—")}</td>
        <td class="td-dim">${escHtml(p.league || "—")}</td>
        <td class="td-dim">${escHtml(p.region || "—")}</td>
        <td class="td-mono td-dim">${p.id}</td>
        <td><a href="/img/card/${p.id}.png" target="_blank" class="watch-btn">VIEW</a></td>
      </tr>
    `).join("");

    const start = offset + 1;
    const end = offset + players.length;
    document.getElementById("catalogPageInfo").textContent = `${start}–${end}`;
    document.getElementById("catalogPrev").disabled = catalogPage === 0;
    document.getElementById("catalogNext").disabled = players.length < CATALOG_LIMIT;
  } catch {
    tbody.innerHTML = `<tr><td colspan="11" class="td-empty">Failed to load</td></tr>`;
  }
}

// ── Export CSV ────────────────────────────────────────────────
document.getElementById("exportCsvBtn").addEventListener("click", async () => {
  try {
    let url = `/api/players?sortBy=${catalogSort}&limit=5000&offset=0`;
    if (catalogSearch) url += `&q=${encodeURIComponent(catalogSearch)}`;
    const r = await fetch(url);
    const d = await r.json();
    const players = d.players || [];

    const header = ["pesdb_id","name","position","overall","overall_max","card_type","club","league","nationality","region","foot","playing_style","height","weight","age"];
    const rows = players.map((p) =>
      header.map((k) => {
        const v = String(p[k] ?? "").replace(/"/g, '""');
        return `"${v}"`;
      }).join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `catalog_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    alert("Export failed.");
  }
});

// ── Auto-refresh rooms every 10 s ────────────────────────────
function startAutoRefresh() {
  setInterval(() => {
    if (activeTab === "overview") {
      loadRoomsOverview();
      loadStats();
    } else if (activeTab === "rooms") {
      loadRoomsFull();
    }
  }, 10000);
}

// ── Init ──────────────────────────────────────────────────────
function initDashboard() {
  loadStats();
  loadScrapeOverview();
  loadRoomsOverview();
  loadSignups();
  loadDataQuality();
  startAutoRefresh();
}

// Auto-login if key already stored
if (adminKey) {
  verifyKey(adminKey).then((ok) => {
    if (ok) {
      document.getElementById("loginOverlay").remove();
      document.getElementById("dashboard").hidden = false;
      initDashboard();
    } else {
      sessionStorage.removeItem(KEY_STORE);
      adminKey = "";
    }
  });
}
