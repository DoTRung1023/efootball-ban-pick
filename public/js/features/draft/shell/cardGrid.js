/* ============================================================
   Click, hover and info-toggle handling for the card grid, whichever phase owns it

   One handler serves both phases — it reads the current turn to decide
   whether a click is a ban or a pick — which is why it sits in shell/ rather
   than in ban/ or pick/. `bindGridInfoToggle` is here for the same reason.
   ============================================================ */

import { state } from "@/features/draft/state.js";
import { escapeHtml } from "@/features/draft/utils.js";
import { normalizePlayerForFooter } from "@/features/draft/players.js";
import { isReadyPhase } from "@/features/draft/engine/draftFlow.js";
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
    const readyPhase = isReadyPhase(room);
    const isBanPhase = turn?.action === "ban";
    const source = isBanPhase
      ? (Array.isArray(state.opponentBanPlayers) ? state.opponentBanPlayers : [])
      : getDraftDisplayPlayers(room);
    const player = source.find((p) => String(p.id) === id);
    if (!player) return;

    state.actionError = "";
    const errEl = document.getElementById("draftActionError");
    if (errEl) errEl.hidden = true;
    if (isBanPhase && !readyPhase) {
      submitBan(player);
      return;
    }
    if (!readyPhase) {
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

/**
 * Repaints the state classes on cards already in the grid.
 *
 * **Both boards show the whole roster and mark what is out of play**, rather
 * than dropping those cards — a squad that shrinks as the draft runs makes you
 * re-scan a moving list, and the pool is the one place you go to check whether
 * a particular player is still there. Marked, he answers that; filtered, his
 * absence is indistinguishable from a search that never matched him. There used
 * to be a `renderPoolCount` line over each grid saying *"9 of 35 · 3 banned · 23
 * picked"*, which existed only to explain the shrinking, and it goes with it.
 *
 * Which means this function is now the whole mechanism: the grid is rebuilt only
 * when **which players are in it** changes, and every state a card can be in is
 * a class toggled here. Rebuilding for a state change instead would throw away
 * 40 `<img loading="lazy">` elements and make 40 more — the cards lose their
 * height until the new images are sized, the scroller clamps `scrollTop` to the
 * collapsed content, and the list jumps upward. See the `aspect-ratio` note in
 * `ban.css`.
 *
 * These classes are deliberately **not** part of the caller's diff key, so
 * mutating them here cannot desync the guard the way `is-hovered` would on a key
 * built from rendered state (see `ban-phase.md`).
 */
/**
 * The "nothing to show" block for either card grid.
 *
 * `grid-column: 1 / -1` is the whole point — see `.pool-empty` in `shell.css`.
 * Both grids are `display: grid` with `auto-fill` columns, so a plain block lands
 * in the first 128px cell and the message reads as a broken card rather than as
 * an empty panel.
 *
 * Shaped after `.team-empty` on My Players, because it answers the same question
 * in the same words and there is no reason for the two to look different.
 */
export function poolEmptyHtml(message) {
  return `<div class="pool-empty"><p>${escapeHtml(message)}</p></div>`;
}

export function paintCardFlags(grid, flagsFor) {
  for (const card of grid.querySelectorAll(".player-card")) {
    const { banned, picked, pending = false, clickable } = flagsFor(card.dataset.playerId || "");
    card.classList.toggle("is-ban-taken", Boolean(banned));
    card.classList.toggle("is-pick-taken", Boolean(picked));
    card.classList.toggle("is-unavailable", Boolean(banned || picked));
    card.classList.toggle("is-pending", Boolean(pending));
    card.classList.toggle("is-clickable", Boolean(clickable));
    // `playerCardHtml` sets this at build time; keep the two in step.
    card.tabIndex = clickable ? 0 : -1;
  }
}
