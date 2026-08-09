/* ============================================================
   The floating player-info panel, shared by both bundles.

   Every player card in this app is artwork with no room for text, so the four
   metadata lines My Players prints under its cards — region · nationality,
   league · club, foot · style, height · weight · age — are shown floating on
   hover instead. `playerDetailSublineHtml` draws them here and in that footer,
   so the two cannot drift apart.

   It replaced the native `title` tooltip on every one of those cards. Three
   reasons that was worth doing, beyond the ~1s delay and the OS styling:

     - a `title` cannot be styled, so the same information looked like a
       different app depending on where you met it;
     - `title` is unconditional. The pick board's `blur` reveal mode blurs the
       opponent's cards and sets `aria-hidden`, and the tooltip still printed
       their names in full — the exact thing the setting withholds;
     - it gave no way to show a player's details where the card carries none,
       which is what the game-plan pitch and the pick board's lineup needed.

   There is one panel element for the whole page, created on first use.
   ============================================================ */

import { escapeHtml, playerDetailSublineHtml } from "@/shared/players/playerMeta.js";

const GAP = 10;
const EDGE = 8;

let panelEl = null;
let anchorEl = null;

function panel() {
  if (panelEl) return panelEl;
  panelEl = document.createElement("div");
  panelEl.className = "player-hover-card";
  panelEl.hidden = true;
  document.body.appendChild(panelEl);
  return panelEl;
}

/**
 * Hides on any mouse move that is not still over the anchor.
 *
 * This is the guard, not `mouseleave`. Both bundles rebuild their grids under
 * the cursor — the ban grid on every staged ban, the room boards on a presence
 * poll — and an element replaced while hovered never fires `mouseleave`, so a
 * panel bound to it would be left open describing a card that no longer exists.
 * Testing the anchor on each move covers that and ordinary pointer-out with one
 * listener, and it is only attached while a panel is actually up.
 */
function onMove(e) {
  if (!anchorEl || !anchorEl.isConnected || !anchorEl.contains(e.target)) hidePlayerHoverCard();
}

export function hidePlayerHoverCard() {
  if (!panelEl || panelEl.hidden) return;
  panelEl.hidden = true;
  anchorEl = null;
  document.removeEventListener("mousemove", onMove, true);
  window.removeEventListener("scroll", hidePlayerHoverCard, true);
}

export function showPlayerHoverCard(anchor, player) {
  // Touch fires the pointer events too, but there a tap means "act on this
  // card" — a panel you then have to dismiss is in the way, not helpful.
  if (!window.matchMedia("(hover: hover)").matches) return;
  if (!anchor?.isConnected || !player) return;

  const el = panel();
  el.innerHTML = `
    <div class="player-hover-name">${escapeHtml(player.name || "Player")}</div>
    <div class="player-hover-detail">${playerDetailSublineHtml(player)}</div>`;
  el.hidden = false;
  anchorEl = anchor;
  position(el, anchor);

  document.addEventListener("mousemove", onMove, true);
  // Capture, so an element's own scroll is caught too: a fixed panel would
  // otherwise stay put while its card slid away underneath it.
  window.addEventListener("scroll", hidePlayerHoverCard, true);
}

/**
 * Beside the card — right if there is room, otherwise left, otherwise under it.
 *
 * The third branch is not a nicety. Clamping a too-far-left panel back to the
 * viewport edge instead slides it *over* the artwork it is describing: measured
 * at a 560px viewport, the ideal left was -4px and the clamp put the panel 12px
 * into the card. On a narrow screen neither side has room for it, so that is
 * the common case there, not the corner one.
 */
function position(el, anchor) {
  const a = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  const clampX = (v) => Math.max(EDGE, Math.min(v, window.innerWidth - w - EDGE));
  const clampY = (v) => Math.max(EDGE, Math.min(v, window.innerHeight - h - EDGE));

  const toRight = a.right + GAP;
  const toLeft = a.left - GAP - w;

  if (toRight + w <= window.innerWidth - EDGE) {
    el.style.left = `${toRight}px`;
    el.style.top = `${clampY(a.top + a.height / 2 - h / 2)}px`;
  } else if (toLeft >= EDGE) {
    el.style.left = `${toLeft}px`;
    el.style.top = `${clampY(a.top + a.height / 2 - h / 2)}px`;
  } else {
    el.style.left = `${clampX(a.left + a.width / 2 - w / 2)}px`;
    const below = a.bottom + GAP;
    el.style.top = `${below + h <= window.innerHeight - EDGE ? below : clampY(a.top - GAP - h)}px`;
  }
}

/** For an element you already hold — a game-plan slot, a squad card. */
export function bindPlayerHoverCard(target, player) {
  target.addEventListener("mouseenter", () => showPlayerHoverCard(target, player));
}

/**
 * For a container whose children are written with `innerHTML`. **Bind once, at
 * init — not per render**, or every rebuild stacks another listener on the same
 * container.
 *
 * `resolve(el)` returns the player for a matched child, or null to show
 * nothing — which is how a grid opts a card out (a concealed opponent, a slot
 * whose player is not in the squad any more).
 */
export function bindPlayerHoverCardGrid(container, selector, resolve) {
  if (!container || container.dataset.hoverCardBound === "1") return;
  container.dataset.hoverCardBound = "1";
  container.addEventListener("mouseover", (e) => {
    const target = e.target.closest?.(selector);
    if (!target || target === anchorEl) return;
    showPlayerHoverCard(target, resolve(target));
  });
}
