/**
 * Ready phase ("Start Match"): both squads side by side with a stat comparison,
 * and the READY toggle that ends the room once both players confirm.
 *
 * Formations are not synced through presence, so the opponent's pitch is drawn
 * with DEFAULT_FORMATION.
 */

import { DEFAULT_FORMATION, REVEAL_MODE_BLUR, REVEAL_MODE_HIDDEN } from '@/features/draft/constants.js';
import { escapeHtml } from '@/features/draft/utils.js';
import { normalizeRevealMode } from '@/features/draft/state.js';
import { buildOrderedSlotMap, filledPicks, getFormationLayout,
  getPlayerCardValue } from '@/features/draft/players.js';
import { playerCardHtml } from '@/features/draft/playerCards.js';
import { getPickFormation } from '@/features/draft/gamePlans.js';

const LINEUP_SIZE = 11;
const STATIC_CARD = { banned: false, picked: false, clickable: false };

const averageOf = (players, read) =>
  players.length
    ? Math.round(players.reduce((sum, p) => sum + (Number(read(p)) || 0), 0) / players.length)
    : 0;

export function renderReadyBoard({ room, mySide, theirSide, visible }) {
  const board = document.getElementById("draftReadyPhaseBoard");
  if (!board) return;

  board.hidden = !visible;
  if (!visible) return;

  const myReady = Boolean(room.matchReady?.[mySide]);
  const theirReady = Boolean(room.matchReady?.[theirSide]);

  renderReadyButton(myReady);
  renderReadyHint(room, theirSide, myReady, theirReady);

  const myPicks = room.picks[mySide] || [];
  const theirPicks = room.picks[theirSide] || [];
  const myFormation = getPickFormation();
  const revealMode = normalizeRevealMode(room.config?.revealMode);

  renderColumns({ room, mySide, theirSide, myPicks, theirPicks, myFormation, revealMode, myReady, theirReady });
  renderStats(myPicks, theirPicks, myFormation, revealMode === REVEAL_MODE_HIDDEN);
}

function renderReadyButton(myReady) {
  const btn = document.getElementById("draftReadyBtn");
  if (!btn) return;
  btn.textContent = myReady ? "UNREADY" : "READY →";
  btn.classList.toggle("btn--ghost", myReady);
  btn.classList.toggle("btn--primary", !myReady);
}

function renderReadyHint(room, theirSide, myReady, theirReady) {
  const hint = document.getElementById("readyPhaseHint");
  if (!hint) return;

  const theirName = room[theirSide]?.username || (theirSide === "host" ? "Host" : "Guest");
  if (myReady && theirReady) hint.textContent = "Both players ready — starting…";
  else if (myReady) hint.textContent = "OPPONENT READY · WAITING FOR YOU";
  else if (theirReady) hint.textContent = `${theirName} is ready — click READY to start!`;
  else hint.textContent = "Click READY when you're set to play.";
}

function renderColumns({ room, mySide, theirSide, myPicks, theirPicks, myFormation, revealMode, myReady, theirReady }) {
  const cols = document.getElementById("readyPhaseColumns");
  if (!cols) return;

  /* Their ids stay out of the key in hidden mode — it is written to a `data-`
     attribute, so putting them there would publish in the DOM exactly what the
     column is refusing to draw. */
  const key = [
    myPicks.map((p) => (p ? String(p.id) : "-")).join(","),
    revealMode === REVEAL_MODE_HIDDEN ? "" : theirPicks.map((p) => (p ? String(p.id) : "-")).join(","),
    revealMode,
    mySide,
    myReady ? "1" : "0",
    theirReady ? "1" : "0",
  ].join("|");
  if (cols.dataset.colKey === key) return;

  cols.dataset.colKey = key;
  /* The three modes carry through to this screen unchanged: `blur` still shows
     the squad it cannot let you read, `hidden` still shows nothing. Revealing
     either one here would make the lobby setting a draft-only promise. */
  const theirColumn = revealMode === REVEAL_MODE_HIDDEN
    ? hiddenColumnHtml(room[theirSide], theirReady)
    : squadColumnHtml(room, theirSide, theirPicks, DEFAULT_FORMATION, false, revealMode === REVEAL_MODE_BLUR);

  cols.innerHTML =
    squadColumnHtml(room, mySide, myPicks, myFormation, true) +
    `<div class="sm-vs-col"><div class="sm-vs-circle">VS</div></div>` +
    theirColumn;
}

const readyBadgeHtml = (isReady) =>
  `<div class="sm-col-badge ${isReady ? "is-ready" : "is-writing"}">${isReady ? "✦ READY" : "✦ WRITING"}</div>`;

function hiddenColumnHtml(theirInfo, theirReady) {
  const name = theirInfo?.username || "Opponent";
  return `<div class="sm-col sm-col--opp sm-col--hidden">
    <div class="sm-col-head">
      <div class="sm-col-info">
        <div class="sm-col-name">${escapeHtml(name)}</div>
        <div class="sm-col-meta">OPPONENT</div>
      </div>
      ${readyBadgeHtml(theirReady)}
    </div>
    <div class="sm-hidden-msg">Picks hidden — revealed after match</div>
  </div>`;
}

function squadColumnHtml(room, side, picks, formation, isMe, blurred = false) {
  const lineup = picks.slice(0, LINEUP_SIZE);
  // `picks` is slot-addressed, so drop the holes before counting or averaging.
  const bench = filledPicks(picks.slice(LINEUP_SIZE));
  const starters = filledPicks(lineup);
  const slotMap = buildOrderedSlotMap(lineup);
  const name = room[side]?.username || (isMe ? "You" : "Opponent");
  const avgOvr = starters.length ? averageOf(starters, getPlayerCardValue) : "—";

  const pitch = getFormationLayout(formation)
    .map((row) => {
      const cards = row.slots
        .map((slot) => (slotMap[slot] ? playerCardHtml(slotMap[slot], STATIC_CARD) : `<div class="sm-empty-slot"></div>`))
        .join("");
      return `<div class="sm-pitch-row">${cards}</div>`;
    })
    .join("");

  /* Only the cards are blurred, not the head: the name and the READY badge are
     what the mode still promises you. `aria-hidden` on the squad for the same
     reason as the pick board — a blur a screen reader reads straight through is
     not a blur. */
  return `
    <div class="sm-col ${isMe ? "sm-col--me" : "sm-col--opp"}">
      <div class="sm-col-head">
          <div class="sm-col-info">
          <div class="sm-col-name">${escapeHtml(name)}</div>
          <div class="sm-col-meta">${escapeHtml(isMe ? "YOU" : "OPPONENT")} · ${escapeHtml(formation)} · AVG ${avgOvr}</div>
        </div>
        ${readyBadgeHtml(Boolean(room.matchReady?.[side]))}
      </div>
      <div class="sm-squad ${blurred ? "is-concealed" : ""}"${blurred ? ' aria-hidden="true"' : ""}>
        <div class="sm-pitch">${pitch}</div>
        ${benchHtml(bench)}
      </div>
    </div>`;
}

function benchHtml(bench) {
  if (!bench.length) return "";
  const meta = `OVR Max ${averageOf(bench, getPlayerCardValue)}`;
  return `
    <div class="sm-bench">
      <div class="sm-bench-head">
        <span>BENCH · ${bench.length} SUBS</span>
        <span class="sm-bench-meta">${escapeHtml(meta)}</span>
      </div>
      <div class="sm-bench-strip">
        ${bench.map((p) => playerCardHtml(p, STATIC_CARD)).join("")}
      </div>
    </div>`;
}

// ── Stat comparison ──────────────────────────────────────────

/**
 * `masked` is hidden reveal mode. Every cell here is an aggregate of the
 * opponent's squad — average rating, squad size, their formation — so leaving it
 * live would hand back in five numbers what the hidden column just withheld.
 * Blur does *not* mask: it conceals identities, not shape, which is the same
 * line the pick board's count and progress bar sit on.
 */
function renderStats(myPicks, theirPicks, myFormation, masked) {
  const el = document.getElementById("startMatchStats");
  if (!el) return;

  const fingerprint = (picks) => picks.map((p) => (p ? `${p.id}:${getPlayerCardValue(p)}` : "-")).join(",");
  // masked: their fingerprint would otherwise land in a `data-` attribute
  const key = [fingerprint(myPicks), masked ? "m" : fingerprint(theirPicks), myFormation].join("|");
  if (el.dataset.statsKey === key) return;

  el.dataset.statsKey = key;
  el.innerHTML = statsRowHtml(myPicks, theirPicks, myFormation, DEFAULT_FORMATION, masked);
}

function statsRowHtml(rawMyPicks, rawTheirPicks, myFormation, theirFormation, masked) {
  /* Every stat below counts or averages, so the slot holes have to go first —
     `averageOf` would read `.age` off a null and divide by the wrong total. */
  const myPicks = filledPicks(rawMyPicks);
  const theirPicks = filledPicks(rawTheirPicks);
  const myLineup = filledPicks(rawMyPicks.slice(0, LINEUP_SIZE));
  const theirLineup = filledPicks(rawTheirPicks.slice(0, LINEUP_SIZE));
  const myAvgAge = averageOf(myLineup, (p) => p.age);
  const theirAvgAge = averageOf(theirLineup, (p) => p.age);

  /* Age is missing for some card sources; fall back to squad size in that case.
     Masked, the choice is made on my squad alone — reading theirs to pick the
     row would leak whether their cards carry an age. */
  const hasAge = masked ? myAvgAge : myAvgAge || theirAvgAge;
  const lastStat = hasAge
    ? barStatHtml("AVG AGE", myAvgAge, theirAvgAge, masked)
    : textStatHtml("SQUAD SIZE", myPicks.length, theirPicks.length, masked);

  return `<div class="sm-stats-row">
    ${barStatHtml("AVG OVERALL", averageOf(myLineup, getPlayerCardValue), averageOf(theirLineup, getPlayerCardValue), masked)}
    ${barStatHtml("AVG OVR MAX", averageOf(myPicks, getPlayerCardValue), averageOf(theirPicks, getPlayerCardValue), masked)}
    ${textStatHtml("FORMATION", myFormation, theirFormation, masked)}
    ${barStatHtml("STARTING XI", myLineup.length, theirLineup.length, masked)}
    ${lastStat}
  </div>`;
}

/** What the opponent's half of a stat reads as under hidden reveal mode. */
const MASKED_VALUE = "?";

/** Two-sided bar sized by each player's share of the total. */
function barStatHtml(label, myVal, theirVal, masked) {
  const total = myVal + theirVal;
  // Masked, the split has to be fixed — a bar sized by their value *is* their value.
  const myPct = masked ? 50 : total > 0 ? Math.round((myVal / total) * 100) : 50;
  return `<div class="sm-stat">
    <div class="sm-stat-label">${escapeHtml(label)}</div>
    <div class="sm-stat-bars">
      <div class="sm-stat-bar sm-stat-bar--me" style="width:${myPct}%"></div>
      <div class="sm-stat-bar sm-stat-bar--opp ${masked ? "is-masked" : ""}" style="width:${100 - myPct}%"></div>
    </div>
    <div class="sm-stat-vals">
      <span class="sm-stat-me">${myVal}</span>
      <span class="sm-stat-vs">vs</span>
      <span class="sm-stat-opp">${masked ? MASKED_VALUE : theirVal}</span>
    </div>
  </div>`;
}

function textStatHtml(label, myVal, theirVal, masked) {
  return `
    <div class="sm-stat">
      <div class="sm-stat-label">${escapeHtml(label)}</div>
      <div class="sm-stat-vals sm-stat-vals--text">
        <span class="sm-stat-me">${escapeHtml(String(myVal))}</span>
        <span class="sm-stat-vs">vs</span>
        <span class="sm-stat-opp">${masked ? MASKED_VALUE : escapeHtml(String(theirVal))}</span>
      </div>
    </div>`;
}
