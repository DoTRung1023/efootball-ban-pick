/** Event wiring for the draft view. Bound once on page load. */

import { DEFAULT_FORMATION, FIXED_PICKS_PER_SIDE } from '@/features/draft/constants.js';
import { askConfirm, showToast } from '@/features/draft/utils.js';
import { state } from '@/features/draft/state.js';
import { pickCount } from '@/features/draft/players.js';
import { leavePresence } from '@/features/draft/engine/presence.js';
import { loadGamePlanIntoPicks } from '@/features/draft/gamePlans.js';
import { clearTurnTimer, pickLimit } from '@/features/draft/engine/draftFlow.js';
import {
  confirmPicks,
  confirmStagedBans,
  isLineupLocked,
  placePickInSlot,
  replaceMyPicks,
  setMatchStep,
  unconfirmBans,
} from '@/features/draft/engine/draftActions.js';
import { stepForStatus } from '@/features/draft/ready/matchSteps.js';
import { renderDraftUi } from './draftView.js';
import { allowLeave, initLeaveGuard } from './leaveGuard.js';

const on = (id, event, handler) =>
  document.getElementById(id)?.addEventListener(event, handler);

/** Finds the delegated target for a click, or null. */
const closestTarget = (e, selector) =>
  e.target instanceof Element ? e.target.closest(selector) : null;

/**
 * Was the click inside the element with this id?
 *
 * Reads the **dispatch path**, not the live tree, and that is the whole point:
 * the pick grid's own handler runs first and re-renders synchronously, which
 * replaces the node the click landed on. By the time this listener sees the
 * event, `e.target` is detached and `closest()` walks up to nothing — so a
 * `closest("#pickGrid")` guard reports "outside the grid" for a click that was
 * plainly inside it. `composedPath()` is fixed when the event is dispatched and
 * still holds the original ancestors.
 */
const clickedInside = (e, id) =>
  (typeof e.composedPath === "function" ? e.composedPath() : [])
    .some((n) => n instanceof Element && n.id === id);

export function initDraftControls() {
  initStepControls();
  initBanControls();
  initPickControls();
  initSlotControls();
  initPlanPicker();
  initFormationDropdown();
  initLeaveControl();
  initLeaveGuard();
}

/* One button, three meanings — READY, then START MATCH, then FINISH MATCH. The
   room status says which handshake is open and `matchSteps.js` says what to
   post for it, so nothing here has to know there are three. */
function initStepControls() {
  on("draftStepBtn", "click", () => {
    if (state.phase !== "ready" || !state.room) return;
    const step = stepForStatus(state.room.status);
    if (!step) return;
    void setMatchStep(step.step, !state.room[step.flag]?.[state.mySide]);
  });
}

function initBanControls() {
  on("confirmBansBtn", "click", () => {
    if (!state.room) return;
    // The same button both ways — see renderConfirmButton in banView.
    if (state.room.bansConfirmed?.[state.mySide]) void unconfirmBans();
    else void confirmStagedBans();
  });

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
  /* CONFIRM PICKS marks this side final; it does **not** advance the draft.
     The server moves both players on once both have confirmed, so the same
     button un-confirms while you are waiting. */
  on("confirmPicksBtn", "click", () => {
    if (state.phase !== "draft" || !state.room) return;
    const room = state.room;
    if (room.picksConfirmed?.[state.mySide]) {
      void confirmPicks(false);
      return;
    }
    const maxPicks = pickLimit(room.config) || FIXED_PICKS_PER_SIDE;
    if (pickCount(room.picks?.[state.mySide]) < maxPicks) return;
    void confirmPicks(true);
  });

  /* Goes to the server, not a local mutation: clearing locally lasted exactly
     until the next presence poll handed the server's copy back. */
  on("pickClearAllBtn", "click", async () => {
    if (!state.room) return;
    const ok = await askConfirm({ title: "Clear Lineup", message: "Remove all your picks?", okText: "Clear" });
    if (!ok) return;
    await replaceMyPicks([]);
  });
}

/**
 * Pitch and bench slots: select, swap, fill, remove — the same click-pair model
 * as the game-plan pitch on the home page (no drag and drop, so it works on
 * touch).
 *
 * **Either half can come first.** Click a slot then a card, or a card then a
 * slot; the second click is what places the player. Empty slots are selectable
 * for exactly that reason. `submitPick` owns the card end and sets
 * `state.pickPendingPlayerId`; this handler owns the slot end and reads it.
 *
 * Every change posts the whole lineup through `replaceMyPicks` — it is the only
 * pick write there is. The array is slot-addressed, so an emptied slot stays
 * empty instead of pulling the rest of the lineup along behind it.
 */
function initSlotControls() {
  const slotsOf = () => {
    const picks = state.room?.picks?.[state.mySide];
    return Array.isArray(picks) ? [...picks] : [];
  };

  const clearSelection = () => {
    state.pickActiveSlot = null;
    state.pickPendingPlayerId = null;
    renderDraftUi();
  };

  /* Resolved out of the whole squad rather than the filtered pool, so changing
     the search or the position tab between the two clicks does not strand a
     chosen card. */
  const pendingPlayer = () => {
    const id = state.pickPendingPlayerId;
    if (id === null) return null;
    return (state.players || []).find((p) => String(p.id) === id) || null;
  };

  document.addEventListener("click", async (e) => {
    if (state.phase !== "draft" || !state.room) return;
    // Confirmed squads are read-only until un-confirmed.
    if (isLineupLocked(state.room)) return;

    const removeBtn = closestTarget(e, "[data-pick-slot-remove]");
    if (removeBtn) {
      e.stopPropagation();
      const slot = Number(removeBtn.getAttribute("data-pick-slot-remove"));
      const picks = slotsOf();
      if (!picks[slot]) return;
      picks[slot] = null;
      state.pickActiveSlot = null;
      await replaceMyPicks(picks);
      return;
    }

    const slotEl = closestTarget(e, "[data-pick-slot]");
    if (!slotEl) {
      /* A pool card is the *other* half of the pair, and this listener runs
         after the grid's own — clearing here would drop the choice `submitPick`
         has just made (or is about to read). */
      if (clickedInside(e, "pickGrid")) return;
      // a click anywhere else drops whichever half is armed
      if (state.pickActiveSlot !== null || state.pickPendingPlayerId !== null) clearSelection();
      return;
    }

    const slot = Number(slotEl.getAttribute("data-pick-slot"));

    // A card is already chosen — this slot is its destination.
    if (state.pickPendingPlayerId !== null) {
      const player = pendingPlayer();
      state.pickPendingPlayerId = null;
      state.pickActiveSlot = null;
      // gone from the squad since it was chosen: drop it and fall through
      if (player) {
        await placePickInSlot(state.room, player, slot);
        return;
      }
    }

    const prev = state.pickActiveSlot;
    const picks = slotsOf();

    if (prev === null) {
      state.pickActiveSlot = slot;
      renderDraftUi();
      return;
    }

    if (prev === slot) {
      clearSelection();
      return;
    }

    const a = picks[prev] ?? null;
    const b = picks[slot] ?? null;
    // Two empty slots: nothing to exchange, so just move the selection.
    if (!a && !b) {
      state.pickActiveSlot = slot;
      renderDraftUi();
      return;
    }

    // Pad so a swap into a slot past the end of a short lineup still lands.
    const highest = Math.max(prev, slot);
    while (picks.length <= highest) picks.push(null);
    picks[prev] = b;
    picks[slot] = a;

    state.pickActiveSlot = null;
    await replaceMyPicks(picks);
  });
}

/** LOAD GAME PLAN — opens the dialog, applies the chosen plan, closes it. */
function initPlanPicker() {
  const overlay = document.getElementById("pickPlanOverlay");
  const closePicker = () => overlay?.setAttribute("hidden", "");

  on("pickLoadPlanBtn", "click", () => {
    if (!state.room) return;
    overlay?.removeAttribute("hidden");
    renderDraftUi();
  });

  on("pickPlanCloseBtn", "click", closePicker);
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) closePicker();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay && !overlay.hasAttribute("hidden")) closePicker();
  });

  on("pickPlanList", "click", async (e) => {
    const item = closestTarget(e, "[data-pick-plan]");
    if (!item || item.getAttribute("aria-busy") === "true") return;

    const planId = item.getAttribute("data-pick-plan");

    /* Close the list before asking anything. Picking a plan is a decision made;
       leaving the list up behind a confirm dialog reads as if nothing happened —
       and it *was* in front of it, because both are `.confirm-overlay` and this
       one is later in the DOM. pick.css now stacks them explicitly, but the
       ordering is the real fix: choose, then confirm. Cancelling drops you back
       to the board, not back to the list. */
    closePicker();

    const myCount = pickCount(state.room?.picks?.[state.mySide]);
    if (myCount) {
      const ok = await askConfirm({
        title: "Replace lineup",
        message: `This replaces all ${myCount} of your current picks.`,
        okText: "Replace",
      });
      if (!ok) return;
    }

    // Re-entrancy guard, not a visual: the row is out of sight by now, but the
    // list can be reopened while the fetch is still in flight.
    item.setAttribute("aria-busy", "true");
    const result = await loadGamePlanIntoPicks(planId);
    item.removeAttribute("aria-busy");

    if (!result) return;
    showToast(
      result.dropped
        ? `Loaded ${result.loaded} players · ${result.dropped} unavailable`
        : `Loaded ${result.loaded} players`,
    );
  });
}

function initFormationDropdown() {
  const panelId = "pickFormationPanel";

  on("pickFormationBtn", "click", (e) => {
    e.stopPropagation();
    const panel = document.getElementById(panelId);
    const btn = document.getElementById("pickFormationBtn");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    btn?.setAttribute("aria-expanded", panel.hidden ? "false" : "true");
  });

  document.addEventListener("click", (e) => {
    const panel = document.getElementById(panelId);
    if (!panel || panel.hidden) return;
    const wrap = document.querySelector(".pick-formation-wrap");
    if (wrap && e.target instanceof Element && !wrap.contains(e.target)) {
      panel.hidden = true;
      document.getElementById("pickFormationBtn")?.setAttribute("aria-expanded", "false");
    }
  });

  on(panelId, "click", (e) => {
    const btn = closestTarget(e, "[data-pick-formation]");
    if (!btn) return;
    state.pickManualFormation = btn.getAttribute("data-pick-formation") || DEFAULT_FORMATION;
    const panel = document.getElementById(panelId);
    if (panel) panel.hidden = true;
    document.getElementById("pickFormationBtn")?.setAttribute("aria-expanded", "false");
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

    // Asked and answered — `beforeunload` must not ask again on the way out.
    allowLeave();
    clearTurnTimer();
    await leavePresence();
    window.location.href = "/";
  });
}
