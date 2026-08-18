/* ============================================================
   How long a message needs to be on screen to be read.

   Both toasts used a **fixed** lifetime — 3500ms on the home page, 2400ms in
   the room — which is the same amount of time for "Saved." as for "test1
   started a different match. This room is still yours." One of those is
   comfortable and the other is gone before you have finished it.

   The formula, and where each number comes from:

       ms = 3000 + words × 300,  clamped to [4000, 10000]

   - **300ms per word** is 200 words/minute, the reading speed Nielsen Norman
     assumes for interface text (they use 250 only for "highly literate"
     audiences, which is not a bet worth making on a message you get one shot
     at).
   - **3000ms of base time** is the part that is not reading: noticing that
     something appeared at the edge of vision and moving your eyes to it. The
     reading clock cannot start until that has happened.
   - **4000ms floor** — Material's snackbar default and the bottom of the
     4–8s band the notification-design literature converges on. Below it a
     message reads as a flicker even when it is two words long.
   - **10000ms ceiling** — an auto-dismissing message that outstays this is
     better off being something the user dismisses. Nothing in this app comes
     close; the cap is there so a future long message cannot park itself over
     the UI.

   Cross-check: the base + per-word pair reproduces the worked example in the
   accessibility guidance it came from — a 10-word toast lands on exactly 6s.

   **This is a floor for comfort, not an accessibility guarantee.** WCAG 2.2.1
   (Timing Adjustable) is satisfied by letting the user control the limit, which
   means a dismiss affordance or a hover-pause, not a longer number. Neither
   toast has one. If one is ever added, this stays as the default it starts from.
   ============================================================ */

const BASE_MS = 3000;
const MS_PER_WORD = 300;   // 200 wpm
const MIN_MS = 4000;
const MAX_MS = 10000;

/** Milliseconds `text` should stay on screen to be read at a comfortable pace. */
export function readingTimeMs(text) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.min(MAX_MS, Math.max(MIN_MS, BASE_MS + words * MS_PER_WORD));
}
