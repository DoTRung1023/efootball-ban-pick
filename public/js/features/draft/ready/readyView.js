/**
 * Start Match — the last screen of a room, and the **only** screen after the
 * picks are in.
 *
 * It has four stages and it does not navigate between them; `data-stage` on the
 * board is the whole difference, and the two squads never move:
 *
 *   confirm  READY         — my squad is set up in the game   ("await-ready")
 *   start    START MATCH   — I have kicked off                ("await-start")
 *   live     FINISH MATCH  — the match is being played        ("live")
 *   post     rematch / new match                              ("done")
 *
 * The first three are the same footer with a different row of `matchSteps.js`
 * behind it; only the last one is different markup. Each of the three needs
 * **both** sides before the room moves on, so the button you are looking at is
 * always the step the room is actually on — never one you pressed ahead.
 *
 * There used to be a separate `#viewDone` screen for the last stage, which
 * re-listed as plain text the same two squads this screen already draws as
 * cards. Swapping the footer says the same thing without making the user leave
 * the page they were looking at.
 *
 * Every DOM write in here is behind a state key, because `renderDraftUi` calls
 * this on every presence poll (~2 Hz).
 */

import { escapeHtml } from '@/features/draft/utils.js';
import {
  buildOrderedSlotMap,
  filledPicks,
  getFormationLayout,
  normalizeFormation,
  LINEUP_SIZE,
} from '@/features/draft/players.js';
import { playerCardHtml } from '@/features/draft/playerCards.js';
import { stepForStatus } from './matchSteps.js';
import { renderPostMatch } from './postMatch.js';

import { icon } from '@/shared/icons/icon.js';
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
   whole job is to show the two squads. */

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

export function renderReadyBoard({ room, mySide, theirSide, visible }) {
  const board = document.getElementById("draftReadyPhaseBoard");
  if (!board) return;

  board.hidden = !visible;
  if (!visible) return;

  /* The room status is the only thing that decides which stage is up. It is the
     server's answer and both clients read the same one, so the two screens
     cannot disagree about which handshake is open. */
  const step = stepForStatus(room.status);
  const stage = step ? step.stage : "post";
  if (board.dataset.stage !== stage) board.dataset.stage = stage;

  /* Each side's answer to whichever step is open — the chip on their team head,
     and who the hint says we are waiting for. Once the match is over there is
     no step left, and both chips read FINISHED. */
  const mine = step ? Boolean(room[step.flag]?.[mySide]) : true;
  const theirs = step ? Boolean(room[step.flag]?.[theirSide]) : true;

  const myPicks = room.picks?.[mySide] || [];
  const theirPicks = room.picks?.[theirSide] || [];
  const myFormation = formationOf(room, mySide);
  const theirFormation = formationOf(room, theirSide);

  renderTeams({
    room, mySide, theirSide, myPicks, theirPicks,
    myFormation, theirFormation, step, mine, theirs,
  });
  if (step) renderStepFooter(step, room, theirSide, mine, theirs);
  else renderPostMatch();
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
                       myFormation, theirFormation, step, mine, theirs }) {
  const host = document.getElementById("smTeams");
  if (!host) return;

  const ids = (picks) => picks.map((p) => (p ? String(p.id) : "-")).join(",");

  /**
   * **Both squads are drawn in full, whatever `revealMode` was.** `renderTeams`
   * does not read it, and it is out of the diff key with it.
   *
   * Concealment is a *drafting* mechanic: it exists so neither side can
   * counter-pick the other, and by the time this screen is up both lineups are
   * confirmed and locked. This is the screen where you set the match up
   * **against the squad you are about to play**, so withholding it here makes
   * the lobby setting a promise about the whole room rather than about the
   * draft, and leaves a player pressing READY at an empty column.
   *
   * This has been round twice. It was concealed for one revision — `hidden`
   * swapping the opponent's column for a locked panel, `blur` blurring their
   * cards, both lifting at `done` — and taken out again. If it comes back a
   * third time, the thing that wants changing is the **lobby copy**, which is
   * what set the expectation that the mode covers the whole room.
   *
   * Ban order has never had anything to do with it: `renderTeams` does not read
   * `banOrder` either, so alternating and simultaneous behave identically here.
   */

  /* Both names are in the key because a name can arrive after the first paint —
     the old key left them out and the column kept saying "Opponent" for the
     rest of the match. */
  const key = [
    ids(myPicks),
    ids(theirPicks),
    myFormation,
    theirFormation,
    room[mySide]?.username || "",
    room[theirSide]?.username || "",
    mySide,
    step?.stage || "post",
    mine ? "1" : "0",
    theirs ? "1" : "0",
  ].join("|");
  if (host.dataset.teamsKey === key) return;
  host.dataset.teamsKey = key;

  const column = (side, name, role, picks, formation, done, isMe) => teamColumnHtml({
    name: room[side]?.username || name,
    role,
    picks,
    formation,
    step,
    done,
    isMe,
  });

  host.innerHTML =
    column(mySide, "You", "YOU", myPicks, myFormation, mine, true)
    + `<div class="sm-vs" aria-hidden="true"><span>VS</span></div>`
    + column(theirSide, "Opponent", "OPPONENT", theirPicks, theirFormation, theirs, false);
}

/* The chip answers "where is this player up to", so its words come from the
   step that is open — READY / NOT READY while squads are being set up, PLAYING /
   FINISHED once the match is on. With no step left the match is over and there
   is nothing to be waiting for. */
const stepChipHtml = (step, done) => {
  const label = step ? (done ? step.chip.on : step.chip.off) : "FINISHED";
  return `
  <span class="sm-chip ${done ? "is-ready" : "is-waiting"}">
    <span class="sm-chip-mark" aria-hidden="true">${done ? icon("check", { size: 11 }) : icon("dot", { size: 7 })}</span>${label}
  </span>`;
};

/**
 * One side's column. `conceal` is `""`, `blur` or `hidden`, and is only ever
 * non-empty for the *opponent's* column — see `renderTeams`.
 *
 * `hidden` draws no squad at all rather than an empty pitch: an empty pitch is
 * a lineup with nobody in it, which is a different thing from one you are not
 * being shown. It takes the formation off the role line with it, because the
 * shape is most of what the mode is withholding.
 */
/**
 * The name, the subtitle and the ready/playing chip. `subtitle` rather than
 * `formation` so the caller decides what belongs next to the role — there is
 * one caller today and it passes `ROLE · formation`.
 */
function teamHeadHtml({ name, subtitle, step, done }) {
  return `
      <header class="sm-team-head">
        <div class="sm-team-id">
          <h3 class="sm-team-name">${escapeHtml(name)}</h3>
          <p class="sm-team-role">${escapeHtml(subtitle)}</p>
        </div>
        ${stepChipHtml(step, done)}
      </header>`;
}

/** The pitch rows for one formation, empty slots labelled with their position. */
function pitchRowsHtml(picks, formation) {
  const slotMap = buildOrderedSlotMap(picks.slice(0, LINEUP_SIZE));
  return getFormationLayout(formation)
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
}

/** One side's column: who they are, their pitch, and their bench. */
function teamColumnHtml({ name, role, picks, formation, step, done, isMe }) {
  // `picks` is slot-addressed, so the holes go before anything counts.
  const bench = filledPicks(picks.slice(LINEUP_SIZE));

  return `
    <section class="sm-team ${isMe ? "is-me" : "is-opp"}">
      ${teamHeadHtml({ name, subtitle: `${role} · ${formation}`, step, done })}
      <div class="sm-squad">
        <div class="sm-pitch pitch-field">
          ${PITCH_MARKS_HTML}
          <div class="sm-pitch-rows">${pitchRowsHtml(picks, formation)}</div>
        </div>
        ${benchHtml(bench)}
      </div>
    </section>`;
}

function benchHtml(bench) {
  return `
    <div class="sm-bench">
      <div class="sm-bench-head">
        <span>BENCH</span>
      </div>
      ${bench.length
        ? `<div class="sm-bench-strip">${bench.map((p) => playerCardHtml(p, STATIC_CARD)).join("")}</div>`
        : `<p class="sm-bench-empty">No substitutes picked.</p>`}
    </div>`;
}

// ── Footer, while a handshake is open ────────────────────────

/**
 * One footer for all three steps: a button and a line telling you what it is
 * waiting on. Everything that differs is a field on `step`.
 */
function renderStepFooter(step, room, theirSide, mine, theirs) {
  const btn = document.getElementById("draftStepBtn");
  if (btn) {
    /* The label and the look both have to move. The button used to toggle
       `btn--ghost` from JS, which `.sm-step-btn` overrode on cascade order, so
       pressing it changed the word and kept its accent — you could not tell at
       a glance whether you had answered. `data-pressed` is read by `ready.css`
       on the same selector and cannot lose that fight. */
    /* Two lines once answered: the state you are in over the thing the button
       does. It used to read `READY ✓ · UNDO` on one line, which said your state
       and the button's action in the same breath — so the control looked like
       it was labelled with its own state, and "UNDO" read as part of the word
       READY rather than as the thing pressing it would do.

       The button is only ever the action. Unpressed that is the step itself
       (READY / START MATCH / FINISH MATCH); pressed it is always UNDO, and the
       state moves above it in smaller type.

       The state word is `chip.on` from the step table, already written for the
       team-head chips — READY / STARTING / FINISHED — so all three steps get
       this without a fourth field or a branch.

       UNDO is right for all three even though `finish` is `undoable: false` on
       the server: that flag only blocks walking the room back once *both*
       sides have answered, and this button is only on screen while yours is
       the answer being waited on.

       The label is markup, so `textContent` can no longer be the idempotence
       guard — `innerHTML` round-trips through the parser and would not compare
       equal to what we wrote. `dataset.label` holds the string we last set. */
    const label = mine
      ? `<span class="sm-step-state">${icon("check", { size: 10 })}${step.chip.on}</span>`
        + `<span class="sm-step-action">UNDO</span>`
      : `<span class="sm-step-action">${step.label}</span>`;
    if (btn.dataset.label !== label) {
      btn.innerHTML = label;
      btn.dataset.label = label;
    }
    btn.dataset.pressed = mine ? "1" : "0";
    btn.setAttribute("aria-pressed", mine ? "true" : "false");
  }

  const them = room[theirSide]?.username || (theirSide === "host" ? "Host" : "Guest");
  setText("smStepHint",
    mine ? step.hint.waiting(them)
    : theirs ? step.hint.prompted(them)
    : step.hint.idle(them));
}
