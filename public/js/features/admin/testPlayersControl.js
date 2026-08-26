/* ============================================================
   TEST CARDS — catalog rows an admin has marked as not-real

   pesdb carries placeholder entries (116-rated goalkeepers on blank art, and
   the like). They are legitimate rows and the scrape cannot tell them apart, so
   the judgement is an admin's and it is stored on the row. What the mark does,
   and the three things it deliberately does *not* do, are in
   `src/features/players/testPlayers.js` — the same list is worth knowing here:

     hidden   the catalog search a user sees, and the club/league values that
              feed its filters
     kept     this tab and the CATALOG tab, a squad that already holds the card,
              and the sign-in page if an admin puts it there on purpose

   ## How it differs from the sign-in list next door

   That one is an ordered list of at most fifty, so it is written whole and
   debounced. A mark is a flag on a row: independent of every other mark, no
   order, no ceiling. So each click is its own small write, and there is nothing
   to coalesce.

   Writes are optimistic and roll back. A grid still marking a card the server
   refused would be a lie, and there is no SAVE button left to stay lit.
   ============================================================ */

import { CARD_IMG, makePlayerImg } from "@/shared/players/playerMeta.js";
import { icon } from "@/shared/icons/icon.js";
import { apiFetch, apiSend } from "./adminApi.js";
import { createPlayerBrowser } from "./playerBrowser.js";

/* Spelled out for the same reason as the sign-in tab: `domIds.js` only sees a
   literal inside `getElementById(...)`, so a config object or an `el()` alias
   would hide every one of these from the gate. */
const BROWSER_ELS = () => ({
  search:      document.getElementById("tcSearch"),
  sortWrap:    document.getElementById("tcSortWrap"),
  sortBtn:     document.getElementById("tcSortBtn"),
  sortLabel:   document.getElementById("tcSortLabel"),
  sortDirBtn:  document.getElementById("tcSortDirBtn"),
  sortDirIcon: document.getElementById("tcSortDirIcon"),
  filterWrap:  document.getElementById("tcFilterWrap"),
  filterBtn:   document.getElementById("tcFilterBtn"),
  infoBtn:     document.getElementById("tcInfoBtn"),
  grid:        document.getElementById("tcGrid"),
  more:        document.getElementById("tcMore"),
});

const FILTER_IDS = {
  posWrap: "tcPosMs", posBtn: "tcPosMsBtn", posLabel: "tcPosMsLabel", posPanel: "tcPosMsPanel",
  ctWrap: "tcCtMs", ctBtn: "tcCtMsBtn", ctLabel: "tcCtMsLabel", ctPanel: "tcCtMsPanel",
  psWrap: "tcPsMs", psBtn: "tcPsMsBtn", psLabel: "tcPsMsLabel", psPanel: "tcPsMsPanel",
  footWrap: "tcFootMs", footBtn: "tcFootMsBtn", footLabel: "tcFootMsLabel", footPanel: "tcFootMsPanel",
  lgWrap: "tcLgMs", lgBtn: "tcLgMsBtn", lgLabel: "tcLgMsLabel", lgPanel: "tcLgMsPanel",
  rgWrap: "tcRgMs", rgBtn: "tcRgMsBtn", rgLabel: "tcRgMsLabel", rgPanel: "tcRgMsPanel",
  ovrMin: "tcOvrMin", ovrMax: "tcOvrMax",
  ovrMaxMin: "tcOvrMaxMin", ovrMaxMax: "tcOvrMaxMax",
  club: "tcClub", clubAc: "tcClubAc", nation: "tcNation", nationAc: "tcNationAc",
  ageMin: "tcAgeMin", ageMax: "tcAgeMax",
  heightMin: "tcHeightMin", heightMax: "tcHeightMax",
  weightMin: "tcWeightMin", weightMax: "tcWeightMax",
  clearBtn: "tcClearFilters",
};

/** `marked` is what the grid dims; `error` is the last refused write. */
const state = { marked: [], error: null };

let browser = null;

const isMarked = (id) => state.marked.some((p) => p.id === id);

/* ── Painting ───────────────────────────────────────────────── */

function renderNotice() {
  const box = document.getElementById("tcWarn");
  box.textContent = state.error || "";
  box.hidden = !state.error;
  box.classList.toggle("is-error", Boolean(state.error));
}

/* No `title`: the art is the label, and a name trailing the pointer across a
   long list is the noise that got the hover card taken out of this console.
   The name stays on `aria-label`, where a screen reader needs it to tell one
   button from the next. */
function makeThumb(player) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pb-thumb";
  btn.title = "Click to unmark";
  btn.setAttribute("aria-label", `Unmark ${player.name} — put it back in the catalog search`);
  btn.appendChild(makePlayerImg(CARD_IMG(player.id), player.name));

  const x = document.createElement("span");
  x.className = "pb-thumb-x";
  x.innerHTML = icon("close", { size: 11 });
  btn.appendChild(x);

  btn.addEventListener("click", () => unmark(player.id));
  return btn;
}

function renderMarked() {
  document.getElementById("tcMarkedCount").textContent = String(state.marked.length);
  const strip = document.getElementById("tcMarked");
  strip.replaceChildren();
  if (!state.marked.length) {
    const empty = document.createElement("p");
    empty.className = "pb-side-empty";
    empty.textContent = "Nothing marked. The catalog is all real players.";
    strip.appendChild(empty);
    return;
  }
  state.marked.forEach((player) => strip.appendChild(makeThumb(player)));
}

function renderAll() {
  renderNotice();
  renderMarked();
  browser?.refreshMarks();
}

/* ── Writes ─────────────────────────────────────────────────── */

/**
 * One card, one write, applied locally first and undone if the server refuses.
 *
 * `next` is the list to show while the write is in flight; `previous` is what
 * to fall back to. Passing both rather than recomputing means a failed unmark
 * puts the card back where it was rather than at the end.
 */
async function write(id, isTest, next, previous) {
  state.marked = next;
  state.error = null;
  renderAll();
  try {
    await apiSend("/api/admin/test-players", "PUT", { id, isTest });
  } catch (err) {
    state.marked = previous;
    state.error = err.message || "That did not save. Try again.";
    renderAll();
  }
}

function mark(id, name) {
  if (isMarked(id)) return;
  write(id, true, [...state.marked, { id, name }], state.marked);
}

function unmark(id) {
  write(id, false, state.marked.filter((p) => p.id !== id), state.marked);
}

/* ── Entry points ───────────────────────────────────────────── */

export async function loadTestPlayers() {
  try {
    const data = await apiFetch("/api/admin/test-players");
    state.marked = (data.players || []).map((p) => ({ id: String(p.id), name: p.name }));
    state.error = null;
  } catch {
    state.error = "Could not load the marked cards.";
  }
  renderAll();
}

export function initTestPlayersControl() {
  /* No cap, so `canPick` is left at its default. A catalog can hold as many
     placeholder rows as pesdb decides to publish. */
  browser = createPlayerBrowser({
    els: BROWSER_ELS(),
    filterIds: FILTER_IDS,
    panelIds: { sort: "tcSortPanel", filter: "tcFilterPanel" },
    tips: {
      add: "Click to mark as a test card",
      picked: "Already marked — unmark it under MARKED",
      full: "Already marked — unmark it under MARKED",
    },
    isPicked: isMarked,
    onAdd: mark,
  });
  browser.init();
  renderAll();
}
