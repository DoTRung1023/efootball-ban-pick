/**
 * Room page entry point.
 *
 * Wires the callback registry (see room/callbacks.js), installs global error
 * reporting, and boots the lobby. All behaviour lives in the room/ modules.
 */

import { cb } from './room/callbacks.js';
import { showToast, getRoomCodeFromUrl } from './room/utils.js';
import { isBothMatchReady } from './room/draftFlow.js';
import { flushAndSubmitStagedBans } from './room/draftActions.js';
import { renderDraftUi } from './room/draftView.js';
import { initDraftControls } from './room/draftControls.js';
import { startDraftFromLobby, tryEnterDraftFromRoomSnapshot } from './room/draftSession.js';
import { showDone, showOpponentLeft, showRoomClosed } from './room/exitScreens.js';
import { updateStageTabs } from './room/stageTabs.js';
import { initLobby } from './room/lobby.js';

// ── Global error surfacing ───────────────────────────────────

/** Reports an error to the user without letting the reporter itself throw. */
function reportError(label, error, message) {
  try {
    console.error(label, error);
    showToast(String(message || "An unexpected error occurred"), "warn");
  } catch (err) {
    console.error(`Error in ${label} handler:`, err);
  }
}

window.addEventListener("unhandledrejection", (ev) => {
  const reason = ev.reason;
  reportError("Unhandled promise rejection:", reason, reason?.message ?? String(reason ?? "Unexpected error"));
  ev.preventDefault?.();
});

window.addEventListener("error", (ev) => {
  reportError("Runtime error:", ev.error || ev.message, ev.message || ev.error?.message);
});

// ── Callback wiring ──────────────────────────────────────────

cb.renderDraftUi = renderDraftUi;
cb.tryEnterDraftFromRoomSnapshot = tryEnterDraftFromRoomSnapshot;
cb.isBothMatchReady = isBothMatchReady;
cb.showDone = showDone;
cb.showRoomClosed = showRoomClosed;
cb.onOpponentLeft = showOpponentLeft;
cb.startDraftFromLobby = startDraftFromLobby;
cb.updateStageTabs = updateStageTabs;
cb.flushAndSubmitStagedBans = flushAndSubmitStagedBans;

// ── Boot ─────────────────────────────────────────────────────

/** Copies text to the clipboard, falling back to showing it in a toast. */
function copyToClipboard(text, successMessage) {
  navigator.clipboard.writeText(text).then(
    () => showToast(successMessage),
    () => showToast(text),
  );
}

function initInviteControls(code) {
  document.getElementById("copyInviteBtn")?.addEventListener("click", () => {
    const inviteUrl = new URL(`${window.location.origin}/room/${encodeURIComponent(code)}`);
    inviteUrl.searchParams.set("mode", "join");
    copyToClipboard(inviteUrl.toString(), "Invite link copied!");
  });

  document.getElementById("copyCodeBtn")?.addEventListener("click", () => {
    if (!code) {
      showToast("No room code.");
      return;
    }
    copyToClipboard(code, "Code copied!");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initDraftControls();
  initInviteControls(getRoomCodeFromUrl());
  window.requestAnimationFrame(() => initLobby());
});
