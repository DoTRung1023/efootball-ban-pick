/**
 * Start Match — the last screen of a room, and the **only** screen after the
 * picks are in.
 *
 * It has two stages and it does not navigate between them; `data-stage` on the
 * board is the whole difference:
 *
 *   confirm  both squads + the READY button       (room status "await-ready")
 *   live     both squads + the three ways out     (room status "done")
 *
 * There used to be a separate `#viewDone` screen for the second stage, which
 * re-listed as plain text the same two squads this screen already draws as
 * cards. Swapping the footer says the same thing without making the user leave
 * the page they were looking at.
 *
 * Every DOM write in here is behind a state key, because `renderDraftUi` calls
 * this on every presence poll (~2 Hz).
 */

import { REVEAL_MODE_BLUR, REVEAL_MODE_HIDDEN } from '@/features/draft/constants.js';
import { escapeHtml } from '@/features/draft/utils.js';
import { normalizeRevealMode } from '@/features/draft/state.js';
import {
  buildOrderedSlotMap,
  filledPicks,
  getFormationLayout,
  normalizeFormation,
} from '@/features/draft/players.js';
import { playerCardHtml } from '@/features/draft/playerCards.js';
import { renderPostMatch } from './postMatch.js';

const LINEUP_SIZE = 11;
/* `footer: false` — the art alone, no detail strip under it. The card already
   prints the name, the position and both ratings; the strip repeated the region
   and nation under every one of 23 cards per side, which on a screen showing 46
   of them at once is a wall of "Europe · Italy". Same call the pick board's
   opponent grid makes. */
const STATIC_CARD = { banned: false, picked: false, clickable: false, footer: false };

/**
 * The field markings, drawn by `shared/pitchField.css` — the same field the
 * game-plan and pick pitches stand on.
 *
 * Those two keep this markup static in their page's HTML, because their
 * renderers rewrite the rows container several times a second and would throw
 * away anything they found in it. **This screen emits it**, for a reason that
 * does not apply to them: there are two pitches here, and `renderTeams` rebuilds
 * the whole of `#smTeams` because the opponent's column is swapped wholesale
 * between reveal modes — static markup could not survive that. Emitting it is
 * safe because the marks are a *sibling* of the rows and the renderer writes
 * both together, and because that renderer is behind a state key rather than
 * running every poll. Geometry still lives entirely in the shared sheet.
 */
const PITCH_MARKS_HTML = `
  <div class="pitch-field-marks" aria-hidden="true">
    <span class="pf-box pf-box--top"></span>
    <span class="pf-box pf-box--bottom"></span>
    <span class="pf-halfway"></span>
    <span class="pf-circle"></span>
  </div>`;

/* There is no stat-comparison row, and no aggregate anywhere on this screen.
   It compared five numbers per side — average rating, squad depth, formation,
   starting XI, average age — none of which is a player, on the one screen whose
   whole job is to show the two squads. `hidden` reveal mode needed a masking
   path through every one of them for the same reason it needs one for the
   opponent's column; that path went with them. */

/**
 * The formation a side actually confirmed.
 *
 * **Both sides come from the room, mine included.** Reading my own from
 * `getPickFormation()` — the pick board's local dropdown — looks equivalent and
 * is not: that value lives in memory and resets to the default on reload, so a
 * refresh on this screen redrew my own squad in a shape I never picked. The
 * server has held the confirmed one since `/picks-confirm`.
 */
const formationOf = (room, side) => normalizeFormation(room?.formations?.[side]);

// ── Entry point ──────────────────────────────────────────────

export function renderReadyBoard({ room, mySide, theirSide, matchLive, visible }) {
  const board = document.getElementById("draftReadyPhaseBoard");
  if (!board) return;

  board.hidden = !visible;
  if (!visible) return;

  const stage = matchLive ? "live" : "confirm";
  if (board.dataset.stage !== stage) board.dataset.stage = stage;

  const myReady = Boolean(room.matchReady?.[mySide]);
  const theirReady = Boolean(room.matchReady?.[theirSide]);
  const revealMode = normalizeRevealMode(room.config?.revealMode);

  const myPicks = room.picks?.[mySide] || [];
  const theirPicks = room.picks?.[theirSide] || [];
  const myFormation = formationOf(room, mySide);
  const theirFormation = formationOf(room, theirSide);

  renderTeams({
    room, mySide, theirSide, myPicks, theirPicks,
    myFormation, theirFormation, revealMode, myReady, theirReady,
  });
  if (matchLive) renderPostMatch();
  else renderConfirmFooter(room, theirSide, myReady, theirReady);
}

/* There is no page heading. The stage rail across the top of the room already
   reads START MATCH, so a title under it said it twice and pushed the squads —
   the only thing on this screen worth the space — below the fold. Which stage
   you are in is carried by the footer instead. */

/** Writes text only if it changed — a rewritten text node drops a selection. */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el && el.textContent !== text) el.textContent = text;
}

// ── The two squads ───────────────────────────────────────────

function renderTeams({ room, mySide, theirSide, myPicks, theirPicks,
                       myFormation, theirFormation, revealMode, myReady, theirReady }) {
  const host = document.getElementById("smTeams");
  if (!host) return;

  const hidden = revealMode === REVEAL_MODE_HIDDEN;
  const ids = (picks) => picks.map((p) => (p ? String(p.id) : "-")).join(",");

  /* Their ids and their formation stay out of the key under `hidden`: the key
     is written to a `data-` attribute, so putting them there would publish in
     the DOM exactly what this column is refusing to draw. Both names are in it
     because a name can arrive after the first paint — the old key left them
     out and the column kept saying "Opponent" for the rest of the match. */
  const key = [
    ids(myPicks),
    hidden ? "" : ids(theirPicks),
    myFormation,
    hidden ? "" : theirFormation,
    room[mySide]?.username || "",
    room[theirSide]?.username || "",
    revealMode,
    mySide,
    myReady ? "1" : "0",
    theirReady ? "1" : "0",
  ].join("|");
  if (host.dataset.teamsKey === key) return;
  host.dataset.teamsKey = key;

  /* All three reveal modes mean here what they meant during the draft.
     Revealing at Start Match would make the lobby setting a draft-only
     promise. */
  const theirColumn = hidden
    ? hiddenColumnHtml(room[theirSide]?.username, theirReady)
    : teamColumnHtml({
        name: room[theirSide]?.username || "Opponent",
        role: "OPPONENT",
        picks: theirPicks,
        formation: theirFormation,
        ready: theirReady,
        isMe: false,
        blurred: revealMode === REVEAL_MODE_BLUR,
      });

  host.innerHTML =
    teamColumnHtml({
      name: room[mySide]?.username || "You",
      role: "YOU",
      picks: myPicks,
      formation: myFormation,
      ready: myReady,
      isMe: true,
      blurred: false,
    }) +
    `<div class="sm-vs" aria-hidden="true"><span>VS</span></div>` +
    theirColumn;
}

const readyChipHtml = (ready) => `
  <span class="sm-chip ${ready ? "is-ready" : "is-waiting"}">
    <span class="sm-chip-mark" aria-hidden="true">${ready ? "✓" : "•"}</span>${ready ? "READY" : "NOT READY"}
  </span>`;

function teamColumnHtml({ name, role, picks, formation, ready, isMe, blurred }) {
  const lineup = picks.slice(0, LINEUP_SIZE);
  // `picks` is slot-addressed, so the holes go before anything counts.
  const bench = filledPicks(picks.slice(LINEUP_SIZE));
  const slotMap = buildOrderedSlotMap(lineup);

  const rows = getFormationLayout(formation)
    .map((row) => {
      const cells = row
        .map(({ slot, pos }) =>
          slotMap[slot]
            ? playerCardHtml(slotMap[slot], STATIC_CARD)
            : `<div class="sm-slot-empty"><span>${escapeHtml(pos)}</span></div>`)
        .join("");
      return `<div class="sm-row">${cells}</div>`;
    })
    .join("");

  /* Only the squad is blurred, never the head: the name and the READY chip are
     what `blur` mode still promises you. `aria-hidden` for the same reason as
     the pick board — a blur a screen reader reads straight through is not a
     blur. */
  return `
    <section class="sm-team ${isMe ? "is-me" : "is-opp"}">
      <header class="sm-team-head">
        <div class="sm-team-id">
          <h3 class="sm-team-name">${escapeHtml(name)}</h3>
          <p class="sm-team-role">${escapeHtml(role)} · ${escapeHtml(formation)}</p>
        </div>
        ${readyChipHtml(ready)}
      </header>
      <div class="sm-squad${blurred ? " is-concealed" : ""}"${blurred ? ' aria-hidden="true"' : ""}>
        <div class="sm-pitch pitch-field">
          ${PITCH_MARKS_HTML}
          <div class="sm-pitch-rows">${rows}</div>
        </div>
        ${benchHtml(bench)}
      </div>
    </section>`;
}

function benchHtml(bench) {
  return `
    <div class="sm-bench">
      <div class="sm-bench-head">
        <span>BENCH · ${bench.length}</span>
      </div>
      ${bench.length
        ? `<div class="sm-bench-strip">${bench.map((p) => playerCardHtml(p, STATIC_CARD)).join("")}</div>`
        : `<p class="sm-bench-empty">No substitutes picked.</p>`}
    </div>`;
}

function hiddenColumnHtml(name, ready) {
  return `
    <section class="sm-team is-opp is-hidden">
      <header class="sm-team-head">
        <div class="sm-team-id">
          <h3 class="sm-team-name">${escapeHtml(name || "Opponent")}</h3>
          <p class="sm-team-role">OPPONENT</p>
        </div>
        ${readyChipHtml(ready)}
      </header>
      <p class="sm-hidden-msg">Picks hidden — this room was set to reveal nothing.</p>
    </section>`;
}

// ── Footer, confirm stage ────────────────────────────────────

function renderConfirmFooter(room, theirSide, myReady, theirReady) {
  const btn = document.getElementById("draftReadyBtn");
  if (btn) {
    /* The label and the look both have to move. The old button toggled
       `btn--ghost`, which `.sm-ready-btn` overrode on cascade order, so
       pressing READY changed the word and nothing else. `data-ready` is read by
       `ready.css` and cannot lose that fight. */
    const label = myReady ? "READY ✓ · UNDO" : "READY";
    if (btn.textContent !== label) btn.textContent = label;
    btn.dataset.ready = myReady ? "1" : "0";
    btn.setAttribute("aria-pressed", myReady ? "true" : "false");
  }

  const them = room[theirSide]?.username || (theirSide === "host" ? "Host" : "Guest");
  setText("smReadyHint",
    myReady && theirReady ? "Both sides ready."
    : myReady ? `Waiting for ${them}…`
    : theirReady ? `${them} is ready and waiting for you.`
    : "Press READY once your squad is in the game.");
}
