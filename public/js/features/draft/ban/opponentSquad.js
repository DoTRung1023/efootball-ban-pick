/* ============================================================
   Loading the opponent's squad — the pool you ban from

   You ban players out of your *opponent's* squad, so the ban grid needs their
   roster rather than your own. Guarded by `opponentBanPlayersLoaded` so a
   re-render does not refetch.
   ============================================================ */

import { cb } from "@/features/draft/callbacks.js";
import { state } from "@/features/draft/state.js";
import { applyPresenceSnapshot } from "@/features/draft/state.js";
import { normalizeApiPlayer, normalizeMySquadPlayerForDraft } from "@/features/draft/players.js";

export function resetOpponentBanPlayers() {
  state.opponentBanPlayers = [];
  state.loadingOpponentBanPlayers = false;
  state.opponentBanPlayersLoaded = false;
}

export async function loadOpponentBanPlayers() {
  const room = state.room;
  if (!room) return;
  const mySide = state.mySide;
  const theirSide = mySide === "host" ? "guest" : "host";
  let opponentUserId = Number(room?.[theirSide]?.id);

  if (!Number.isFinite(opponentUserId) || opponentUserId <= 0) {
    // In some flows, draft starts before presence polling fully hydrates numeric ids.
    // Attempt a one-time presence refresh, then retry extracting opponent id.
    try {
      const code = String(room.code || "").trim();
      if (code) {
        const pres = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
        const data = await pres.json().catch(() => ({}));
        if (pres.ok && data?.room) applyPresenceSnapshot(data.room);
      }
    } catch {
      /* ignore */
    }
    opponentUserId = Number(state.room?.[theirSide]?.id);
    if (!Number.isFinite(opponentUserId) || opponentUserId <= 0) {
      // Fallback: if opponent is not signed in (anon ids), we can't load /api/my-players.
      // Provide a small demo pool so ban UI is usable in single-browser testing.
      try {
        const res = await fetch("/api/top-players");
        const data = await res.json().catch(() => ({}));
        const rows = Array.isArray(data.players) ? data.players : [];
        state.opponentBanPlayers = rows.map((p) =>
          normalizeApiPlayer({
            id: p.id,
            name: p.name,
            position: p.position,
            overall_max: p.overall,
            nationality: p.nationality,
          }),
        );
        state.opponentBanPlayersLoadSource = "top-players";
      } catch {
        state.opponentBanPlayers = [];
      } finally {
        state.opponentBanPlayersLoaded = true;
        cb.renderDraftUi();
      }
      return;
    }
  }

  state.loadingOpponentBanPlayers = true;
  cb.renderDraftUi();
  try {
    const res = await fetch(`/api/my-players?userId=${encodeURIComponent(opponentUserId)}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error || `Failed to load opponent squad (${res.status})`);
    }
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data.players) ? data.players : [];
    const dedup = new Map();
    rows.forEach((row) => {
      const normalized = normalizeMySquadPlayerForDraft(row);
      if (!normalized.id) return;
      if (!dedup.has(normalized.id)) dedup.set(normalized.id, normalized);
    });
    state.opponentBanPlayers = Array.from(dedup.values());
    state.opponentBanPlayersLoadSource = "my-players";

    // If opponent has no saved squad, fall back to a small demo pool so the ban UI isn't empty/stuck.
    if (!state.opponentBanPlayers.length) {
      try {
        const demoRes = await fetch("/api/top-players");
        const demoData = await demoRes.json().catch(() => ({}));
        const demoRows = Array.isArray(demoData.players) ? demoData.players : [];
        state.opponentBanPlayers = demoRows.map((p) =>
          normalizeApiPlayer({
            id: p.id,
            name: p.name,
            position: p.position,
            overall_max: p.overall,
            nationality: p.nationality,
          }),
        );
        state.opponentBanPlayersLoadSource = "top-players";
      } catch {
        /* ignore */
      }
    }
  } catch {
    state.opponentBanPlayers = [];
  } finally {
    state.loadingOpponentBanPlayers = false;
    state.opponentBanPlayersLoaded = true;
    cb.renderDraftUi();
  }
}
