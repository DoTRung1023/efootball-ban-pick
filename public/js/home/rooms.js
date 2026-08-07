import { getUser } from '@/shared/lib/session.js';
import { showToast } from '@/shared/ui/toast.js';
import { cb } from '@/pages/home/callbacks.js';

let _statsUserId = null;

function normalizeRoomCode(raw) {
  const code = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[IO]/g, ""); // avoid ambiguous chars
  return code;
}

async function goToRoom({ code, mode, btn: btnEl }) {
  const c = normalizeRoomCode(code);
  if (!c || c.length < 4) {
    showToast("Enter a valid room code.", "info");
    return;
  }

  if (mode === "join") {
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = "CHECKING…"; }
    try {
      const data = await fetch(`/api/rooms/${encodeURIComponent(c)}`).then(r => r.json());
      if (!data.room?.host) {
        showToast("Room not found. Check the code and try again.", "error");
        return;
      }
    } catch {
      showToast("Could not reach the server. Try again.", "error");
      return;
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = "ENTER CODE TO JOIN"; }
    }
  }

  const url = new URL(window.location.origin + `/room/${encodeURIComponent(c)}`);
  if (mode) url.searchParams.set("mode", String(mode));
  window.location.href = url.pathname + url.search;
}

function genCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function initRoomModal() {
  const overlay   = document.getElementById("roomOverlay");
  const codeInput = document.getElementById("roomCode");

  if (!overlay) return;

  const open  = () => {
    if (codeInput) codeInput.value = genCode();
    const sb = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.paddingRight = sb + "px";
    document.body.style.overflow = "hidden";
    overlay.classList.add("open");
  };
  const close = () => {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
  };

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
export function initRoomHub() {
  const input = document.getElementById("joinRoomCode");
  const btn   = document.getElementById("joinRoomBtn");
  if (!input || !btn) return;

  const submit = () => goToRoom({ code: input.value, mode: "join", btn: btn });

  input.addEventListener("input", () => {
    input.value = normalizeRoomCode(input.value).slice(0, 10);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  btn.addEventListener("click", submit);

  // Paste clipboard into code input
  document.getElementById("pasteCodeBtn")?.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      // Try extracting from a URL first, then treat as raw code
      let code = "";
      try {
        const url = new URL(text.trim());
        const match = url.pathname.match(/\/room\/([A-Z0-9]+)/i);
        if (match) code = normalizeRoomCode(match[1]);
      } catch {
        code = normalizeRoomCode(text);
      }
      if (code) {
        input.value = code.slice(0, 10);
        input.focus();
      } else {
        showToast("Nothing useful on the clipboard.", "info");
      }
    } catch {
      showToast("Could not read clipboard.", "info");
    }
  });

  // Extract room code from a pasted invite link
  const linkInput = document.getElementById("joinRoomLink");
  linkInput?.addEventListener("input", function () {
    const val = this.value.trim();
    if (!val) return;
    try {
      const url = new URL(val);
      const match = url.pathname.match(/\/room\/([A-Z0-9]+)/i);
      if (match) {
        const code = normalizeRoomCode(match[1]).slice(0, 10);
        if (code) {
          input.value = code;
          this.value = "";
          showToast("Room code extracted.", "success");
          input.focus();
        }
      }
    } catch { /* not a valid URL yet — keep typing */ }
  });

  // Tab navigation links (MANAGE › / EDIT ›)
  document.querySelectorAll("[data-switch-tab]").forEach((el) => {
    el.addEventListener("click", () => {
      const target = el.dataset.switchTab;
      document.querySelector(`.nav-tab[data-tab="${target}"]`)?.click();
    });
  });
}

/* ============================================================
   Rooms stats panels
   ============================================================ */
function escHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function renderCreateVisual(players) {
  const visual = document.getElementById("roomsCreateVisual");
  if (!visual) return;
  const cards = players.filter((p) => p.pesdb_id).slice(0, 4);
  visual.innerHTML = cards.map((p) => `
    <div class="rooms-create-visual-card">
      <img src="/img/card/${p.pesdb_id}.png" alt="" loading="lazy" onerror="this.style.opacity='0'">
    </div>
  `).join("");
}

function renderRosterPanel(players) {
  const body = document.getElementById("rosterStatBody");
  if (!body) return;

  if (!players.length) {
    body.innerHTML = `<div class="rooms-info-empty">No players yet — add some from the catalog.</div>`;
    return;
  }

  const withImg = players.filter((p) => p.pesdb_id);
  const preview = withImg.slice(0, 8);
  const more = players.length - preview.length;

  const pos = (list) => players.filter((p) => list.includes((p.position || "").toUpperCase())).length;
  const gk  = pos(["GK"]);
  const def = pos(["CB", "RB", "LB"]);
  const mid = pos(["DMF", "CMF", "LMF", "RMF", "AMF"]);
  const atk = pos(["CF", "SS", "RWF", "LWF"]);

  body.innerHTML = `
    <div class="rooms-roster-pos">
      <span class="rooms-pos-pill rooms-pos-gk"><b>${gk}</b> GK</span>
      <span class="rooms-pos-pill rooms-pos-def"><b>${def}</b> DEF</span>
      <span class="rooms-pos-pill rooms-pos-mid"><b>${mid}</b> MID</span>
      <span class="rooms-pos-pill rooms-pos-atk"><b>${atk}</b> ATK</span>
    </div>
    <div class="rooms-roster-cards">
      ${preview.map((p) => `
        <div class="rooms-roster-card">
          <img src="/img/card/${p.pesdb_id}.png" alt="${escHtml(p.name)}" loading="lazy" onerror="this.style.opacity='0'">
        </div>
      `).join("")}
    </div>
    ${more > 0 ? `<div class="rooms-roster-more">+${more} more</div>` : ""}
  `;
}

function renderTacticsPanel(plans) {
  const body = document.getElementById("tacticsStatBody");
  if (!body) return;

  if (!plans.length) {
    body.innerHTML = `<div class="rooms-info-empty">No game plans yet — create one in GAME PLANS.</div>`;
    return;
  }

  const sorted = [...plans].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const shown = sorted.slice(0, 5);
  const extra = plans.length - shown.length;

  body.innerHTML = `
    <div class="rooms-tactics-label">MOST RECENT</div>
    ${shown.map((p) => `
      <div class="rooms-plan-item">
        <span class="rooms-plan-formation">${escHtml(p.formation || "—")}</span>
        <span class="rooms-plan-name">${escHtml(p.name)}</span>
        <span class="rooms-plan-time">${timeAgo(p.created_at)}</span>
      </div>
    `).join("")}
    ${extra > 0 ? `<div class="rooms-tactics-more">+${extra} more plan${extra > 1 ? "s" : ""}</div>` : ""}
  `;
}

export async function loadRoomsStats(userId) {
  const uid = Number(userId);
  if (!uid) return;
  _statsUserId = uid;
  cb.refreshRoomsStats = () => loadRoomsStats(_statsUserId);

  const [pr, pp] = await Promise.allSettled([
    fetch(`/api/my-players?userId=${uid}`).then((r) => r.json()),
    fetch(`/api/game-plans?userId=${uid}`).then((r) => r.json()),
  ]);

  const players = pr.status === "fulfilled" ? (pr.value.players || []) : [];
  renderCreateVisual(players);
  renderRosterPanel(players);
  renderTacticsPanel(pp.status === "fulfilled" ? (pp.value.plans || []) : []);
}
