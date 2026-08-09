/**
 * Pick phase board: squad pool (left), formation pitch (centre), the opponent's
 * picks (right).
 *
 * The board starts empty — LOAD GAME PLAN is the only thing that fills it in one
 * go, and it opens the dialog this module also renders.
 *
 * Like the ban board, every DOM write is behind a state-key guard because this
 * re-renders on every presence poll.
 */

import {
  FIXED_PICKS_PER_SIDE,
  FORMATION_LAYOUTS,
  REVEAL_MODE_BLUR,
  REVEAL_MODE_HIDDEN,
  REVEAL_MODE_INSTANT,
} from '@/features/draft/constants.js';
import { playerMatchesAllowanceCategory } from '@/features/draft/allowance.js';
import { escapeHtml } from '@/features/draft/utils.js';
import { state, normalizeRevealMode } from '@/features/draft/state.js';
import {
  buildOrderedSlotMap,
  filledPicks,
  getFormationLayout,
  getPlayerImageSrc,
  normalizeDraftPlayer,
  normalizeFormation,
  pickCount,
  BENCH_ROW_LABEL,
  PITCH_ROW_LABELS,
} from '@/features/draft/players.js';
import { playerCardHtml } from '@/features/draft/playerCards.js';
import { getPickListPlayers } from '@/features/draft/playerQuery.js';
import { bindPickPhaseUiOnce, renderPickPosTabs, renderPickToolbar } from './pick.js';
import { getPickFormation } from '@/features/draft/gamePlans.js';
import { pickLimit } from '@/features/draft/engine/draftFlow.js';

const LINEUP_SIZE = 11;

/* ── Pitch slot sizing ─────────────────────────────────────────
   The pitch is always four rows of card-shaped slots inside a column whose
   height is set by the layout, so a *fixed* slot width is wrong at every size
   but one: it scrolls on a short window and wastes space on a tall one. Measure
   the box and pick the largest slot that fits, exactly as `applyBanSlotHeight`
   does for the ban strip.

   `.pick-pitch-wrap` takes its height from flex, not from its contents, so
   resizing the slots cannot feed back into the measurement. */
const PITCH_ROWS = 4;          // every formation in FORMATION_LAYOUTS has four
const PITCH_ROW_GAP = 10;      // .pick-pitch row gap
const PITCH_COL_GAP = 8;       // .pick-pitch-row gap
const PITCH_PAD_Y = 8;         // .pick-pitch padding: 4px 0
const CARD_RATIO = 240 / 339;  // pesdb card art is 240 × 339
const SLOT_MAX_W = 116;        // past this the pitch reads as a poster, not a squad
/* The floor is where shrinking stops and the column is allowed to scroll again.
   40px still fits a four-row pitch into the 276px the wrap gets at 1024 × 768,
   which is the smallest desktop window the three-column layout survives; below
   860px the layout stacks and the whole view scrolls instead. */
const SLOT_MIN_W = 40;

/** Only writes on change; this runs on every presence poll. */
function setPitchSlotWidth(pitch, width) {
  if (pitch.dataset.slotW === String(width)) return;
  pitch.dataset.slotW = String(width);
  pitch.style.setProperty("--pick-slot-w", `${width}px`);
}

function applyPitchSlotWidth(formation) {
  const wrap = document.querySelector(".pick-pitch-wrap");
  const pitch = document.getElementById("pickPitch");
  if (!wrap || !pitch) return;

  const availH = wrap.clientHeight;
  const availW = wrap.clientWidth;
  // not laid out yet (board hidden) — leave whatever is already set
  if (availH < 1 || availW < 1) return;

  const rowH = (availH - PITCH_ROW_GAP * (PITCH_ROWS - 1) - PITCH_PAD_Y) / PITCH_ROWS;
  // the widest row is what the column has to hold side by side
  const perRow = Math.max(...getFormationLayout(formation).map((row) => row.slots.length));
  const byWidth = (availW - PITCH_COL_GAP * (perRow - 1)) / perRow;

  let width = Math.max(
    SLOT_MIN_W,
    Math.min(SLOT_MAX_W, Math.floor(Math.min(rowH * CARD_RATIO, byWidth))),
  );
  setPitchSlotWidth(pitch, width);

  /* Then check, because the arithmetic above only knows the gaps and padding
     *this module* knows about. Anything else that moves the column — the
     allowance pills wrapping to a second line, CONFIRM PICKS appearing, a gap
     changed in the stylesheet — lands here as a few pixels of overflow, and a
     few pixels is all it takes to put a scrollbar back. Measuring beats
     predicting; this converges in one step and then costs a single read. */
  for (let i = 0; i < 8 && width > SLOT_MIN_W && wrap.scrollHeight > wrap.clientHeight + 1; i += 1) {
    width -= 1;
    setPitchSlotWidth(pitch, width);
  }
}
/** The opponent's cards are display-only — you cannot act on their picks. */
const STATIC_CARD = { banned: false, picked: false, clickable: false, footer: false };

export function renderPickBoard({ room, mySide, theirSide, visible }) {
  const board = document.getElementById("draftPickPhaseBoard");
  if (!board) return;

  board.hidden = !visible;
  if (!visible) return;

  bindPickPhaseUiOnce();

  const search = document.getElementById("pickSearch");
  if (search && search !== document.activeElement) search.value = state.pickSearch || "";
  renderPickToolbar();
  renderPickPosTabs();

  const myPicks = room.picks[mySide] || [];
  const theirPicks = room.picks[theirSide] || [];
  const maxPicks = pickLimit(room.config) || FIXED_PICKS_PER_SIDE;

  /* While a card is chosen, every slot is a live drop target — the empty ones
     say so rather than waiting to be discovered by hover. */
  board.classList.toggle("is-placing", state.pickPendingPlayerId !== null);

  renderFormationPanel(getPickFormation());
  renderClearAll(room, myPicks);
  renderPickPlanList();
  renderPickGrid(room, mySide, theirSide);
  renderPickPitch(myPicks, maxPicks);
  renderPickAllowanceBar(room, myPicks, maxPicks);
  renderOpponentPicks(room, theirSide, theirPicks, maxPicks, normalizeRevealMode(room.config?.revealMode));

  /* Last, and that ordering is the point: every other write in this function can
     change the height of the pitch column — the bench wrapping to a second row,
     the allowance pills, CONFIRM PICKS appearing — so measuring before them
     sizes the slots against a box that is about to change. */
  applyPitchSlotWidth(getPickFormation());
}

// ── Formation dropdown + plan picker ─────────────────────────

/** Built once, then only the active flag is toggled. */
function renderFormationPanel(formation) {
  const label = document.getElementById("pickFormationLabel");
  if (label) label.textContent = formation;

  const panel = document.getElementById("pickFormationPanel");
  if (!panel) return;

  if (!panel.dataset.builtFormations) {
    panel.dataset.builtFormations = "1";
    panel.innerHTML = Object.keys(FORMATION_LAYOUTS)
      .map((f) => `<button type="button" data-pick-formation="${escapeHtml(f)}" class="${f === formation ? "is-active" : ""}">${escapeHtml(f)}</button>`)
      .join("");
    return;
  }

  panel.querySelectorAll("[data-pick-formation]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-pick-formation") === formation);
  });
}

/**
 * The LOAD GAME PLAN dialog's list. Rendered on every poll like everything else
 * here, so it is behind its own state key — the dialog can be open while the
 * board re-renders underneath it.
 */
function renderPickPlanList() {
  const list = document.getElementById("pickPlanList");
  if (!list) return;

  const plans = state.draftGamePlans;
  const key = `${state.draftGamePlansLoading ? "l" : ""}|${plans.map((p) => `${p.id}:${p.formation}`).join(",")}`;
  if (list.dataset.planKey === key) return;
  list.dataset.planKey = key;

  if (state.draftGamePlansLoading) {
    list.innerHTML = `<div class="pick-plan-empty">Loading your game plans...</div>`;
    return;
  }
  if (!plans.length) {
    list.innerHTML = `<div class="pick-plan-empty">No saved game plans. Build one on the home page first.</div>`;
    return;
  }

  /* Every row looks the same. Loading a plan is a one-shot action, not a
     selection: the lineup is yours to edit afterwards, so marking a plan as
     "current" would claim a link between the two that stops being true the
     moment you swap a slot. */
  list.innerHTML = plans.map((plan) => `
      <button type="button" class="pick-plan-item" data-pick-plan="${escapeHtml(String(plan.id))}">
        <span class="pick-plan-badge">${escapeHtml(normalizeFormation(plan.formation))}</span>
        <span class="pick-plan-name">${escapeHtml(plan.name || "Plan")}</span>
      </button>`).join("");
}

// ── Squad pool grid ──────────────────────────────────────────

/**
 * The squad pool.
 *
 * **Only your own picks grey a card out.** Picks are per-side — the opponent
 * drafts from their own squad — so their taking a player says nothing about
 * yours. This used to read the union of both sides, which showed a green
 * "PICKED" badge on a player the *opponent* had taken.
 *
 * The opponent's *bans* are a different matter: those are aimed at you, and do
 * make a player unavailable.
 *
 * There is no pick-limit gate on clickability. A pick always names its slot, and
 * landing on a filled one replaces its occupant, so a full lineup is still
 * editable — locking the pool at 23 would kill "change this player" at exactly
 * the point you want it.
 */
function renderPickGrid(room, mySide, theirSide) {
  const grid = document.getElementById("pickGrid");
  if (!grid) return;

  const rows = getPickListPlayers();
  const opponentBanIds = new Set((room.bans?.[theirSide] || []).map((b) => String(b.id)));
  const myPickIds = new Set(filledPicks(room.picks?.[mySide]).map((p) => String(p.id)));
  const pendingId = state.pickPendingPlayerId;
  // A confirmed squad is read-only until it is un-confirmed.
  const locked = Boolean(room.picksConfirmed?.[mySide]);

  const flagsFor = (id) => {
    const banned = opponentBanIds.has(id);
    const picked = myPickIds.has(id);
    return { banned, picked, pending: id === pendingId, clickable: !banned && !picked && !locked };
  };

  /* The key is **which players, in what order** — nothing about their state.
     Picking someone changes only his flags, and rebuilding the grid for that
     would throw away 40 `<img loading="lazy">` elements and make 40 more: the
     cards lose their height until the new images are sized, the scroller clamps
     `scrollTop` to the collapsed content, and the list jumps upward. See the
     `aspect-ratio` note in ban.css for the measurement. Flags are repainted in
     place below instead. */
  const rowsKey = rows.map((p) => String(p.id || "")).join(",");
  if (grid.dataset.rowsKey !== rowsKey) {
    grid.dataset.rowsKey = rowsKey;
    grid.innerHTML = rows.length
      ? rows.map((p) => playerCardHtml(p, flagsFor(String(p.id || "")))).join("")
      : `<div class="ban-phase-empty ban-phase-empty--panel">${escapeHtml(
          state.loadingPlayers ? "Loading your squad..." : "No players found.",
        )}</div>`;
    return; // built with the current flags already applied
  }

  paintPickCardFlags(grid, flagsFor);
}

/**
 * Repaints availability on the cards already in the grid.
 *
 * These classes are deliberately **not** part of `rowsKey`, so mutating them
 * here cannot desync the diff guard the way `is-hovered` would on a key built
 * from rendered state (see ban-phase.md).
 */
function paintPickCardFlags(grid, flagsFor) {
  for (const card of grid.querySelectorAll(".player-card")) {
    const { banned, picked, pending, clickable } = flagsFor(card.dataset.playerId || "");
    card.classList.toggle("is-ban-taken", banned);
    card.classList.toggle("is-pick-taken", picked);
    card.classList.toggle("is-unavailable", banned || picked);
    card.classList.toggle("is-pending", pending);
    card.classList.toggle("is-clickable", clickable);
    card.tabIndex = clickable ? 0 : -1;
  }
}

// ── Formation pitch + bench ──────────────────────────────────

/**
 * Slots 1..11 on the pitch, the rest as a bench strip below it.
 *
 * Both are `data-pick-slot`-tagged so one delegated handler in `draftControls`
 * serves them: click a filled slot to select it, click another to swap, or hit
 * its × to empty it. That mirrors the game-plan pitch on the home page — no
 * drag and drop, because a click pair works the same on touch.
 */
function renderPickPitch(myPicks, maxPicks) {
  const pitch = document.getElementById("pickPitch");
  if (!pitch) return;

  const formation = getPickFormation();
  const lineup = myPicks.slice(0, LINEUP_SIZE);
  const slotMap = buildOrderedSlotMap(lineup);
  const active = state.pickActiveSlot;

  const key = `${formation}|${active ?? ""}|${lineup.map((p) => (p ? p.id : "-")).join(",")}`;
  if (pitch.dataset.pitchKey !== key) {
    pitch.dataset.pitchKey = key;
    pitch.innerHTML = getFormationLayout(formation)
      .map((row) => `<div class="pick-pitch-row" data-row="${escapeHtml(row.id)}">
        ${row.slots.map((slot) => pickSlotHtml(slotMap[slot], slot - 1, PITCH_ROW_LABELS[row.id] || "", active)).join("")}
      </div>`)
      .join("");
  }

  renderPickBench(myPicks, maxPicks, active);
}

/** Substitutes: every slot past the starting XI, drawn as real slots. */
function renderPickBench(myPicks, maxPicks, active) {
  const bench = document.getElementById("pickBench");
  if (!bench) return;

  const size = Math.max(0, maxPicks - LINEUP_SIZE);
  const players = Array.from({ length: size }, (_, i) => myPicks[LINEUP_SIZE + i] || null);

  const key = `${active ?? ""}|${players.map((p) => (p ? p.id : "-")).join(",")}`;
  if (bench.dataset.benchKey === key) return;
  bench.dataset.benchKey = key;

  bench.innerHTML = players
    .map((p, i) => pickSlotHtml(p ? normalizeDraftPlayer(p) : null, LINEUP_SIZE + i, BENCH_ROW_LABEL, active))
    .join("");
}

function pickSlotHtml(player, slot, rowLabel, active) {
  const isActive = active === slot;
  const attrs = `data-pick-slot="${slot}"${isActive ? ' aria-pressed="true"' : ""}`;

  if (!player) {
    return `<div class="pick-slot pick-slot--empty ${isActive ? "is-active" : ""}" ${attrs}>
      <div class="pick-slot-plus">+</div>
      <div class="pick-slot-pos-label">${escapeHtml(rowLabel)}</div>
    </div>`;
  }
  /* Art only. The card already prints the name, the position and both ratings —
     the strip that used to sit across the bottom repeated two of them in a
     smaller font, over the part of the artwork that carries them. */
  return `<div class="pick-slot pick-slot--filled ${isActive ? "is-active" : ""}" ${attrs}>
    <img class="pick-slot-img" src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy">
    <button class="pick-slot-remove" type="button" data-pick-slot-remove="${slot}" aria-label="Remove ${escapeHtml(player.name || "player")}">×</button>
  </div>`;
}

// ── Allowance pills + confirm ────────────────────────────────

function renderPickAllowanceBar(room, myPicks, maxPicks) {
  const bar = document.getElementById("pickAllowanceBar");
  if (!bar) return;

  const pills = buildAllowancePills(room?.config || {}, myPicks);
  const key = pills.map((p) => `${p.label}:${p.used}/${p.cap}`).join("|") + `|${pickCount(myPicks)}`;

  if (bar.dataset.barKey !== key) {
    bar.dataset.barKey = key;
    bar.innerHTML = pills.length
      ? `<span class="pick-allowance-label">ALLOWANCE</span>` +
        pills.map((p) => `<span class="pick-allowance-pill ${p.used >= p.cap ? "is-maxed" : ""}">${escapeHtml(p.label)} ${p.used}/${p.cap}</span>`).join("")
      : "";
  }

  renderConfirmPicks(room, myPicks, maxPicks);
}

/**
 * CLEAR ALL is only live when it has something to do.
 *
 * Two states disable it, and both used to leave a button that opened a confirm
 * dialog and then changed nothing: an empty lineup, and a confirmed one — where
 * `replaceMyPicks` refuses the write and the server answers 409 anyway. A
 * control that cannot act should say so before it is pressed, not after.
 */
function renderClearAll(room, myPicks) {
  const btn = document.getElementById("pickClearAllBtn");
  if (!btn) return;
  btn.disabled = pickCount(myPicks) === 0 || Boolean(room.picksConfirmed?.[state.mySide]);
}

/**
 * The footer's confirm control, in all four states it can be in.
 *
 * The button is **always present**. Hiding it until the squad was full left the
 * space under the bench blank, which says nothing about what is missing — the
 * hint beside it does. Once confirmed the button flips to UN-CONFIRM and stays
 * live: the draft does not advance until the opponent confirms too, so until
 * then the decision is reversible.
 */
function renderConfirmPicks(room, myPicks, maxPicks) {
  const btn = document.getElementById("confirmPicksBtn");
  const hint = document.getElementById("pickConfirmHint");
  if (!btn) return;

  const mySide = state.mySide;
  const theirSide = mySide === "host" ? "guest" : "host";
  const count = pickCount(myPicks);
  const full = count >= maxPicks;
  const confirmed = Boolean(room.picksConfirmed?.[mySide]);
  const theirConfirmed = Boolean(room.picksConfirmed?.[theirSide]);

  btn.disabled = !full && !confirmed;
  btn.textContent = confirmed ? "UN-CONFIRM" : "CONFIRM PICKS ▶";
  btn.classList.toggle("is-confirmed", confirmed);

  if (!hint) return;
  hint.textContent = confirmed
    ? theirConfirmed
      ? "Both squads confirmed — starting…"
      : `Waiting for ${room[theirSide]?.username || "your opponent"}…`
    : full
      ? theirConfirmed ? "Opponent is ready and waiting for you" : ""
      : `Pick all ${maxPicks} players to confirm · ${count}/${maxPicks}`;
  hint.classList.toggle("is-waiting", confirmed && !theirConfirmed);
}

function buildAllowancePills(cfg, myPicks) {
  const enabled = Array.isArray(cfg.allowanceEnabled) ? cfg.allowanceEnabled : [];
  const caps = cfg.allowanceCaps || {};
  const allowance = cfg.allowance || {};

  const pills = [];
  for (const key of enabled) {
    const cap = Math.max(0, Math.floor(Number(caps[key]) || 0));
    const value = String(allowance[key] || "").trim();
    if (!cap || !value) continue;
    pills.push({
      label: value.length <= 12 ? value.toUpperCase() : key.toUpperCase(),
      used: myPicks.filter((p) => playerMatchesAllowanceCategory(p, key, value)).length,
      cap,
    });
  }
  return pills;
}

// ── Live opponent feed ───────────────────────────────────────

/**
 * The opponent's picks, as the same player cards used everywhere else — and the
 * one place the three reveal modes differ during the draft:
 *
 * - `instant` — cards, count and progress bar, all plainly.
 * - `blur` — the cards stay in the layout and get `.is-concealed`, so you can see
 *   *that* they picked without seeing *who*; count and progress stay readable.
 * - `hidden` — no cards, no count, no bar. Only whether they are still picking or
 *   have a full squad, which is the one thing you cannot infer anyway once the
 *   draft ends.
 *
 * `theirPicks` never reaches the DOM in hidden mode, so there is nothing to
 * recover with devtools that a presence poll would not already hand you.
 */
function renderOpponentPicks(room, theirSide, theirPicks, maxPicks, revealMode) {
  const grid = document.getElementById("pickOppGrid");
  const note = document.getElementById("pickOppConcealNote");
  const locked = document.getElementById("pickOppLocked");
  if (!grid) return;

  const theirInfo = room[theirSide] || null;
  const isOnline = Boolean(theirInfo?.id);
  const count = pickCount(theirPicks);
  const blurred = revealMode === REVEAL_MODE_BLUR;
  const concealed = revealMode === REVEAL_MODE_HIDDEN;

  renderOpponentHeader(theirInfo, isOnline, count, maxPicks, concealed);

  grid.classList.toggle("is-concealed", blurred);
  grid.hidden = concealed;
  if (note) note.hidden = revealMode === REVEAL_MODE_INSTANT;
  if (locked) {
    locked.hidden = !concealed;
    const status = document.getElementById("pickOppLockedStatus");
    if (status) {
      status.textContent = !isOnline
        ? "Left the room"
        : maxPicks && count >= maxPicks ? "Squad complete" : "Still picking";
    }
  }

  // Nothing below writes a card while concealed, so the key only has to change
  // when concealment does — not with every pick they make.
  const ids = concealed ? "" : filledPicks(theirPicks).map((p) => p.id).join(",");
  const key = `${revealMode}|${ids}|${maxPicks}|${isOnline ? 1 : 0}`;
  if (grid.dataset.oppKey === key) return;
  grid.dataset.oppKey = key;

  if (concealed) {
    grid.innerHTML = "";
    return;
  }

  const theirFilled = filledPicks(theirPicks);
  if (!theirFilled.length) {
    grid.innerHTML = `<div class="pick-opp-empty">${escapeHtml(
      isOnline ? "No picks yet." : "Opponent left the room.",
    )}</div>`;
    return;
  }

  /* aria-hidden while blurred: the blur is only visual, and a screen reader
     would otherwise read out exactly the names the setting exists to withhold. */
  grid.setAttribute("aria-hidden", blurred ? "true" : "false");
  grid.innerHTML = theirFilled.map((p) => playerCardHtml(p, STATIC_CARD)).join("");
}

function renderOpponentHeader(theirInfo, isOnline, count, maxPicks, concealed) {
  const dot = document.getElementById("pickOppDot");
  const name = document.getElementById("pickOppName");
  const countEl = document.getElementById("pickOppCount");
  const progress = document.getElementById("pickOppProgressWrap");
  const fill = document.getElementById("pickOppProgressFill");
  const statusDot = document.getElementById("pickLiveStatusDot");
  const statusText = document.getElementById("pickLiveStatusText");

  if (dot) dot.classList.toggle("is-online", isOnline);
  if (name) name.textContent = theirInfo?.username || "Opponent";
  /* The count and the bar are the progress `blur` deliberately keeps — so under
     `hidden` they have to go, or the setting leaks exactly what it withholds one
     number at a time. */
  if (countEl) {
    countEl.hidden = concealed;
    countEl.textContent = `${count}/${maxPicks}`;
  }
  if (progress) progress.hidden = concealed;
  if (fill) fill.style.width = maxPicks > 0 ? `${Math.min(100, (count / maxPicks) * 100)}%` : "0%";
  if (statusDot) statusDot.classList.toggle("is-online", isOnline && !state.presenceError);
  if (statusText) {
    statusText.textContent = !isOnline
      ? "Left the room"
      : state.presenceError ? "Reconnecting..." : "Picking...";
  }
}

