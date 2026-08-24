/* ============================================================
   SHOWCASE — the stored pool, now edited rather than only inspected

   One list with three consumers: the sign-in page's card backdrop, the
   bannable board shown for a seat with no account, and the target
   `squads.js` auto-bans when that seat's turn expires. They all read the same
   snapshot, so what this tab saves is literally what a visitor sees and what
   an anonymous opponent can lose.

   Two ways to fill it, and they are different verbs. REBUILD *computes* the
   automatic top 30 from the catalog and is the way back from any mess. The
   picker *chooses*, up to `max`, and saves the order you leave it in.

   Editing is staged, not live: adds and removes change local state and SAVE
   is what writes. A list that took effect per click would make a mis-click a
   live change to somebody's draft, and there is no undo on that.
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { icon } from "@/shared/icons/icon.js";
import { apiFetch, apiSend } from "./adminApi.js";
import { fmtRelative } from "./format.js";

const el = (id) => document.getElementById(id);

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 12;

/** `picked` is what SAVE would write; `saved` is what is stored right now. */
const state = {
  picked: [],
  saved: [],
  refreshedAt: null,
  limit: 30,
  max: 50,
  advisedMin: 23,
};

const idsOf = (list) => list.map((p) => p.id).join(",");
const isDirty = () => idsOf(state.picked) !== idsOf(state.saved);
const isFull = () => state.picked.length >= state.max;

/* ── Painting ───────────────────────────────────────────────── */

function renderMeta() {
  const n = state.picked.length;
  const when = state.refreshedAt ? `rebuilt ${fmtRelative(state.refreshedAt)}` : "not built yet";
  el("topPlayersMeta").textContent = isDirty()
    ? `${n} of ${state.max} · unsaved changes`
    : `${n} of ${state.max} · ${when}`;
  el("topPlayersSaveBtn").disabled = !isDirty();
}

/** Short lists still work; they just make a thin board for an empty seat. */
function renderWarning() {
  const box = el("topPlayersWarn");
  const n = state.picked.length;
  const show = n > 0 && n < state.advisedMin;
  box.hidden = !show;
  if (show) {
    box.textContent = `${n} player${n === 1 ? "" : "s"} is fewer than a full squad of `
      + `${state.advisedMin}. A seat with no account bans out of this list, so it will `
      + `have little to choose from.`;
  }
}

function renderList() {
  const body = el("topPlayersBody");
  if (!state.picked.length) {
    body.innerHTML = `<div class="tp-empty">Nothing picked yet. Search above, or press REBUILD.</div>`;
    return;
  }
  body.innerHTML = state.picked.map((p, i) => `
    <button type="button" class="tp-chip tp-chip--pick" data-remove="${escapeHtml(p.id)}"
            title="Remove ${escapeHtml(p.name)}">
      <span class="tp-rank">${i + 1}</span>
      <span class="tp-name">${escapeHtml(p.name)}</span>
      ${icon("close", { size: 11, className: "tp-x" })}
    </button>`).join("");
}

function renderAll() {
  renderMeta();
  renderList();
  renderWarning();
}

/* ── The picker ─────────────────────────────────────────────── */

/* `/api/players` selects `pesdb_id AS id`, so a catalog row's key is `id` and
   not `pesdb_id` — the snapshot stores that same value. */
function renderResults(players) {
  const box = el("topPlayersResults");
  const already = new Set(state.picked.map((p) => p.id));
  if (!players.length) {
    box.hidden = false;
    box.innerHTML = `<div class="tp-empty">No cards match.</div>`;
    return;
  }
  box.hidden = false;
  box.innerHTML = players.map((p) => {
    const inList = already.has(String(p.id));
    const dis = inList || isFull();
    return `
      <button type="button" class="tp-result" data-add="${escapeHtml(String(p.id))}"
              data-name="${escapeHtml(p.name)}"${dis ? " disabled" : ""}>
        <span class="tp-result-name">${escapeHtml(p.name)}</span>
        <span class="tp-result-meta">${escapeHtml(p.position || "")} · ${escapeHtml(String(p.overall_max ?? p.overall ?? ""))}</span>
        <span class="tp-result-tag">${inList ? "ADDED" : isFull() ? "FULL" : "ADD"}</span>
      </button>`;
  }).join("");
}

async function runSearch(q) {
  const box = el("topPlayersResults");
  if (!q.trim()) { box.hidden = true; box.innerHTML = ""; return; }
  try {
    const data = await apiFetch(
      `/api/players?q=${encodeURIComponent(q.trim())}&limit=${SEARCH_LIMIT}&sortBy=overall_max_desc`,
    );
    renderResults(data.players || []);
  } catch {
    box.hidden = false;
    box.innerHTML = `<div class="tp-empty">Search failed.</div>`;
  }
}

/* ── State changes ──────────────────────────────────────────── */

function addPlayer(id, name) {
  if (isFull() || state.picked.some((p) => p.id === id)) return;
  state.picked = [...state.picked, { id, name }];
  renderAll();
  runSearch(el("topPlayersSearch").value);   // repaint ADDED / FULL tags
}

function removePlayer(id) {
  state.picked = state.picked.filter((p) => p.id !== id);
  renderAll();
  runSearch(el("topPlayersSearch").value);
}

/** Adopts a server response as the new truth: picked and saved agree again. */
function adopt(status) {
  state.picked = (status.players || []).map((p) => ({ id: String(p.id), name: p.name }));
  state.saved = [...state.picked];
  state.refreshedAt = status.refreshedAt;
  state.limit = status.limit ?? state.limit;
  state.max = status.max ?? state.max;
  state.advisedMin = status.advisedMin ?? state.advisedMin;
  renderAll();
}

/* ── Entry points ───────────────────────────────────────────── */

export async function loadTopPlayers() {
  try {
    adopt(await apiFetch("/api/admin/top-players"));
  } catch {
    el("topPlayersMeta").textContent = "unavailable";
    el("topPlayersBody").innerHTML = `<div class="tp-empty">Failed to load</div>`;
  }
}

async function withButton(btn, busyLabel, work) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyLabel;
  try {
    adopt(await work());
  } catch (err) {
    el("topPlayersMeta").textContent = err.message || "failed";
  } finally {
    btn.textContent = label;
    renderMeta();                            // re-derives `disabled` from dirty
  }
}

export function initTopPlayersControl() {
  el("topPlayersRefreshBtn").addEventListener("click", (e) =>
    withButton(e.currentTarget, "REBUILDING…", () => apiSend("/api/admin/top-players/refresh", "POST", {})));

  el("topPlayersSaveBtn").addEventListener("click", (e) =>
    withButton(e.currentTarget, "SAVING…", () =>
      apiSend("/api/admin/top-players", "PUT", { ids: state.picked.map((p) => p.id) })));

  /* Delegated, because both lists are rebuilt on every change. */
  el("topPlayersBody").addEventListener("click", (e) => {
    const hit = e.target.closest("[data-remove]");
    if (hit) removePlayer(hit.dataset.remove);
  });

  el("topPlayersResults").addEventListener("click", (e) => {
    const hit = e.target.closest("[data-add]");
    if (hit && !hit.disabled) addPlayer(hit.dataset.add, hit.dataset.name);
  });

  let timer = null;
  el("topPlayersSearch").addEventListener("input", (e) => {
    const { value } = e.target;
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(value), SEARCH_DEBOUNCE_MS);
  });
}
