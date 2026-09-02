/**
 * Room page entry point.
 *
 * Wires the callback registry, installs global error reporting, and boots the
 * lobby. All behaviour lives in the draft feature — see
 * public/js/features/draft/.
 */

import {
  cb,
  announce,
  showToast,
  getRoomCodeFromUrl,
  confirmStagedBans,
  autoFillAndConfirmPicks,
  renderDraftUi,
  enterPostMatch,
  initDraftControls,
  startDraftFromLobby,
  tryEnterDraftFromRoomSnapshot,
  onRematchAccepted,
  showRoomClosed,
  updateStageTabs,
  initLobby,
  initRoomChat,
  renderRoomChat,
} from "@/features/draft/index.js";
import { takePendingToast } from "@/shared/ui/pendingToast.js";
import { installErrorReporter } from "@/shared/lib/errorReporter.js";

// ── Global error surfacing ───────────────────────────────────

/* `announce` rather than the home page's `showToast`: this page has its own
   toast with a `warn` variant and a longer dwell, and the two are deliberately
   not merged (see the note atop shared/ui/toast.js). Injecting it is what lets
   one reporter serve four pages that each say things differently. */
installErrorReporter({ notify: (message) => announce(message, "warn") });

// ── Callback wiring ──────────────────────────────────────────

cb.renderDraftUi = renderDraftUi;
cb.tryEnterDraftFromRoomSnapshot = tryEnterDraftFromRoomSnapshot;
cb.enterPostMatch = enterPostMatch;
cb.onRematchAccepted = onRematchAccepted;
cb.showRoomClosed = showRoomClosed;
cb.startDraftFromLobby = startDraftFromLobby;
cb.updateStageTabs = updateStageTabs;
cb.confirmStagedBans = confirmStagedBans;
cb.autoFillAndConfirmPicks = autoFillAndConfirmPicks;
cb.renderRoomChat = renderRoomChat;

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

/* A message left by whatever redirected us here — a rematch being accepted, a
   NEW MATCH landing in a fresh room. `announce` rather than `showToast`: the
   user did not ask to be on this page and is not looking for the answer yet. */
function flushPendingToast() {
  const pending = takePendingToast();
  if (pending) announce(pending.message, pending.variant);
}

document.addEventListener("DOMContentLoaded", () => {
  flushPendingToast();
  initDraftControls();
  initRoomChat();
  initInviteControls(getRoomCodeFromUrl());
  window.requestAnimationFrame(() => initLobby());
});
