/**
 * Ban phase board.
 *
 * renderDraftUi runs every ~500ms off the presence poll, so every write here is
 * guarded by a state key: a compact fingerprint of the data that produced the
 * current DOM. Do NOT swap these for innerHTML string comparisons — browsers
 * normalize whitespace and drop the trailing slash on void elements when
 * serializing, so the strings never match and the grid rebuilds every cycle.
 */

import { escapeHtml } from '@/features/draft/utils.js';
import { state } from '@/features/draft/state.js';
import {
  playerCardHtml,
  imageOnlyThumbHtml,
  opponentStagedBanThumbHtml,
  stagedBanThumbHtml,
} from '@/features/draft/playerCards.js';
import { getBanListPlayers, normalizeSortValue } from '@/features/draft/playerQuery.js';
import { bindBanPhaseUiOnce } from './banInteractions.js';
import { renderBanToolbar } from './banToolbar.js';
import { banLimit } from '@/features/draft/engine/draftFlow.js';

const EMPTY_SLOT_HTML = `<div class="ban-side-empty-slot"></div>`;

/* ── Ban slot sizing ───────────────────────────────────────────────
   Ban cards are height-driven (`.ban-phase-thumb img` is `height: 100%;
   width: auto`), so the strip scales from the single `--ban-slot-h` custom
   property. A high ban cap needs more rows than fit — at 12 bans the natural
   96px card wants ~408px per strip, and the two strips share the sidebar — so
   pick the largest height at which every slot fits without scrolling. */
const SLOT_GAP = 8;         // .ban-side-strip gap
const SLOT_MAX_H = 96;      // natural .ban-phase-thumb height
const SLOT_MIN_H = 44;      // below this the card art stops being recognisable
const CARD_RATIO = 240 / 339;  // pesdb card art is 240 × 339
const SLOT_BORDER = 2;      // the thumb's 1px hairline, which sits outside the art

/* Layout width of one slot at height `h`. Keep in step with the width `calc()`
   on `.ban-side-empty-slot` — the two must agree or the column count this picks
   is not the one the strip actually wraps at. */
const slotWidth = (h) => SLOT_BORDER + (h - SLOT_BORDER) * CARD_RATIO;

/**
 * Publishes `--ban-slot-h` on the panel so both strips scale together.
 *
 * The strip's own height comes from the flex layout, not from its content, so
 * measuring it here cannot feed back into the value we set.
 */
function applyBanSlotHeight(strip, maxBans) {
  const panel = strip?.closest(".ban-phase-right");
  if (!panel) return;

  const availH = strip.clientHeight;
  const availW = strip.clientWidth;
  // not laid out yet (panel hidden) — leave whatever is already set
  if (!maxBans || maxBans < 1 || availH < 1 || availW < 1) return;

  let best = SLOT_MIN_H;
  for (let h = SLOT_MAX_H; h >= SLOT_MIN_H; h -= 2) {
    // a shorter card is also narrower, so more fit per row
    const cols = Math.max(1, Math.floor((availW + SLOT_GAP) / (slotWidth(h) + SLOT_GAP)));
    const rows = Math.ceil(maxBans / cols);
    if (rows * (h + SLOT_GAP) - SLOT_GAP <= availH) { best = h; break; }
  }

  // only write on change; this runs on every presence poll
  if (panel.dataset.slotH !== String(best)) {
    panel.dataset.slotH = String(best);
    panel.style.setProperty("--ban-slot-h", `${best}px`);
  }
}

const BAN_BOARD_IDS = [
  "draftBanPhaseBoard",
  "draftMyBansStrip",
  "draftBannedOnMeStrip",
  "banSearch",
  "banSort",
  "banPosition",
  "banGrid",
];

export function renderBanBoard({ room, mySide, theirSide, isMyTurn, readyPhase, visible }) {
  const el = Object.fromEntries(BAN_BOARD_IDS.map((id) => [id, document.getElementById(id)]));
  if (BAN_BOARD_IDS.some((id) => !el[id])) return;

  el.draftBanPhaseBoard.hidden = !visible;
  if (!visible) return;

  bindBanPhaseUiOnce();
  el.banSearch.value = state.banSearch || "";
  el.banSort.value = normalizeSortValue(state.banSort);
  el.banPosition.value = "";
  renderBanToolbar();

  const maxBans = banLimit(room.config);
  const myBans = room.bans[mySide] || [];
  const bannedOnMe = room.bans[theirSide] || [];
  const opponentStaged = state.opponentStagedBans || [];
  const myConfirmed = Boolean(room.bansConfirmed?.[mySide]);
  const theirConfirmed = Boolean(room.bansConfirmed?.[theirSide]);

  renderCounts(myBans, bannedOnMe, opponentStaged, maxBans);
  renderOpponentBadge(room[theirSide], theirConfirmed);
  renderMyBadge(room[mySide], myConfirmed);
  renderMyBansStatus(myConfirmed, theirConfirmed);

  applyBanSlotHeight(el.draftMyBansStrip, maxBans);

  renderBanStrip(el.draftMyBansStrip, {
    confirmed: myBans,
    staged: state.stagedBans,
    stagedHtml: stagedBanThumbHtml,
    remaining: remainingSlots(maxBans, myBans.length + state.stagedBans.length),
  });

  renderConfirmButton(myConfirmed);

  renderBanStrip(el.draftBannedOnMeStrip, {
    confirmed: bannedOnMe,
    staged: opponentStaged,
    stagedHtml: opponentStagedBanThumbHtml,
    remaining: remainingSlots(maxBans, bannedOnMe.length + opponentStaged.length),
  });

  renderBanGrid(el.banGrid, { room, mySide, maxBans, myBans, isMyTurn, readyPhase, myConfirmed });
}

const remainingSlots = (max, used) => (max > 0 ? Math.max(0, max - used) : 0);

function renderCounts(myBans, bannedOnMe, opponentStaged, maxBans) {
  const myCount = document.getElementById("draftMyBansCount");
  const theirCount = document.getElementById("draftBannedOnMeCount");
  if (myCount) myCount.textContent = `${myBans.length + state.stagedBans.length}/${maxBans}`;
  if (theirCount) theirCount.textContent = `${bannedOnMe.length + opponentStaged.length}/${maxBans}`;
}

/** Shared shape for the two identity pills (dot + name + status text). */
function paintBadge({ dotId, nameId, statusId }, { online, name, status, statusClass }) {
  const dot = document.getElementById(dotId);
  const nameEl = document.getElementById(nameId);
  const statusEl = document.getElementById(statusId);

  if (dot) dot.classList.toggle("is-online", online);
  if (nameEl && name) nameEl.textContent = name.toUpperCase();
  if (statusEl) {
    statusEl.textContent = status;
    statusEl.className = statusClass;
  }
}

const STATUS_BASE = "ban-opponent-status-text";
const STATUS_OFFLINE = `${STATUS_BASE} is-offline`;
const STATUS_CONFIRMED = `${STATUS_BASE} is-confirmed`;

function renderOpponentBadge(theirInfo, theirConfirmed) {
  const online = Boolean(theirInfo?.id);
  paintBadge(
    { dotId: "draftBanOpponentDot", nameId: "draftBanOpponentName", statusId: "draftBanOpponentStatus" },
    {
      online,
      name: theirInfo?.username,
      status: !online ? "· left the room" : theirConfirmed ? "· confirmed ✓" : "· is choosing...",
      statusClass: !online ? STATUS_OFFLINE : theirConfirmed ? STATUS_CONFIRMED : STATUS_BASE,
    },
  );
}

function renderMyBadge(myInfo, myConfirmed) {
  const offline = Boolean(state.presenceError);
  paintBadge(
    { dotId: "draftMyBansDot", nameId: "draftMyBansName", statusId: "draftMyBansBadgeStatus" },
    {
      online: !offline,
      name: myInfo?.username || "You",
      status: offline ? "· reconnecting..." : myConfirmed ? "· confirmed ✓" : "· is choosing...",
      statusClass: offline ? STATUS_OFFLINE : myConfirmed ? STATUS_CONFIRMED : STATUS_BASE,
    },
  );
}

function renderMyBansStatus(myConfirmed, theirConfirmed) {
  const el = document.getElementById("draftMyBansStatus");
  if (!el) return;

  if (myConfirmed && theirConfirmed) {
    el.textContent = "Both confirmed — moving to picks!";
    el.className = "ban-status-hint is-confirmed";
  } else if (myConfirmed) {
    el.textContent = "Waiting for opponent to confirm...";
    el.className = "ban-status-hint is-waiting";
  } else {
    el.textContent = "";
    el.className = "ban-status-hint";
  }
}

/**
 * One button, two jobs. Confirmed it becomes UN-CONFIRM and stays **enabled** —
 * waiting for the opponent is not a commitment, and until they confirm too you
 * are free to change your mind. It used to disable itself, which left the only
 * way back a page reload.
 */
function renderConfirmButton(myConfirmed) {
  const btn = document.getElementById("confirmBansBtn");
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = myConfirmed ? "UN-CONFIRM" : "CONFIRM BANS";
  btn.classList.toggle("is-confirmed", myConfirmed);
}

/**
 * Renders confirmed bans, then staged (pending) bans, then empty placeholders.
 * The newest thumb gets `is-new` so the spring-in animation plays once.
 */
function renderBanStrip(strip, { confirmed, staged, stagedHtml, remaining }) {
  const key = [
    ...confirmed.map((p) => `${p.id}c`),
    ...staged.map((p) => `${p.id}s`),
    `e${remaining}`,
  ].join(",");
  if (strip.dataset.bansKey === key) return;

  const prevCount = strip.children.length;
  strip.dataset.bansKey = key;
  strip.innerHTML = [
    ...confirmed.map((p) => imageOnlyThumbHtml(p)),
    ...staged.map((p) => stagedHtml(p)),
    ...Array.from({ length: remaining }, () => EMPTY_SLOT_HTML),
  ].join("");

  if (strip.children.length > prevCount) {
    [...strip.children]
      .filter((c) => c.classList.contains("ban-phase-thumb"))
      .pop()
      ?.classList.add("is-new");
  }
}

function renderBanGrid(grid, { room, mySide, maxBans, myBans, isMyTurn, readyPhase, myConfirmed }) {
  const rows = getBanListPlayers();
  const canStillBan = !maxBans || myBans.length + state.stagedBans.length < maxBans;
  const stagedIds = new Set(state.stagedBans.map((p) => String(p.id)));
  // Only YOUR bans grey a card out — the opponent banning it is irrelevant here.
  const myConfirmedIds = new Set(myBans.map((b) => String(b.id)));

  const flagFor = (id) =>
    myConfirmedIds.has(id) ? "b" : stagedIds.has(id) ? "s" : "";

  const stateKey = [
    isMyTurn ? 1 : 0,
    canStillBan ? 1 : 0,
    readyPhase ? 1 : 0,
    myConfirmed ? 1 : 0,
    rows.map((p) => String(p.id) + flagFor(String(p.id))).join(","),
  ].join("|");
  if (grid.dataset.stateKey === stateKey) return;

  grid.dataset.stateKey = stateKey;
  grid.innerHTML = rows.length
    ? rows.map((p) => {
        const id = String(p.id);
        const banned = myConfirmedIds.has(id) || stagedIds.has(id);
        // A confirmed side's bans are read-only until it un-confirms.
        const clickable = isMyTurn && canStillBan && !banned && !readyPhase && !myConfirmed;
        // No pick exists yet during the ban phase, so a card is never "picked".
        return playerCardHtml(p, { banned, picked: false, clickable });
      }).join("")
    : `<div class="ban-phase-empty ban-phase-empty--panel">${escapeHtml(banEmptyMessage())}</div>`;
}

function banEmptyMessage() {
  if (state.loadingOpponentBanPlayers || !state.opponentBanPlayersLoaded) {
    return "Loading opponent squad cards...";
  }
  return state.opponentBanPlayers.length
    ? "Opponent squad loaded."
    : "No opponent players to show yet.";
}
