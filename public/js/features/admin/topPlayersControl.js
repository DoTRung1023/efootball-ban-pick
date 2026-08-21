/* ============================================================
   SIGN-IN SHOWCASE — rebuilding the stored top-N

   The list the sign-in page shows, and the pool `squads.js` auto-bans from
   when an empty seat's turn expires. Both read one stored snapshot, so what
   is rendered here is literally what a visitor sees.

   Rebuilding is a button rather than a schedule on purpose: the catalog only
   moves when a scrape runs, and the person who ran the scrape is the one who
   knows the new cards should go up. The server does the ranking — this module
   only asks for it and draws the answer.
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch, apiSend } from "./adminApi.js";
import { fmtRelative } from "./format.js";

const el = (id) => document.getElementById(id);

function renderMeta({ count, refreshedAt, limit }) {
  el("topPlayersMeta").textContent = count
    ? `${count} of ${limit} · rebuilt ${fmtRelative(refreshedAt)}`
    : "not built yet";
}

function renderList(players) {
  const body = el("topPlayersBody");
  if (!players?.length) {
    body.innerHTML = `<div class="tp-empty">Nothing stored yet — press REBUILD.</div>`;
    return;
  }
  body.innerHTML = players.map((p, i) => `
    <span class="tp-chip">
      <span class="tp-rank">${i + 1}</span>
      <span class="tp-name">${escapeHtml(p.name)}</span>
    </span>`).join("");
}

/** Both the initial load and a rebuild land on the same two renderers, so the
    panel cannot end up showing a count that disagrees with the names below. */
function render(status) {
  renderMeta(status);
  renderList(status.players);
}

export async function loadTopPlayers() {
  try {
    render(await apiFetch("/api/admin/top-players"));
  } catch {
    el("topPlayersMeta").textContent = "unavailable";
    el("topPlayersBody").innerHTML = `<div class="tp-empty">Failed to load</div>`;
  }
}

export function initTopPlayersControl() {
  const btn = el("topPlayersRefreshBtn");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "REBUILDING…";
    try {
      render(await apiSend("/api/admin/top-players/refresh", "POST", {}));
    } catch (err) {
      el("topPlayersMeta").textContent = err.message || "rebuild failed";
    } finally {
      btn.disabled = false;
      btn.textContent = "REBUILD";
    }
  });
}
