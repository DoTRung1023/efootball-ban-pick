/* ============================================================
   SHOWCASE — the stored pool, edited straight from the grid

   One list with three consumers: the sign-in page's card backdrop, the
   bannable board shown for a seat with no account, and the target
   `squads.js` auto-bans when that seat's turn expires. They all read the same
   snapshot, so what this tab writes is literally what a visitor sees and what
   an anonymous opponent can lose.

   There is no staged list any more, no SAVE button and no readout: a click on
   a card *is* the edit, it writes, and the mark it leaves is the receipt. Four
   consequences worth knowing:

     - A mis-click is a live change. Its undo is the thumb it just put in the
       CHOSEN panel: the browser only adds, that panel only removes.
     - Writes are debounced and serialised. Clicking through ten cards sends one
       PUT of the final list, not ten, and a second click during a write re-arms
       the timer rather than racing it.
     - A refused write rolls the local list back to what the server confirmed. A
       grid still marking cards the server never accepted would be a lie.
     - Success says nothing, because the thumb already did — a card joins the
       CHOSEN column the instant you click it. `#scWarn` under that column is
       the only line that speaks, and it speaks for the three states the column
       cannot carry: refused, full, or too thin to ban out of.

   Order is rank — `topBannableFrom` auto-bans position 1 first — and it is now
   simply the order cards were picked in. REBUILD went with the header; the way
   back from a mess is `POST /api/admin/top-players/refresh`, which recomputes
   the automatic top 30.
   ============================================================ */

import { CARD_IMG, makePlayerImg } from "@/shared/players/playerMeta.js";
import { icon } from "@/shared/icons/icon.js";
import { apiFetch, apiSend } from "./adminApi.js";
import { initShowcaseBrowser, refreshShowcaseMarks } from "./showcaseBrowser.js";

const el = (id) => document.getElementById(id);

/** How long a burst of clicks may settle before one PUT goes out. */
const SAVE_DEBOUNCE_MS = 600;

/** `picked` is what the grid marks; `saved` is what the server confirmed. */
const state = {
  picked: [],
  saved: [],
  max: 50,
  advisedMin: 23,
  error: null,
};

let saveTimer = null;
let inFlight = false;

const idsOf = (list) => list.map((p) => p.id).join(",");
const isFull = () => state.picked.length >= state.max;

/* ── Painting ───────────────────────────────────────────────── */

/* A refused write outranks the rest: it is the one state the grid cannot show
   on its own, and it is held in state rather than written straight to the DOM
   so the next render cannot silently wipe it. */
function renderNotice() {
  const box = el("scWarn");
  const n = state.picked.length;
  let text = state.error;
  if (!text && isFull()) {
    text = `The list is full at ${state.max}. Remove one under ON SIGN-IN to add another.`;
  } else if (!text && n > 0 && n < state.advisedMin) {
    text = `${n} player${n === 1 ? "" : "s"} is fewer than a full squad of `
      + `${state.advisedMin}. A seat with no account bans out of this list, so it will `
      + `have little to choose from.`;
  }
  box.textContent = text || "";
  box.hidden = !text;
  box.classList.toggle("is-error", Boolean(state.error));
}

/* One thumb per chosen player, in list order — the same card art the browser
   beside it shows, at the ban board's thumb size.

   The `title` is the action, not the player: the art already says who this is,
   and a name trailing the pointer across fifty thumbs was the noise that got
   the hover card taken out. The name stays on `aria-label`, where a screen
   reader needs it to tell one Remove button from the next forty-nine. */
function makeThumb(player) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sc-thumb";
  btn.title = "Click to remove";
  btn.setAttribute("aria-label", `Remove ${player.name} from the sign-in page`);
  btn.appendChild(makePlayerImg(CARD_IMG(player.id), player.name));

  const x = document.createElement("span");
  x.className = "sc-thumb-x";
  x.innerHTML = icon("close", { size: 11 });
  btn.appendChild(x);

  btn.addEventListener("click", () => removePlayer(player.id));
  return btn;
}

function renderChosen() {
  el("scChosenCount").textContent = `${state.picked.length} / ${state.max}`;
  const strip = el("scChosen");
  strip.replaceChildren();
  if (!state.picked.length) {
    const empty = document.createElement("p");
    empty.className = "sc-chosen-empty";
    empty.textContent = "Nobody yet. Click a card in the catalog to add one.";
    strip.appendChild(empty);
    return;
  }
  state.picked.forEach((player) => strip.appendChild(makeThumb(player)));
}

function renderAll() {
  renderNotice();
  renderChosen();
  /* The grid marks what is chosen, so it repaints whenever the list changes.
     `refreshShowcaseMarks` toggles classes rather than rebuilding — a rebuild
     would drop the hover cards bound to each card. */
  refreshShowcaseMarks();
}

/* ── Saving ─────────────────────────────────────────────────── */

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, SAVE_DEBOUNCE_MS);
}

/** Takes a server response as the new confirmed truth. */
function adoptSaved(status) {
  state.saved = (status.players || []).map((p) => ({ id: String(p.id), name: p.name }));
  state.max = status.max ?? state.max;
  state.advisedMin = status.advisedMin ?? state.advisedMin;
}

async function save() {
  if (inFlight) { scheduleSave(); return; }
  const sent = idsOf(state.picked);
  inFlight = true;
  try {
    adoptSaved(await apiSend("/api/admin/top-players", "PUT", { ids: state.picked.map((p) => p.id) }));
    state.error = null;
    /* The response is the truth for what was *sent*, not for what is on screen
       now. Adopting it after a click that landed mid-write would undo that
       click; the timer that click re-armed will send the newer list instead. */
    if (idsOf(state.picked) === sent) state.picked = [...state.saved];
  } catch (err) {
    state.picked = [...state.saved];
    state.error = err.message || "That did not save. Try again.";
  } finally {
    inFlight = false;
    renderAll();
  }
}

/* ── State changes ──────────────────────────────────────────── */

function edited() {
  state.error = null;
  renderAll();
  scheduleSave();
}

function addPlayer(id, name) {
  if (isFull() || state.picked.some((p) => p.id === id)) return;
  state.picked = [...state.picked, { id, name }];
  edited();
}

function removePlayer(id) {
  state.picked = state.picked.filter((p) => p.id !== id);
  edited();
}

/* ── Entry points ───────────────────────────────────────────── */

export async function loadTopPlayers() {
  try {
    adoptSaved(await apiFetch("/api/admin/top-players"));
    state.picked = [...state.saved];
    state.error = null;
    renderAll();
  } catch {
    state.error = "Could not load the sign-in list.";
    renderAll();
  }
}

export function initTopPlayersControl() {
  /* The browser owns finding cards and only ever adds; this owns the list, and
     removal is a click on a thumb in the CHOSEN panel. */
  initShowcaseBrowser({
    isPicked: (id) => state.picked.some((p) => p.id === id),
    canPick: () => !isFull(),
    onAdd: addPlayer,
  });
  renderAll();
}
