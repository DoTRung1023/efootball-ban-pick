/**
 * Ready phase ("Start Match"): both squads side by side with a stat comparison,
 * and the READY toggle that ends the room once both players confirm.
 *
 * Formations are not synced through presence, so the opponent's pitch is drawn
 * with DEFAULT_FORMATION.
 */

import { DEFAULT_FORMATION, REVEAL_MODE_HIDDEN } from '@/features/draft/constants.js';
import { escapeHtml } from '@/features/draft/utils.js';
import { normalizeRevealMode } from '@/features/draft/state.js';
import { buildOrderedSlotMap, getFormationLayout, getPlayerCardValue } from '@/features/draft/players.js';
import { banPlayerCardHtml } from '@/features/draft/ban/ban.js';
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
  renderStats(myPicks, theirPicks, myFormation);
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

  const key = [
    myPicks.map((p) => String(p.id)).join(","),
    theirPicks.map((p) => String(p.id)).join(","),
    revealMode,
    mySide,
    myReady ? "1" : "0",
    theirReady ? "1" : "0",
  ].join("|");
  if (cols.dataset.colKey === key) return;

  cols.dataset.colKey = key;
  const theirColumn = revealMode === REVEAL_MODE_HIDDEN
    ? hiddenColumnHtml(room[theirSide], theirReady)
    : squadColumnHtml(room, theirSide, theirPicks, DEFAULT_FORMATION, false);

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

function squadColumnHtml(room, side, picks, formation, isMe) {
  const lineup = picks.slice(0, LINEUP_SIZE);
  const bench = picks.slice(LINEUP_SIZE);
  const slotMap = buildOrderedSlotMap(lineup);
  const name = room[side]?.username || (isMe ? "You" : "Opponent");
  const avgOvr = lineup.length ? averageOf(lineup, getPlayerCardValue) : "—";

  const pitch = getFormationLayout(formation)
    .map((row) => {
      const cards = row.slots
        .map((slot) => (slotMap[slot] ? banPlayerCardHtml(slotMap[slot], STATIC_CARD) : `<div class="sm-empty-slot"></div>`))
        .join("");
      return `<div class="sm-pitch-row">${cards}</div>`;
    })
    .join("");

  return `
    <div class="sm-col ${isMe ? "sm-col--me" : "sm-col--opp"}">
      <div class="sm-col-head">
          <div class="sm-col-info">
          <div class="sm-col-name">${escapeHtml(name)}</div>
          <div class="sm-col-meta">${escapeHtml(isMe ? "YOU" : "OPPONENT")} · ${escapeHtml(formation)} · AVG ${avgOvr}</div>
        </div>
        ${readyBadgeHtml(Boolean(room.matchReady?.[side]))}
      </div>
      <div class="sm-pitch">${pitch}</div>
      ${benchHtml(bench)}
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
        ${bench.map((p) => banPlayerCardHtml(p, STATIC_CARD)).join("")}
      </div>
    </div>`;
}

// ── Stat comparison ──────────────────────────────────────────

function renderStats(myPicks, theirPicks, myFormation) {
  const el = document.getElementById("startMatchStats");
  if (!el) return;

  const fingerprint = (picks) => picks.map((p) => `${p.id}:${getPlayerCardValue(p)}`).join(",");
  const key = [fingerprint(myPicks), fingerprint(theirPicks), myFormation].join("|");
  if (el.dataset.statsKey === key) return;

  el.dataset.statsKey = key;
  el.innerHTML = statsRowHtml(myPicks, theirPicks, myFormation, DEFAULT_FORMATION);
}

function statsRowHtml(myPicks, theirPicks, myFormation, theirFormation) {
  const myLineup = myPicks.slice(0, LINEUP_SIZE);
  const theirLineup = theirPicks.slice(0, LINEUP_SIZE);
  const myAvgAge = averageOf(myLineup, (p) => p.age);
  const theirAvgAge = averageOf(theirLineup, (p) => p.age);

  // Age is missing for some card sources; fall back to squad size in that case.
  const lastStat = myAvgAge || theirAvgAge
    ? barStatHtml("AVG AGE", myAvgAge, theirAvgAge)
    : textStatHtml("SQUAD SIZE", myPicks.length, theirPicks.length);

  return `<div class="sm-stats-row">
    ${barStatHtml("AVG OVERALL", averageOf(myLineup, getPlayerCardValue), averageOf(theirLineup, getPlayerCardValue))}
    ${barStatHtml("AVG OVR MAX", averageOf(myPicks, getPlayerCardValue), averageOf(theirPicks, getPlayerCardValue))}
    ${textStatHtml("FORMATION", myFormation, theirFormation)}
    ${barStatHtml("STARTING XI", myLineup.length, theirLineup.length)}
    ${lastStat}
  </div>`;
}

/** Two-sided bar sized by each player's share of the total. */
function barStatHtml(label, myVal, theirVal) {
  const total = myVal + theirVal;
  const myPct = total > 0 ? Math.round((myVal / total) * 100) : 50;
  return `<div class="sm-stat">
    <div class="sm-stat-label">${escapeHtml(label)}</div>
    <div class="sm-stat-bars">
      <div class="sm-stat-bar sm-stat-bar--me" style="width:${myPct}%"></div>
      <div class="sm-stat-bar sm-stat-bar--opp" style="width:${100 - myPct}%"></div>
    </div>
    <div class="sm-stat-vals">
      <span class="sm-stat-me">${myVal}</span>
      <span class="sm-stat-vs">vs</span>
      <span class="sm-stat-opp">${theirVal}</span>
    </div>
  </div>`;
}

function textStatHtml(label, myVal, theirVal) {
  return `
    <div class="sm-stat">
      <div class="sm-stat-label">${escapeHtml(label)}</div>
      <div class="sm-stat-vals sm-stat-vals--text">
        <span class="sm-stat-me">${escapeHtml(String(myVal))}</span>
        <span class="sm-stat-vs">vs</span>
        <span class="sm-stat-opp">${escapeHtml(String(theirVal))}</span>
      </div>
    </div>`;
}
