/* ============================================================
   Click and hover handling for the card grid, whichever phase owns it

   One handler serves both phases — it reads the current turn to decide
   whether a click is a ban or a pick — which is why it sits in shell/ rather
   than in ban/ or pick/.
   ============================================================ */

import { state } from "@/features/draft/state.js";

export function attachMiniCardGridHandlers(grid, getDraftDisplayPlayers, submitBan, submitPick) {
  if (!grid || grid._bound) return;
  grid._bound = true;

  grid.addEventListener("mouseover", (e) => {
    // Only track is-hovered on mini-cards; player-cards use pure CSS :hover to avoid
    // polluting innerHTML and breaking the diff-guard that prevents grid rebuilds.
    const miniCard = e.target.closest(".mini-card.is-clickable");
    grid.querySelectorAll(".mini-card.is-hovered").forEach((c) => c.classList.remove("is-hovered"));
    if (miniCard) miniCard.classList.add("is-hovered");
  });
  grid.addEventListener("mouseout", (e) => {
    const miniCard = e.target.closest(".mini-card");
    if (miniCard) miniCard.classList.remove("is-hovered");
  });

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".mini-card.is-clickable, .player-card.is-clickable");
    if (!card) return;
    const id = card.dataset.playerId;
    const room = state.room;
    const turn = room ? state.schedule[room.turnIndex] : null;
    const isReadyPhase = state.phase === "ready" || String(room?.status || "") === "await-ready";
    const isBanPhase = turn?.action === "ban";
    const source = isBanPhase
      ? (Array.isArray(state.opponentBanPlayers) ? state.opponentBanPlayers : [])
      : getDraftDisplayPlayers(room);
    const player = source.find((p) => String(p.id) === id);
    if (!player) return;

    state.actionError = "";
    const errEl = document.getElementById("draftActionError");
    if (errEl) errEl.hidden = true;
    if (isBanPhase && !isReadyPhase) {
      submitBan(player);
      return;
    }
    if (!isReadyPhase) {
      void submitPick(player);
      return;
    }
  });
}
