/* ============================================================
   Card and thumbnail markup shared by the phases

   `playerCardHtml` renders the grid card in the ban phase, the pick board
   and the Start Match screen. The thumbnails are the small staged/opponent
   chips down the ban sidebar; there is one thumb size, and its height comes
   from the `--ban-slot-h` variable that `banView.js` drives.
   ============================================================ */

import { escapeHtml } from "./utils.js";
import {
  getPlayerImageSrc,
  normalizePlayerForFooter,
  playerDetailSublineHtml,
} from "./players.js";

export function imageOnlyThumbHtml(player) {
  if (!player) return "";
  return `
    <div class="ban-phase-thumb" data-player-id="${escapeHtml(player.id)}">
      <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
    </div>
  `;
}

export function opponentStagedBanThumbHtml(player) {
  if (!player) return "";
  return `
    <div class="ban-phase-thumb is-opponent-staged" data-player-id="${escapeHtml(player.id)}">
      <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
    </div>
  `;
}

export function stagedBanThumbHtml(player) {
  if (!player) return "";
  return `
    <div class="ban-phase-thumb is-staged" data-player-id="${escapeHtml(player.id)}">
      <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
      <button class="ban-thumb-remove" data-remove-ban="${escapeHtml(String(player.id))}" type="button" aria-label="Remove staged ban">×</button>
    </div>
  `;
}

/**
 * `footer: false` renders the art alone. The opponent's picks use it — their
 * lineup is context, not something you act on, and the four metadata lines are
 * unreadable at that column width anyway.
 *
 * `pending: true` is the pick board's "chosen, waiting for a slot" state. Only
 * that board passes it; the ban grid stages into a strip instead, so it has no
 * equivalent.
 */
export function playerCardHtml(player, o) {
  const { banned, picked, clickable, footer = true, pending = false } = o;
  const unavailable = banned || picked;
  const cls = [
    "player-card",
    clickable ? "is-clickable" : "",
    unavailable ? "is-unavailable" : "",
    banned ? "is-ban-taken" : "",
    picked ? "is-pick-taken" : "",
    pending ? "is-pending" : "",
  ]
    .filter(Boolean)
    .join(" ");

  /* No `title`. The styled hover panel replaced it (see
     `shared/ui/playerHoverCard.js`), and the grids that should offer one bind
     it themselves — which is the point: a `title` here was unconditional, so
     the opponent's cards carried one under the `blur` reveal mode and printed
     in full the names the blur and the `aria-hidden` exist to withhold. */
  return `
    <div class="${cls}" data-player-id="${escapeHtml(player.id)}" tabindex="${clickable ? 0 : -1}">
      <div class="pc-img-wrap">
        <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
      </div>
      ${footer ? `<div class="pc-footer">
        <div class="pc-footer-meta pmeta-in-card pc-footer-detail-only">${playerDetailSublineHtml(normalizePlayerForFooter(player))}</div>
      </div>` : ""}
    </div>
  `;
}
