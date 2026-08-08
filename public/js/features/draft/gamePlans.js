/**
 * The user's saved game plans, offered during the pick phase as whole lineups.
 *
 * The pick board starts from scratch. LOAD GAME PLAN is the one way a plan gets
 * applied, and it applies both halves at once: the plan's formation and its
 * players.
 */

import { cb } from './callbacks.js';
import { DEFAULT_FORMATION, FIXED_PICKS_PER_SIDE } from './constants.js';
import { getUser } from './utils.js';
import { state } from './state.js';
import { normalizeFormation } from './players.js';
import { getJson } from './api.js';
import { replaceMyPicks } from './engine/draftActions.js';
import { pickLimit } from './engine/draftFlow.js';

/**
 * Formation for the pick phase.
 *
 * `state.pickManualFormation` is the single source of truth: loading a game plan
 * writes the plan's formation into it. The selected plan used to win outright, which
 * silently defeated the formation dropdown — you could not change formation after
 * loading a plan, because the plan kept overriding the choice on the next render.
 */
export function getPickFormation() {
  return normalizeFormation(state.pickManualFormation || DEFAULT_FORMATION);
}

export async function loadDraftGamePlans() {
  const user = getUser();
  if (!user?.id) return;

  state.draftGamePlansLoading = true;
  try {
    const data = await getJson(`/api/game-plans?userId=${encodeURIComponent(user.id)}`);
    state.draftGamePlans = Array.isArray(data.plans) ? data.plans : [];

    /* Nothing is selected — the list is a menu of one-shot actions, and the
       pick phase starts from scratch on an empty pitch. This used to auto-select
       the first plan, which decided the starting formation for the user. */
  } catch {
    state.draftGamePlans = [];
  } finally {
    state.draftGamePlansLoading = false;
    cb.renderDraftUi();
  }
}

/**
 * Applies a saved plan to the pick board: its formation becomes the active one,
 * and its players replace the whole current lineup.
 *
 * Two kinds of player are left out — ones the opponent banned, and ones no longer
 * in your squad. Both are matched against `state.mySquadPlayers` rather than used
 * as returned, because the plan endpoint does not carry the footer fields
 * (foot, league, region, physicals) that a player card renders.
 *
 * **A dropped player shifts the rest up a slot rather than leaving a hole.**
 * `picks` is a flat positional array — pitch slot *is* array index — so a gap is
 * not expressible in that shape. Losing the left-back to a ban slides the whole
 * back line along by one.
 *
 * Resolves to `{ loaded, dropped }` so the caller can say what happened.
 */
export async function loadGamePlanIntoPicks(planId) {
  const user = getUser();
  const room = state.room;
  if (!user?.id || !planId || !room) return null;

  const plan = state.draftGamePlans.find((p) => String(p.id) === String(planId));
  const data = await getJson(
    `/api/game-plans/${encodeURIComponent(planId)}/players?userId=${encodeURIComponent(user.id)}`,
  );
  const rows = Array.isArray(data.players) ? data.players : [];

  const theirSide = state.mySide === "host" ? "guest" : "host";
  const bannedIds = new Set((room.bans?.[theirSide] || []).map((b) => String(b.id)));
  const squadById = new Map(
    (Array.isArray(state.mySquadPlayers) ? state.mySquadPlayers : []).map((p) => [String(p.id), p]),
  );

  const chosen = [];
  let dropped = 0;
  for (const row of rows) {
    const id = String(row?.pesdb_id ?? row?.player_id ?? "");
    const player = squadById.get(id);
    if (!player || bannedIds.has(id)) {
      dropped += 1;
      continue;
    }
    chosen.push(player);
  }

  const max = pickLimit(room.config) || FIXED_PICKS_PER_SIDE;
  const capped = max ? chosen.slice(0, max) : chosen;

  if (plan?.formation) state.pickManualFormation = normalizeFormation(plan.formation);

  const loaded = await replaceMyPicks(capped);
  return { loaded: loaded ?? 0, dropped };
}
