/**
 * Pick phase board: squad pool (left), formation pitch (centre), live opponent
 * feed (right), plus the quick-load plan bar above them.
 *
 * Like the ban board, every DOM write is behind a state-key guard because this
 * re-renders on every presence poll.
 */

import { FIXED_PICKS_PER_SIDE, FORMATION_LAYOUTS, REVEAL_MODE_HIDDEN } from '@/features/draft/constants.js';
import { playerMatchesAllowanceCategory } from '@/features/draft/allowance.js';
import { escapeHtml } from '@/features/draft/utils.js';
import { state, normalizeRevealMode } from '@/features/draft/state.js';
import {
  buildOrderedSlotMap,
  getFormationLayout,
  getPlayerImageSrc,
  getPlayerCardValue,
  normalizeFormation,
} from '@/features/draft/players.js';
import { banPlayerCardHtml } from '@/features/draft/playerCards.js';
import { getPickListPlayers } from '@/features/draft/playerQuery.js';
import { bindPickPhaseUiOnce, renderPickPosTabs, renderPickToolbar } from './pick.js';
import { getPickFormation, getSelectedPlan } from '@/features/draft/gamePlans.js';
import { pickLimit } from '@/features/draft/engine/draftFlow.js';

const LINEUP_SIZE = 11;
const ROW_LABELS = { pitchRowFwd: "ATT", pitchRowMid: "MID", pitchRowDef: "DEF", pitchRowGk: "GK" };

const lastName = (player) =>
  String(player.name || "").trim().split(/\s+/).pop() || player.name;

const averageOf = (players, read) =>
  players.length
    ? Math.round(players.reduce((sum, p) => sum + (Number(read(p)) || 0), 0) / players.length)
    : 0;

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

  renderPickQuickLoad();
  renderPickGrid(room, theirSide, myPicks.length < maxPicks);
  renderPickPitch(myPicks, maxPicks);
  renderPickAllowanceBar(room, myPicks, maxPicks);
  renderPickLiveFeed(room, theirSide, theirPicks, maxPicks, normalizeRevealMode(room.config?.revealMode));
}

// ── Quick-load bar ───────────────────────────────────────────

export function renderPickQuickLoad() {
  const cards = document.getElementById("pickQlCards");
  if (!cards) return;

  const formation = getPickFormation();
  const label = document.getElementById("pickQlFormationLabel");
  if (label) label.textContent = formation;

  const plans = state.draftGamePlans;
  const selectedId = state.draftGamePlanSelectedId;

  const key = `${selectedId ?? "scratch"}|${plans.map((p) => p.id).join(",")}`;
  if (cards.dataset.qlKey !== key) {
    cards.dataset.qlKey = key;
    cards.innerHTML = scratchCardHtml(selectedId === null) + plans.map((p) => planCardHtml(p, selectedId)).join("");
  }

  renderFormationPanel(formation);
}

function scratchCardHtml(selected) {
  return `
    <div class="pick-ql-card ${selected ? "is-selected" : ""}" data-pick-ql-plan="">
      <div class="pick-ql-card-icon">${selected ? "✓" : "ø"}</div>
      <div class="pick-ql-card-body">
        <div class="pick-ql-card-name">From scratch</div>
        <div class="pick-ql-card-formation">Choose formation manually</div>
      </div>
    </div>`;
}

function planCardHtml(plan, selectedId) {
  const selected = String(plan.id) === String(selectedId);
  const formation = normalizeFormation(plan.formation);
  return `
    <div class="pick-ql-card ${selected ? "is-selected" : ""}" data-pick-ql-plan="${escapeHtml(String(plan.id))}">
      <div class="pick-ql-card-icon">${selected ? "✓" : escapeHtml(formation.split("-")[0])}</div>
      <div class="pick-ql-card-body">
        <div class="pick-ql-card-name">${escapeHtml(plan.name || "Plan")}</div>
        <div class="pick-ql-card-formation">${escapeHtml(formation)}</div>
      </div>
      ${selected ? '<span class="pick-ql-check">✓</span>' : ""}
    </div>`;
}

/** Built once, then only the active flag is toggled. */
function renderFormationPanel(formation) {
  const panel = document.getElementById("pickQlFormationPanel");
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

// ── Squad pool grid ──────────────────────────────────────────

function renderPickGrid(room, theirSide, canStillPick) {
  const grid = document.getElementById("pickGrid");
  if (!grid) return;

  const rows = getPickListPlayers();
  const opponentBanIds = new Set((room.bans?.[theirSide] || []).map((b) => String(b.id)));

  const flagFor = (id) =>
    opponentBanIds.has(id) ? "b" : room.pickedPlayerIds.includes(id) ? "p" : "";

  const key = [
    canStillPick ? 1 : 0,
    rows.map((p) => String(p.id || "") + flagFor(String(p.id || ""))).join(","),
  ].join("|");
  if (grid.dataset.stateKey === key) return;

  grid.dataset.stateKey = key;
  grid.innerHTML = rows.length
    ? rows.map((p) => {
        const id = String(p.id || "");
        const banned = opponentBanIds.has(id);
        const picked = room.pickedPlayerIds.includes(id);
        return banPlayerCardHtml(p, { banned, picked, clickable: canStillPick && !banned && !picked });
      }).join("")
    : `<div class="ban-phase-empty ban-phase-empty--panel">${escapeHtml(
        state.loadingPlayers ? "Loading your squad..." : "No players found.",
      )}</div>`;
}

// ── Formation pitch ──────────────────────────────────────────

export function renderPickPitch(myPicks, maxPicks) {
  const pitch = document.getElementById("pickPitch");
  if (!pitch) return;

  const formation = getPickFormation();
  const lineup = myPicks.slice(0, LINEUP_SIZE);
  const slotMap = buildOrderedSlotMap(lineup);

  const key = `${formation}|${lineup.map((p) => p.id).join(",")}`;
  if (pitch.dataset.pitchKey !== key) {
    pitch.dataset.pitchKey = key;
    pitch.innerHTML = getFormationLayout(formation)
      .map((row) => `<div class="pick-pitch-row" data-row="${escapeHtml(row.id)}">
        ${row.slots.map((slot) => pickSlotHtml(slotMap[slot], ROW_LABELS[row.id] || "")).join("")}
      </div>`)
      .join("");
  }

  renderLineupMeta(lineup, maxPicks, formation);
}

function pickSlotHtml(player, rowLabel) {
  if (!player) {
    return `<div class="pick-slot pick-slot--empty">
      <div class="pick-slot-plus">+</div>
      <div class="pick-slot-pos-label">${escapeHtml(rowLabel)}</div>
    </div>`;
  }
  return `<div class="pick-slot pick-slot--filled">
    <img class="pick-slot-img" src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy">
    <div class="pick-slot-overlay">
      <div class="pick-slot-name">${escapeHtml(lastName(player))}</div>
      <div class="pick-slot-ovr">${escapeHtml(String(getPlayerCardValue(player)))}</div>
    </div>
  </div>`;
}

function renderLineupMeta(lineup, maxPicks, formation) {
  const meta = document.getElementById("pickLineupMeta");
  if (!meta) return;

  const avgOvr = lineup.length ? averageOf(lineup, getPlayerCardValue) : null;
  const plan = getSelectedPlan();

  const key = `${lineup.length}|${maxPicks}|${formation}|${avgOvr}|${plan?.name ?? ""}`;
  if (meta.dataset.metaKey === key) return;

  meta.dataset.metaKey = key;
  meta.innerHTML = `
    <span class="pick-lineup-count">${lineup.length}/${Math.min(maxPicks, LINEUP_SIZE)}</span>
    <span class="pick-lineup-formation">${escapeHtml(formation)}</span>
    ${avgOvr !== null ? `<span class="pick-lineup-avgovr">Avg OVR ${avgOvr}</span>` : ""}
    ${plan ? `<span class="pick-lineup-plan-badge">● ${escapeHtml(plan.name)}</span>` : ""}
  `;
}

// ── Allowance pills + confirm ────────────────────────────────

export function renderPickAllowanceBar(room, myPicks, maxPicks) {
  const bar = document.getElementById("pickAllowanceBar");
  if (!bar) return;

  const pills = buildAllowancePills(room?.config || {}, myPicks);
  const key = pills.map((p) => `${p.label}:${p.used}/${p.cap}`).join("|") + `|${myPicks.length}`;

  if (bar.dataset.barKey !== key) {
    bar.dataset.barKey = key;
    bar.innerHTML = pills.length
      ? `<span class="pick-allowance-label">ALLOWANCE</span>` +
        pills.map((p) => `<span class="pick-allowance-pill ${p.used >= p.cap ? "is-maxed" : ""}">${escapeHtml(p.label)} ${p.used}/${p.cap}</span>`).join("")
      : "";
  }

  const remaining = maxPicks - myPicks.length;
  const confirmBtn = document.getElementById("confirmPicksBtn");
  const moreLabel = document.getElementById("pickMoreLabel");
  if (confirmBtn) confirmBtn.hidden = remaining > 0;
  if (moreLabel) moreLabel.textContent = remaining > 0 ? `${remaining} MORE` : "";
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

export function renderPickLiveFeed(room, theirSide, theirPicks, maxPicks, revealMode) {
  const feed = document.getElementById("pickOppFeed");
  if (!feed) return;

  const theirInfo = room[theirSide] || null;
  const isOnline = Boolean(theirInfo?.id);
  renderOpponentHeader(theirInfo, isOnline, theirPicks.length, maxPicks);

  const hidden = revealMode === REVEAL_MODE_HIDDEN;
  const key = hidden ? "hidden" : theirPicks.map((p) => p.id).join(",");
  if (feed.dataset.feedKey === key) return;
  feed.dataset.feedKey = key;

  if (hidden) {
    feed.innerHTML = waitingRowHtml("Picks hidden — revealed after match");
    return;
  }

  const rows = theirPicks.map((p, i) => feedRowHtml(p, i === theirPicks.length - 1)).join("");
  const waiting = Array.from({ length: Math.max(0, maxPicks - theirPicks.length) }, (_, i) =>
    waitingRowHtml(`Waiting for pick… (${theirPicks.length + i + 1} of ${maxPicks})`),
  ).join("");

  feed.innerHTML = rows + waiting;
}

function renderOpponentHeader(theirInfo, isOnline, pickCount, maxPicks) {
  const dot = document.getElementById("pickOppDot");
  const name = document.getElementById("pickOppName");
  const count = document.getElementById("pickOppCount");
  const fill = document.getElementById("pickOppProgressFill");
  const statusDot = document.getElementById("pickLiveStatusDot");
  const statusText = document.getElementById("pickLiveStatusText");
  const sync = document.getElementById("pickLiveSync");

  if (dot) dot.classList.toggle("is-online", isOnline);
  if (name) name.textContent = theirInfo?.username || "Opponent";
  if (count) count.textContent = `${pickCount}/${maxPicks}`;
  if (fill) fill.style.width = maxPicks > 0 ? `${Math.min(100, (pickCount / maxPicks) * 100)}%` : "0%";
  if (statusDot) statusDot.classList.toggle("is-online", isOnline && !state.presenceError);
  if (statusText) {
    statusText.textContent = !isOnline
      ? "Left the room"
      : state.presenceError ? "Reconnecting..." : "Picking...";
  }
  if (sync) {
    const elapsed = state.lastRoomUpdatedAt
      ? Math.round((Date.now() - state.lastRoomUpdatedAt) / 100) / 10
      : 0;
    sync.textContent = `Synced ${elapsed}s ago`;
  }
}

function feedRowHtml(player, isNewest) {
  return `
    <div class="pick-feed-row ${isNewest ? "is-new" : ""}">
      <div class="pick-feed-thumb">
        <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy">
      </div>
      <div class="pick-feed-info">
        <div class="pick-feed-name">${escapeHtml(player.name || "—")}</div>
        <div class="pick-feed-meta">${escapeHtml(player.position || "—")} · OVR ${escapeHtml(String(getPlayerCardValue(player)))}</div>
      </div>
      ${isNewest ? '<span class="pick-feed-badge">NEW</span>' : ""}
    </div>`;
}

function waitingRowHtml(text) {
  return `<div class="pick-feed-waiting"><div class="pick-feed-wait-dot"></div><span class="pick-feed-wait-text">${escapeHtml(text)}</span></div>`;
}
