/**
 * The user's saved game plans, used during the draft as formation presets.
 *
 * Only the plan's formation drives the pick pitch; the per-plan player list is
 * loaded alongside it and kept on state for the plan preview panel.
 */

import { cb } from './callbacks.js';
import { DEFAULT_FORMATION } from './constants.js';
import { getUser } from './utils.js';
import { state } from './state.js';
import { normalizeFormation } from './players.js';
import { getJson } from './api.js';

/** Formation for the pick phase: selected plan wins, then a manual override, then the default. */
export function getPickFormation() {
  const plan = getSelectedPlan();
  return normalizeFormation(plan?.formation || state.pickManualFormation || DEFAULT_FORMATION);
}

export function getSelectedPlan() {
  return state.draftGamePlans.find(
    (p) => String(p.id) === String(state.draftGamePlanSelectedId),
  );
}

export async function loadDraftGamePlans() {
  const user = getUser();
  if (!user?.id) return;

  state.draftGamePlansLoading = true;
  try {
    const data = await getJson(`/api/game-plans?userId=${encodeURIComponent(user.id)}`);
    state.draftGamePlans = Array.isArray(data.plans) ? data.plans : [];

    if (!getSelectedPlan()) {
      state.draftGamePlanSelectedId = state.draftGamePlans[0]?.id || null;
    }
    if (state.draftGamePlanSelectedId) {
      await loadDraftGamePlanPlayers(state.draftGamePlanSelectedId);
    } else {
      state.draftGamePlanPlayers = [];
    }
  } catch {
    state.draftGamePlans = [];
    state.draftGamePlanPlayers = [];
    state.draftGamePlanSelectedId = null;
  } finally {
    state.draftGamePlansLoading = false;
    cb.renderDraftUi();
  }
}

export async function loadDraftGamePlanPlayers(planId) {
  const user = getUser();
  if (!user?.id || !planId) return;

  state.draftGamePlanPlayersLoading = true;
  try {
    const data = await getJson(
      `/api/game-plans/${encodeURIComponent(planId)}/players?userId=${encodeURIComponent(user.id)}`,
    );
    state.draftGamePlanPlayers = Array.isArray(data.players) ? data.players : [];
  } catch {
    state.draftGamePlanPlayers = [];
  } finally {
    state.draftGamePlanPlayersLoading = false;
    if (state.phase === "draft") cb.renderDraftUi();
  }
}
