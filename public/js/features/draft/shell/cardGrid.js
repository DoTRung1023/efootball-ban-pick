/* ============================================================
   Click, hover and info-toggle handling for the card grid, whichever phase owns it

   One handler serves both phases — it reads the current turn to decide
   whether a click is a ban or a pick — which is why it sits in shell/ rather
   than in ban/ or pick/. `bindGridInfoToggle` is here for the same reason.
   ============================================================ */

import { state } from "@/features/draft/state.js";
import { normalizePlayerForFooter } from "@/features/draft/players.js";
import { bindPlayerHoverCardGrid } from "@/shared/ui/playerHoverCard.js";

/**
 * Hovering a card floats the player's info. Here for the same reason as
 * `bindGridInfoToggle`: the ban grid, the pick pool and the pick lineup all
 * want it, and each supplies its own lookup.
 *
 * `selector` is what counts as a card in this container and `findPlayer(el)`
 * returns the player it stands for, or null to show nothing — which is how a
 * grid opts a card out. **Bind once**, from a phase's `bind*PhaseUiOnce`: the
 * listener is delegated, so it survives every rebuild of the grid, and binding
 * per render would stack a listener each time.
 *
 * `normalizePlayerForFooter` is applied here so no caller has to remember it:
 * `nation` is `nationality` in some of these rows, and the panel prints the
 * same four lines the card footer does.
 */
export function bindCardGridHover(containerId, selector, findPlayer) {
  const container = document.getElementById(containerId);
  if (!container) return;
  bindPlayerHoverCardGrid(container, selector, (el) => {
    const p = findPlayer(el);
    return p ? { ...normalizePlayerForFooter(p), name: p.name } : null;
  });
}

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

/**
 * SHOW INFO / HIDE INFO — toggles the footer under each card in a grid.
 *
 * Shared by both boards, and bound from inside `bind*PhaseUiOnce` rather than on
 * DOMContentLoaded: the pick grid does not exist until its board first renders,
 * so a load-time lookup would find nothing and silently do nothing.
 *
 * The preference is per-grid in localStorage, so hiding info while banning does
 * not also hide it while picking.
 */
export function bindGridInfoToggle(btnId, gridId, storageKey) {
  const btn = document.getElementById(btnId);
  const grid = document.getElementById(gridId);
  if (!btn || !grid || btn.dataset.infoBound) return;
  btn.dataset.infoBound = "1";

  const apply = (isHidden) => {
    grid.classList.toggle("info-hidden", isHidden);
    btn.setAttribute("aria-pressed", isHidden ? "true" : "false");
    btn.textContent = isHidden ? "SHOW INFO" : "HIDE INFO";
    btn.classList.toggle("is-off", isHidden);
  };

  let hidden = false;
  try {
    hidden = localStorage.getItem(storageKey) === "1";
  } catch {
    // private mode / storage disabled — fall back to showing info
  }
  apply(hidden);

  btn.addEventListener("click", () => {
    hidden = !hidden;
    apply(hidden);
    try {
      localStorage.setItem(storageKey, hidden ? "1" : "0");
    } catch {
      // the toggle still works for this session
    }
  });
}
