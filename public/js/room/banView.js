/**
 * Ban phase board.
 *
 * renderDraftUi runs every ~500ms off the presence poll, so every write here is
 * guarded by a state key: a compact fingerprint of the data that produced the
 * current DOM. Do NOT swap these for innerHTML string comparisons — browsers
 * normalize whitespace and drop the trailing slash on void elements when
 * serializing, so the strings never match and the grid rebuilds every cycle.
 */

import { escapeHtml } from './utils.js';
import { state } from './state.js';
import {
  banPlayerCardHtml,
  bindBanPhaseUiOnce,
  getBanListPlayers,
  imageOnlyThumbHtml,
  normalizeBanSortValue,
  opponentStagedBanThumbHtml,
  renderBanToolbar,
  stagedBanThumbHtml,
} from './ban.js';
import { banLimit } from './draftFlow.js';

const EMPTY_SLOT_HTML = `<div class="ban-side-empty-slot"></div>`;

/* ── Ban slot sizing ───────────────────────────────────────────────
   Ban cards are height-driven (`.ban-phase-thumb img` is `height: 100%;
   width: auto`), so the strip scales from the single `--ban-slot-h` custom
   property. A high ban cap needs more rows than fit — at 12 bans the natural
   96px card wants ~408px per strip, and the two strips share the sidebar — so
   pick the largest height at which every slot fits without scrolling. */
const SLOT_GAP = 8;      // .ban-side-strip gap
const SLOT_MAX_H = 96;   // natural .ban-phase-thumb--md height
const SLOT_MIN_H = 44;   // below this the card art stops being recognisable
const SLOT_RATIO = 68 / 96;

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
    const cols = Math.max(1, Math.floor((availW + SLOT_GAP) / (h * SLOT_RATIO + SLOT_GAP)));
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
  el.banSort.value = normalizeBanSortValue(state.banSort);
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

  renderBanGrid(el.banGrid, { room, mySide, maxBans, myBans, isMyTurn, readyPhase });
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

function renderConfirmButton(myConfirmed) {
  const btn = document.getElementById("confirmBansBtn");
  if (!btn) return;
  btn.disabled = myConfirmed;
  btn.textContent = myConfirmed ? "CONFIRMED ✓" : "CONFIRM BANS";
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
    ...confirmed.map((p) => imageOnlyThumbHtml(p, "md")),
    ...staged.map((p) => stagedHtml(p, "md")),
    ...Array.from({ length: remaining }, () => EMPTY_SLOT_HTML),
  ].join("");

  if (strip.children.length > prevCount) {
    [...strip.children]
      .filter((c) => c.classList.contains("ban-phase-thumb"))
      .pop()
      ?.classList.add("is-new");
  }
}

function renderBanGrid(grid, { room, mySide, maxBans, myBans, isMyTurn, readyPhase }) {
  const rows = getBanListPlayers();
  const canStillBan = !maxBans || myBans.length + state.stagedBans.length < maxBans;
  const stagedIds = new Set(state.stagedBans.map((p) => String(p.id)));
  // Only YOUR bans grey a card out — the opponent banning it is irrelevant here.
  const myConfirmedIds = new Set(myBans.map((b) => String(b.id)));

  const flagFor = (id) =>
    myConfirmedIds.has(id) ? "b" : stagedIds.has(id) ? "s" : room.pickedPlayerIds.includes(id) ? "p" : "";

  const stateKey = [
    isMyTurn ? 1 : 0,
    canStillBan ? 1 : 0,
    readyPhase ? 1 : 0,
    rows.map((p) => String(p.id) + flagFor(String(p.id))).join(","),
  ].join("|");
  if (grid.dataset.stateKey === stateKey) return;

  grid.dataset.stateKey = stateKey;
  grid.innerHTML = rows.length
    ? rows.map((p) => {
        const id = String(p.id);
        const banned = myConfirmedIds.has(id) || stagedIds.has(id);
        const picked = room.pickedPlayerIds.includes(id);
        const clickable = isMyTurn && canStillBan && !banned && !picked && !readyPhase;
        return banPlayerCardHtml(p, { banned, picked, clickable });
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
