/* ============================================================
   Card and thumbnail markup shared by the phases

   `playerCardHtml` renders the grid card in the ban phase, the pick board
   and the Start Match screen. The thumbnails are the small staged/opponent
   chips down the ban sidebar; `--${size}` picks the height, which
   `banView.js` drives through the `--ban-slot-h` variable.
   ============================================================ */

import { escapeHtml } from "./utils.js";
import {
  getPlayerImageSrc,
  normalizePlayerForFooter,
  playerDetailSublineHtml,
  playerDetailTooltipText,
} from "./players.js";

export function imageOnlyThumbHtml(player, size = "md") {
  if (!player) return "";
  return `
    <div class="ban-phase-thumb ban-phase-thumb--${escapeHtml(size)}" data-player-id="${escapeHtml(player.id)}">
      <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
    </div>
  `;
}

export function opponentStagedBanThumbHtml(player, size = "md") {
  if (!player) return "";
  return `
    <div class="ban-phase-thumb ban-phase-thumb--${escapeHtml(size)} is-opponent-staged" data-player-id="${escapeHtml(player.id)}">
      <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
    </div>
  `;
}

export function stagedBanThumbHtml(player, size = "md") {
  if (!player) return "";
  return `
    <div class="ban-phase-thumb ban-phase-thumb--${escapeHtml(size)} is-staged" data-player-id="${escapeHtml(player.id)}">
      <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
      <button class="ban-thumb-remove" data-remove-ban="${escapeHtml(String(player.id))}" type="button" aria-label="Remove staged ban">×</button>
    </div>
  `;
}

export function playerCardHtml(player, o) {
  const { banned, picked, clickable } = o;
  const unavailable = banned || picked;
  const cls = [
    "player-card",
    clickable ? "is-clickable" : "",
    unavailable ? "is-unavailable" : "",
    banned ? "is-ban-taken" : "",
    picked ? "is-pick-taken" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tooltipText = playerDetailTooltipText(normalizePlayerForFooter(player));

  return `
    <div class="${cls}" data-player-id="${escapeHtml(player.id)}" tabindex="${clickable ? 0 : -1}" title="${escapeHtml(tooltipText)}">
      <div class="pc-img-wrap">
        <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
      </div>
      <div class="pc-footer">
        <div class="pc-footer-meta pmeta-in-card pc-footer-detail-only">${playerDetailSublineHtml(normalizePlayerForFooter(player))}</div>
      </div>
    </div>
  `;
}
