/**
 * Stage indicator across the top of the room:
 * ban-setting (lobby) -> ban -> pick -> start (done).
 */

import { state } from '@/features/draft/state.js';

const STAGE_ORDER = ["bansetting", "ban", "pick", "start"];
const STAGE_CLASSES = STAGE_ORDER.map((_, i) => `stage-${i}`);

/** Maps the visible view to its stage. Returns null for views with no stage. */
function currentStageFor(viewId) {
  if (viewId === "viewLobby") return "bansetting";
  if (viewId !== "viewDraft") return null;

  const room = state.room;
  const turn = room ? state.schedule[room.turnIndex] : null;
  /* Start Match *is* the "start" stage, in both its confirm and its match-live
     shape. It used to light the **ban** dot, because the only thing that ever
     reached "start" was the separate done screen — so the indicator walked
     backwards from pick to ban at the exact moment the draft finished. */
  if (state.phase === "done" || state.phase === "ready" || String(room?.status || "") === "await-ready") {
    return "start";
  }
  return turn?.action === "ban" ? "ban" : "pick";
}

export function updateStageTabs() {
  const progressBar = document.querySelector(".stage-progress-bar");
  const dots = document.querySelectorAll(".stage-progress-dot");
  if (!progressBar || dots.length === 0) return;

  const viewId = document.querySelector(".view.is-active")?.id;
  const currentIndex = STAGE_ORDER.indexOf(currentStageFor(viewId));

  progressBar.classList.remove(...STAGE_CLASSES);
  progressBar.classList.add(`stage-${currentIndex}`);

  dots.forEach((dot) => {
    const dotIndex = STAGE_ORDER.indexOf(dot.getAttribute("data-stage"));
    dot.classList.remove("is-active", "is-completed");
    if (dotIndex < currentIndex) dot.classList.add("is-completed");
    else if (dotIndex === currentIndex) dot.classList.add("is-active");
  });
}
