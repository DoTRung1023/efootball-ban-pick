/* ============================================================
   Loading the opponent's squad — the pool you ban from

   You ban players out of your *opponent's* squad, so the ban grid needs their
   roster rather than your own. Guarded by `opponentBanPlayersLoaded` so a
   re-render does not refetch.

   **The room answers this, not `/api/my-players`.** This file used to read the
   opponent's user id off the snapshot and fetch their squad directly, which
   worked only because that route served any account's collection to anyone who
   could name it — the same hole that let a stranger read your squad. Now the
   request names a room and no one at all: the server takes the caller's seat
   from their session cookie and answers with whatever is in the other chair.

   An opponent with no account has no squad, and says so (`anonymous: true`).
   That is the demo-pool case, and it is the same fallback as an opponent whose
   squad is empty — a ban board with nothing on it is a draft that cannot start.
   ============================================================ */

import { cb } from "@/features/draft/callbacks.js";
import { state } from "@/features/draft/state.js";
import { normalizeApiPlayer, normalizeMySquadPlayerForDraft } from "@/features/draft/players.js";

export function resetOpponentBanPlayers() {
  state.opponentBanPlayers = [];
  state.loadingOpponentBanPlayers = false;
  state.opponentBanPlayersLoaded = false;
}

/** The showcase pool, as players the ban grid can draw. */
async function loadDemoPool() {
  const res = await fetch("/api/top-players");
  const data = await res.json().catch(() => ({}));
  const rows = Array.isArray(data.players) ? data.players : [];
  return rows.map((p) =>
    normalizeApiPlayer({
      id: p.id,
      name: p.name,
      position: p.position,
      overall_max: p.overall,
      nationality: p.nationality,
    }),
  );
}

export async function loadOpponentBanPlayers() {
  const code = String(state.room?.code || "").trim();
  if (!code) return;

  state.loadingOpponentBanPlayers = true;
  cb.renderDraftUi();

  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/opponent-squad`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `Failed to load opponent squad (${res.status})`);
    }

    const rows = Array.isArray(data.players) ? data.players : [];
    const dedup = new Map();
    rows.forEach((row) => {
      const normalized = normalizeMySquadPlayerForDraft(row);
      if (!normalized.id) return;
      if (!dedup.has(normalized.id)) dedup.set(normalized.id, normalized);
    });
    state.opponentBanPlayers = Array.from(dedup.values());
    state.opponentBanPlayersLoadSource = "opponent-squad";

    if (!state.opponentBanPlayers.length) {
      state.opponentBanPlayers = await loadDemoPool();
      state.opponentBanPlayersLoadSource = "top-players";
    }
  } catch {
    /* One retry against the demo pool, so a failed lookup leaves a usable board
       rather than an empty one nobody can ban from. */
    try {
      state.opponentBanPlayers = await loadDemoPool();
      state.opponentBanPlayersLoadSource = "top-players";
    } catch {
      state.opponentBanPlayers = [];
    }
  } finally {
    state.loadingOpponentBanPlayers = false;
    state.opponentBanPlayersLoaded = true;
    cb.renderDraftUi();
  }
}
