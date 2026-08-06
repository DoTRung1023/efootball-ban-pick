/** Event wiring for the draft view. Bound once on page load. */

import { DEFAULT_FORMATION, FIXED_PICKS_PER_SIDE } from './constants.js';
import { askConfirm } from './utils.js';
import { state } from './state.js';
import { normalizeFormation } from './players.js';
import { leavePresence } from './presence.js';
import { loadDraftGamePlanPlayers } from './gamePlans.js';
import { beginPostDraftReadyPhase, clearTurnTimer, pickLimit } from './draftFlow.js';
import { confirmStagedBans, setMatchReady } from './draftActions.js';
import { renderDraftUi } from './draftView.js';

const on = (id, event, handler) =>
  document.getElementById(id)?.addEventListener(event, handler);

/** Finds the delegated target for a click, or null. */
const closestTarget = (e, selector) =>
  e.target instanceof Element ? e.target.closest(selector) : null;

export function initDraftControls() {
  initReadyControls();
  initBanControls();
  initPickControls();
  initFormationDropdown();
  initLeaveControl();
}

function initReadyControls() {
  on("draftReadyBtn", "click", () => {
    if (state.phase !== "ready" || !state.room) return;
    void setMatchReady(!state.room.matchReady?.[state.mySide]);
  });
}

function initBanControls() {
  on("confirmBansBtn", "click", () => void confirmStagedBans());

  // Remove a staged (not yet confirmed) ban.
  on("draftMyBansStrip", "click", (e) => {
    const btn = closestTarget(e, "[data-remove-ban]");
    if (!btn) return;
    const id = btn.getAttribute("data-remove-ban");
    state.stagedBans = state.stagedBans.filter((p) => String(p.id) !== id);
    renderDraftUi();
  });
}

function initPickControls() {
  // CONFIRM PICKS advances to the ready phase once the squad is full.
  on("confirmPicksBtn", "click", () => {
    if (state.phase !== "draft" || !state.room) return;
    const room = state.room;
    const maxPicks = pickLimit(room.config) || FIXED_PICKS_PER_SIDE;
    if ((room.picks?.[state.mySide] || []).length < maxPicks) return;
    beginPostDraftReadyPhase(room);
    renderDraftUi();
  });

  // Optimistic local clear; the next presence poll restores server state if it disagrees.
  on("pickClearAllBtn", "click", async () => {
    if (!state.room) return;
    const ok = await askConfirm({ title: "Clear Lineup", message: "Remove all your picks?", okText: "Clear" });
    if (!ok) return;

    const room = state.room;
    const myPickIds = new Set((room.picks?.[state.mySide] || []).map((p) => String(p.id)));
    room.picks[state.mySide] = [];
    room.pickedPlayerIds = (room.pickedPlayerIds || []).filter((id) => !myPickIds.has(String(id)));
    renderDraftUi();
  });

  // Quick-load plan chips.
  on("pickQlCards", "click", (e) => {
    const card = closestTarget(e, "[data-pick-ql-plan]");
    if (!card) return;

    const planId = card.getAttribute("data-pick-ql-plan");
    state.draftGamePlanSelectedId = planId || null;
    if (!planId) {
      renderDraftUi();
      return;
    }
    const plan = state.draftGamePlans.find((p) => String(p.id) === planId);
    if (plan) state.pickManualFormation = normalizeFormation(plan.formation);
    void loadDraftGamePlanPlayers(planId).then(renderDraftUi);
  });
}

function initFormationDropdown() {
  const panelId = "pickQlFormationPanel";

  on("pickQlFormationBtn", "click", (e) => {
    e.stopPropagation();
    const panel = document.getElementById(panelId);
    if (panel) panel.hidden = !panel.hidden;
  });

  document.addEventListener("click", (e) => {
    const panel = document.getElementById(panelId);
    if (!panel || panel.hidden) return;
    const wrap = document.querySelector(".pick-ql-formation-wrap");
    if (wrap && e.target instanceof Element && !wrap.contains(e.target)) panel.hidden = true;
  });

  on(panelId, "click", (e) => {
    const btn = closestTarget(e, "[data-pick-formation]");
    if (!btn) return;
    state.pickManualFormation = btn.getAttribute("data-pick-formation") || DEFAULT_FORMATION;
    const panel = document.getElementById(panelId);
    if (panel) panel.hidden = true;
    renderDraftUi();
  });
}

function initLeaveControl() {
  on("draftLeaveBtn", "click", async () => {
    const isHost = state.mySide === "host";
    const ok = await askConfirm(
      isHost
        ? { title: "Close Room", message: "Close room for everyone?", okText: "Close room" }
        : { title: "Leave Draft", message: "Leave the draft?", okText: "Leave" },
    );
    if (!ok) return;

    clearTurnTimer();
    await leavePresence();
    window.location.href = "/";
  });
}
