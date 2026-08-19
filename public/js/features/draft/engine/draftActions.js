/**
 * User-initiated draft actions: staging and confirming bans, submitting picks,
 * and the two ready flags (lobby-ready and post-draft match-ready).
 *
 * Bans are staged locally first and only posted on CONFIRM BANS, so the user
 * can change their mind. Picks post immediately after an optimistic update.
 */

import { cb } from '@/features/draft/callbacks.js';
import { showToast } from '@/features/draft/utils.js';
import { state, applyPresenceSnapshot } from '@/features/draft/state.js';
import { postAsMe } from '@/features/draft/api.js';
import { normalizeFormation, pickCount } from '@/features/draft/players.js';
import {
  applyLocalBan,
  banLimit,
  isReadyPhase,
  pickLimit,
  startTurnTimer,
} from './draftFlow.js';
import { ROOM_STATUS_DONE } from '@/features/draft/constants.js';

/**
 * A ban only ever renders as a card image, and `getPlayerImageSrc` falls back to
 * `id` — which for draft players *is* the pesdb id — so id + name is the whole
 * display surface. Nothing else needs to cross the wire.
 */
const banPayload = (player) => ({ id: String(player.id), name: player.name });

/**
 * A pick does need the rest: the opponent's picks render as full player cards on
 * the pick board and again on the Start Match screen, and the room store is the
 * only copy either side has of the other's players. Everything `playerCardHtml`
 * reads has to be here or the card comes back as a nameless dash.
 */
const pickPayload = (player) => ({
  id: String(player.id),
  name: player.name,
  position: player.position ?? "",
  overall_rating: player.overall_rating ?? player.overall_max ?? player.overall ?? "",
  region: player.region ?? "",
  nationality: player.nationality ?? player.nation ?? "",
  league: player.league ?? "",
  club: player.club ?? "",
  foot: player.foot ?? "",
  playing_style: player.playing_style ?? "",
  height: player.height ?? "",
  weight: player.weight ?? "",
  age: player.age ?? "",
});

// ── Ready flags ──────────────────────────────────────────────

export async function setGuestReady(ready) {
  const { ok, data } = await postAsMe("ready", { ready: Boolean(ready) });
  if (!ok) {
    showToast(data.error || "Could not update ready.");
    return;
  }
  if (data.room) {
    applyPresenceSnapshot(data.room);
    cb.renderLobby();
  }
}

/**
 * Answers one of the Start Match handshakes — ready, start or finish.
 *
 * The server owns the transitions, so this posts an answer and re-renders from
 * whatever status comes back. It does **not** work out whether the room should
 * advance: it used to, by testing both sides' ready flags itself, which is a
 * second implementation of a rule that already lives in one place.
 */
export async function setMatchStep(step, value) {
  const { ok, data } = await postAsMe("match-step", { step, value: Boolean(value) });
  if (!ok) {
    showToast(data.error || "Could not update the match.");
    return;
  }
  if (data.room) applyPresenceSnapshot(data.room);

  /* Both sides pressed FINISH: the match is over, and this is the one-way move
     into the post-match footer. Every other answer is an ordinary re-render. */
  if (String(state.room?.status || "") === ROOM_STATUS_DONE) {
    cb.enterPostMatch();
    return;
  }
  cb.renderDraftUi();
}

/**
 * The ways out of a finished room. `new-match` ends it for both sides; the
 * rematch trio keeps both seats and only `accept` resets the draft.
 *
 * Returns true when the server took the action, so the caller can decide where
 * to go next — this function deliberately does not navigate.
 */
export async function postMatchAction(action) {
  const { ok, data } = await postAsMe("post-match", { action });
  if (!ok) {
    showToast(data.error || "Could not do that.");
    return false;
  }
  if (data.room) applyPresenceSnapshot(data.room);
  return true;
}

// ── Bans ─────────────────────────────────────────────────────

/** Moves staged bans into the local room copy and returns them for posting. */
function flushStagedBansLocally() {
  if (!state.stagedBans.length) return [];
  const toSubmit = [...state.stagedBans];
  state.stagedBans = [];
  if (state.room) {
    for (const player of toSubmit) applyLocalBan(state.room, player);
  }
  return toSubmit;
}

/** Posts bans one at a time so a single rejection doesn't discard the rest. */
async function submitBansToApi(players) {
  if (!state.room || !players.length) return;
  for (const player of players) {
    const { ok, data } = await postAsMe("ban", { player: banPayload(player) });
    if (!ok) showToast(data?.error || "Could not confirm ban.");
    else if (data.room) applyPresenceSnapshot(data.room);
  }
  cb.renderDraftUi();
}

/** Marks this side's bans final. The server advances the draft once both agree. */
async function callBanConfirm() {
  const prevTurnIndex = state.room?.turnIndex;
  const { ok, data } = await postAsMe("ban-confirm");
  if (!ok || !data.room) return;

  applyPresenceSnapshot(data.room);
  // Server moved us to the pick phase — start its timer now rather than
  // waiting for the next render cycle to notice.
  if (state.room.turnIndex > prevTurnIndex && state.phase === "draft") startTurnTimer();
  cb.renderDraftUi();
}

export async function confirmStagedBans() {
  const toSubmit = flushStagedBansLocally();
  cb.renderDraftUi();
  await submitBansToApi(toSubmit);
  await callBanConfirm();
}

/**
 * Takes this side's bans back off the table while waiting for the opponent.
 *
 * They return to the **staged** strip rather than disappearing, so the × and the
 * counter that put them there can take them away again — and re-confirming is
 * the same button it always was. The server does the same move on its copy; the
 * local one has to happen too, because the presence heartbeat overwrites
 * `entry.stagedBans[side]` with whatever is in `state.stagedBans`.
 */
export async function unconfirmBans() {
  const room = state.room;
  if (!room) return;

  state.stagedBans = [...(room.bans?.[state.mySide] || [])];
  const { ok, data } = await postAsMe("ban-confirm", { confirmed: false });
  if (!ok) {
    showToast(data?.error || "Could not un-confirm your bans.");
    return;
  }
  if (data.room) applyPresenceSnapshot(data.room);
  cb.renderDraftUi();
}

// ── Confirming a squad ───────────────────────────────────────

/**
 * Marks this side's lineup final, or takes it back.
 *
 * **Confirming does not move you on.** The server advances to the ready phase
 * only once both sides have confirmed, and until then this is reversible — which
 * is the whole point of it being a flag rather than a transition.
 */
export async function confirmPicks(confirmed) {
  if (!state.room) return;

  /* The formation goes with the confirmation, not with the lineup: picking a
     shape re-renders the pitch locally and posts nothing, so `/picks` can be
     several changes stale by the time a side confirms. Start Match draws the
     opponent's pitch from this. */
  const { ok, data } = await postAsMe("picks-confirm", {
    confirmed: Boolean(confirmed),
    /* Read straight off state rather than through `getPickFormation`:
       gamePlans.js imports `replaceMyPicks` from this module, so importing it
       back would close a cycle. It is the same one-line expression. */
    formation: normalizeFormation(state.pickManualFormation),
  });
  if (!ok) {
    showToast(data?.error || "Could not update your squad confirmation.");
    return;
  }
  if (data.room) applyPresenceSnapshot(data.room);
  cb.renderDraftUi();
}

/** Timer expiry path: submit whatever is staged without confirming the side. */
export async function flushAndSubmitStagedBans() {
  await submitBansToApi(flushStagedBansLocally());
}

/**
 * True while this side has confirmed and has not taken it back. Every write in
 * that phase goes through one of the two guards below; the server refuses them
 * as well, so a stale tab cannot slip an edit past a confirmation.
 */
export const areBansLocked = (room = state.room) =>
  Boolean(room?.bansConfirmed?.[state.mySide]);

export const isLineupLocked = (room = state.room) =>
  Boolean(room?.picksConfirmed?.[state.mySide]);

/** Stages a ban locally; nothing is posted until CONFIRM BANS. */
export function submitBan(player) {
  const room = state.room;
  if (!room) return;

  const turn = state.schedule[room.turnIndex];
  const isMyTurn = String(turn?.side || "") === "both" || turn?.side === state.mySide;
  if (turn?.action !== "ban" || isReadyPhase(room) || !isMyTurn) return;
  if (areBansLocked(room)) {
    showToast("Un-confirm your bans to change them.");
    return;
  }

  const id = String(player.id);
  const alreadyConfirmed = (room.bans?.[state.mySide] || []).some((b) => String(b.id) === id);
  const alreadyStaged = state.stagedBans.some((p) => String(p.id) === id);
  if (alreadyConfirmed || alreadyStaged) return;

  const maxBans = banLimit(room.config);
  const used = (room.bans?.[state.mySide] || []).length + state.stagedBans.length;
  if (maxBans && used >= maxBans) {
    showToast("You already used all bans for your side.");
    return;
  }

  state.stagedBans.push(player);
  cb.renderDraftUi();
}

// ── Picks ────────────────────────────────────────────────────

/**
 * Puts a player into one named slot — the second click of the pair, whichever
 * order it came in: slot then card, or card then slot. Landing on a filled slot
 * replaces whoever was there, exactly as assigning to an occupied slot does on
 * the game-plan pitch.
 *
 * It posts the whole lineup, because a slot is an address: writing to slot 7 of
 * a three-pick lineup has to say where the holes are. The append endpoint this
 * replaced could only ever fill the first one.
 */
export async function placePickInSlot(room, player, slot) {
  const mySide = state.mySide;
  const maxPicks = pickLimit(room.config);
  if (maxPicks && slot >= maxPicks) return;

  const picks = Array.isArray(room.picks?.[mySide]) ? [...room.picks[mySide]] : [];
  // Pad, or a write past the end of a short lineup lands nowhere.
  while (picks.length <= slot) picks.push(null);

  picks[slot] = player;
  state.pickActiveSlot = null;
  await replaceMyPicks(picks);
}

/**
 * A click on a pool card. **Nothing is posted until a slot is named** — a pick
 * always lands in a place you chose, never at the end of the list.
 *
 * With a slot already selected this is the second click and the player goes
 * straight in. Otherwise it is the *first* click: the card is marked chosen and
 * the next slot click places him. Clicking the same card again lets it go.
 */
export function submitPick(player) {
  const room = state.room;
  if (!room) return;

  const turn = state.schedule[room.turnIndex];
  if (turn?.action !== "pick" || isReadyPhase(room)) return;
  if (isLineupLocked(room)) {
    showToast("Un-confirm your squad to change it.");
    return;
  }

  /* Read before any `await` — the document-level click handler that clears the
     selection runs after this one on the same click. */
  const slot = state.pickActiveSlot;
  if (slot !== null) {
    state.pickPendingPlayerId = null;
    void placePickInSlot(room, player, slot);
    return;
  }

  const id = String(player.id);
  state.pickPendingPlayerId = state.pickPendingPlayerId === id ? null : id;
  cb.renderDraftUi();
}

/**
 * Replaces this side's whole lineup — **the one and only pick write**. Placing a
 * player, changing one, swapping two, CLEAR ALL (`[]`) and LOAD GAME PLAN all
 * come through here.
 *
 * It does **not** apply optimistically. Presence polls every 500 ms and hands
 * the server's copy of the lineup straight back, so a local edit that has not
 * been acknowledged survives about half a second; waiting for the authoritative
 * response is what makes a removal stick at all. Returns the number of picks the
 * server actually kept, so the caller can report what it dropped.
 */
export async function replaceMyPicks(players) {
  const room = state.room;
  if (!room) return null;
  if (isLineupLocked(room)) {
    showToast("Un-confirm your squad to change it.");
    return null;
  }

  // `null` holes must survive the round trip — they are the empty pitch slots.
  const { ok, data } = await postAsMe("picks", {
    players: players.map((p) => (p ? pickPayload(p) : null)),
  });
  if (!ok) {
    showToast(data?.error || "Could not update your lineup.");
    return null;
  }
  if (data.room) applyPresenceSnapshot(data.room);
  cb.renderDraftUi();
  return pickCount(state.room?.picks?.[state.mySide]);
}
