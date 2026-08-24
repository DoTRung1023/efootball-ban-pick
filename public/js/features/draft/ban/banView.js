/**
 * Ban phase board.
 *
 * renderDraftUi runs every ~500ms off the presence poll, so every write here is
 * guarded by a state key: a compact fingerprint of the data that produced the
 * current DOM. Do NOT swap these for innerHTML string comparisons — browsers
 * normalize whitespace and drop the trailing slash on void elements when
 * serializing, so the strings never match and the grid rebuilds every cycle.
 */

import { state } from '@/features/draft/state.js';
import {
  playerCardHtml,
  concealedBanThumbHtml,
  imageOnlyThumbHtml,
  opponentStagedBanThumbHtml,
  stagedBanThumbHtml,
} from '@/features/draft/playerCards.js';
import { getBanListPlayers, normalizeSortValue } from '@/features/draft/playerQuery.js';
import { paintCardFlags, poolEmptyHtml } from '@/features/draft/shell/cardGrid.js';
import { bindBanPhaseUiOnce } from './banInteractions.js';
import { renderBanToolbar } from './banToolbar.js';
import { banLimit, isSoloTurn } from '@/features/draft/engine/draftFlow.js';
import { normalizeRevealMode } from '@/features/draft/state.js';
import { REVEAL_MODE_BLUR, REVEAL_MODE_HIDDEN } from '@/features/draft/constants.js';
import { opponentLiveness } from '@/features/draft/engine/presence.js';

import { icon } from '@/shared/icons/icon.js';
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

  /* One flag, read by every locked rule in `ban.css` and by the read-only
     banner above the grid. The grid already refuses clicks while confirmed —
     this is what makes it *look* refused, instead of broken. */
  el.draftBanPhaseBoard.classList.toggle("is-locked", myConfirmed);

  /* What the opponent is allowed to see of your bans is `banRevealMode`, and it
     only ever governs *their staged* ones: `bans[theirSide]` does not fill until
     they confirm, and once they have, you need to know what you lost before you
     pick. See `ban-phase.md`. */
  const banReveal = normalizeRevealMode(room.config?.banRevealMode);
  const concealTheirs = theirConfirmed ? "" : banReveal;
  const hideTheirs = concealTheirs === REVEAL_MODE_HIDDEN;

  renderCounts(myBans, bannedOnMe, opponentStaged, maxBans, concealTheirs);
  renderOpponentBadge(room[theirSide], theirConfirmed);
  renderMyBadge(room[mySide], myConfirmed);
  renderMyBansStatus(myConfirmed, theirConfirmed, isSoloTurn(room));

  applyBanSlotHeight(el.draftMyBansStrip, maxBans);

  renderBanStrip(el.draftMyBansStrip, {
    confirmed: myBans,
    staged: state.stagedBans,
    stagedHtml: stagedBanThumbHtml,
    remaining: remainingSlots(maxBans, myBans.length + state.stagedBans.length),
  });

  /* An alternating phase has nothing to confirm — a ban *is* the turn — so the
     button goes and the hint below it carries whose turn it is instead. */
  const solo = isSoloTurn(room);
  renderConfirmButton(myConfirmed, solo);
  renderTurnHint(solo, isMyTurn, room[theirSide]?.username);

  renderBanStrip(el.draftBannedOnMeStrip, {
    confirmed: bannedOnMe,
    /* `hidden` drops them from the strip entirely, so the empty slots below
       cover them and the strip is indistinguishable from one where they have
       not chosen yet — "nothing but their status", the same as the pick side. */
    staged: hideTheirs ? [] : opponentStaged,
    stagedHtml: concealTheirs === REVEAL_MODE_BLUR ? concealedBanThumbHtml : opponentStagedBanThumbHtml,
    /* Counted off what is *shown*, not what exists. Dropping the thumbs under
       `hidden` while still reserving their slots left a strip two short of full,
       which says "they have banned two" as plainly as the faces would. */
    remaining: remainingSlots(maxBans, bannedOnMe.length + (hideTheirs ? 0 : opponentStaged.length)),
    concealKey: concealTheirs,
  });

  renderBanGrid(el.banGrid, { maxBans, myBans, isMyTurn, readyPhase, myConfirmed });
}

const remainingSlots = (max, used) => (max > 0 ? Math.max(0, max - used) : 0);

function renderCounts(myBans, bannedOnMe, opponentStaged, maxBans, concealTheirs) {
  const myCount = document.getElementById("draftMyBansCount");
  const theirCount = document.getElementById("draftBannedOnMeCount");
  if (myCount) myCount.textContent = `${myBans.length + state.stagedBans.length}/${maxBans}`;
  if (!theirCount) return;
  /* `blur` keeps the count — it is the whole difference between the two modes:
     the shape, not who. `hidden` counts only what they have confirmed, which
     until they do is nothing. */
  const theirs = concealTheirs === REVEAL_MODE_HIDDEN
    ? bannedOnMe.length
    : bannedOnMe.length + opponentStaged.length;
  theirCount.textContent = `${theirs}/${maxBans}`;
}

/** Shared shape for the two identity pills (dot + name + status text). */
function paintBadge({ dotId, nameId, statusId }, { online, name, status, statusClass }) {
  const dot = document.getElementById(dotId);
  const nameEl = document.getElementById(nameId);
  const statusEl = document.getElementById(statusId);

  if (dot) dot.classList.toggle("is-online", online);
  if (nameEl && name) nameEl.textContent = name.toUpperCase();
  if (statusEl) {
    /* `innerHTML`, not `textContent`: the confirmed status carries a tick icon.
       Every value comes from the fixed ladder above — no seat data reaches it,
       the username goes through `nameEl.textContent` on the line before. */
    statusEl.innerHTML = status;
    statusEl.className = statusClass;
  }
}

const STATUS_BASE = "ban-opponent-status-text";
const STATUS_OFFLINE = `${STATUS_BASE} is-offline`;
const STATUS_CONFIRMED = `${STATUS_BASE} is-confirmed`;
const STATUS_WAITING = `${STATUS_BASE} is-waiting`;

/**
 * The opponent badge, off their heartbeat rather than off whether the seat is
 * filled.
 *
 * It used to read `Boolean(theirInfo?.id)`, which only ever went false when
 * somebody pressed Leave — so a player who closed their browser sat at
 * "· is choosing…" indefinitely, and this badge is the only place the other
 * side is described. `opponentLiveness` owns the thresholds; see
 * `presence-and-reconnect.md`.
 *
 * `away` keeps the dot lit. A backgrounded tab is still connected — it is the
 * *heartbeat* that is throttled, not the player.
 */
function renderOpponentBadge(theirInfo, theirConfirmed) {
  const seated = Boolean(theirInfo?.id);
  const liveness = opponentLiveness(theirInfo);
  const here = liveness === "connected" || liveness === "away";

  const status = !seated
    ? "· left the room"
    : liveness === "gone"
      ? "· connection lost"
      : liveness === "reconnecting"
        ? "· reconnecting..."
        : theirConfirmed
          ? `· confirmed ${icon("check", { size: 11 })}`
          : liveness === "away"
            ? "· tabbed away"
            : "· is choosing...";

  paintBadge(
    { dotId: "draftBanOpponentDot", nameId: "draftBanOpponentName", statusId: "draftBanOpponentStatus" },
    {
      online: here,
      name: theirInfo?.username,
      status,
      statusClass: !seated || liveness === "gone"
        ? STATUS_OFFLINE
        : liveness === "reconnecting"
          ? STATUS_WAITING
          : theirConfirmed
            ? STATUS_CONFIRMED
            : STATUS_BASE,
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
      status: offline
        ? "· reconnecting..."
        : myConfirmed ? `· confirmed ${icon("check", { size: 11 })}` : "· is choosing...",
      statusClass: offline ? STATUS_OFFLINE : myConfirmed ? STATUS_CONFIRMED : STATUS_BASE,
    },
  );
}

function renderMyBansStatus(myConfirmed, theirConfirmed, solo) {
  const el = document.getElementById("draftMyBansStatus");
  if (!el) return;
  // `renderTurnHint` owns this line while turns alternate.
  if (solo) return;

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
function renderConfirmButton(myConfirmed, solo) {
  const btn = document.getElementById("confirmBansBtn");
  if (!btn) return;
  btn.hidden = solo;
  if (solo) return;
  btn.disabled = false;
  btn.textContent = myConfirmed ? "UN-CONFIRM" : "CONFIRM BANS";
  btn.classList.toggle("is-confirmed", myConfirmed);
}

/**
 * Whose turn it is, in the line the CONFIRM button vacated.
 *
 * The grid already refuses a click that is not yours, but a board that simply
 * stops responding says nothing about why — this is the sentence that does.
 */
function renderTurnHint(solo, isMyTurn, theirName) {
  const el = document.getElementById("draftMyBansStatus");
  if (!el || !solo) return;
  el.textContent = isMyTurn
    ? "Your turn — pick one player to ban"
    : `Waiting for ${theirName || "your opponent"} to ban…`;
  el.className = isMyTurn ? "ban-status-hint is-confirmed" : "ban-status-hint is-waiting";
}

/**
 * Renders confirmed bans, then staged (pending) bans, then empty placeholders.
 * The newest thumb gets `is-new` so the spring-in animation plays once.
 */
function renderBanStrip(strip, { confirmed, staged, stagedHtml, remaining, concealKey = "" }) {
  const key = [
    ...confirmed.map((p) => `${p.id}c`),
    ...staged.map((p) => `${p.id}s`),
    `e${remaining}`,
    /* In the key because the same players render differently under a different
       reveal mode — without it, switching the mode mid-phase repaints nothing. */
    `r${concealKey}`,
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

/**
 * The opponent's whole squad, with the cards you have taken out of it marked.
 *
 * A card you have banned — staged or confirmed — used to **leave** the grid, on
 * the reasoning that it is not bannable again and `#draftMyBansStrip` already
 * lists your bans. It comes back marked instead: the pool is where you go to ask
 * "is he still available?", and a filtered grid answers that question by
 * omission, which reads the same as a search that never matched him. It also
 * made the list move under the pointer on every ban.
 *
 * Search, sort and the FILTER panel still remove cards — those are you asking
 * for a shorter list. This is the draft removing one, which is different.
 *
 * **The ban settings hide nobody here, and cannot.** A maximum only bites once a
 * lineup has cards counting toward it, and during the ban phase neither side has
 * picked anything — so every one of their players is still a legal pick.
 */
function renderBanGrid(grid, { maxBans, myBans, isMyTurn, readyPhase, myConfirmed }) {
  const pool = getBanListPlayers();
  const canStillBan = !maxBans || myBans.length + state.stagedBans.length < maxBans;
  const bannedIds = new Set([
    ...myBans.map((b) => String(b.id)),
    ...state.stagedBans.map((p) => String(p.id)),
  ]);

  /* A confirmed side's bans are read-only until it un-confirms, and a card
     already banned is not bannable again — it stays on screen, it just stops
     taking the click. No pick exists yet in this phase, so `picked` is never
     true here. */
  const flagsFor = (id) => {
    const banned = bannedIds.has(id);
    return {
      banned,
      picked: false,
      clickable: !banned && isMyTurn && canStillBan && !readyPhase && !myConfirmed,
    };
  };

  /* Keyed on **which players, in what order** and nothing else — banning
     someone changes only his flags, which `paintCardFlags` applies in place.
     See the note there for what a rebuild would cost. */
  const rowsKey = pool.map((p) => String(p.id)).join(",");
  if (grid.dataset.rowsKey !== rowsKey) {
    grid.dataset.rowsKey = rowsKey;
    grid.innerHTML = pool.length
      ? pool.map((p) => playerCardHtml(p, flagsFor(String(p.id)))).join("")
      : poolEmptyHtml(banEmptyMessage());
    return; // built with the current flags already applied
  }

  paintCardFlags(grid, flagsFor);
}

/**
 * An empty grid means one of three things and they are not interchangeable:
 * still loading, loaded but the opponent has no cards, or a search that matched
 * nobody. "Already banned" is no longer one of them — banned cards stay.
 */
function banEmptyMessage() {
  if (state.loadingOpponentBanPlayers || !state.opponentBanPlayersLoaded) {
    return "Loading opponent squad cards...";
  }
  return state.opponentBanPlayers.length
    ? "No player matches this search."
    : "No opponent players to show yet.";
}
