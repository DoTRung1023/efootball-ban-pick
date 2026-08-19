// ── Draft config ─────────────────────────────────────────────────
export const FIXED_PICKS_PER_SIDE = 23;
/**
 * **0 means unlimited**, and it is the only value outside the ranges below that
 * survives normalisation. The host can turn either clock off from the lobby;
 * that phase then runs with no deadline and ends when both players confirm,
 * which is the only other way a phase has ever ended.
 *
 * A sentinel rather than `null` because the value round-trips through an
 * `<input type="number">`, a JSON body and a `Number()` on the way back, and
 * `null` comes out of that chain as 0 anyway. Naming it stops the 0 reading as
 * "no time at all" at its call sites. Kept in step with
 * `src/features/rooms/config.js`.
 */
export const UNLIMITED_DURATION_SEC = 0;
export const DEFAULT_BAN_DURATION_SECONDS = 120;
export const MIN_BAN_DURATION_SECONDS = 5;
export const MAX_BAN_DURATION_SECONDS = 900;
export const DEFAULT_PICK_DURATION_SECONDS = 300;
export const MIN_PICK_DURATION_SECONDS = 5;
export const MAX_PICK_DURATION_SECONDS = 1200;
export const LOBBY_PRESENCE_POLL_MS = 500;
/* How stale the opponent's heartbeat may get before their badge stops saying
   "connected". These drive `opponentLiveness` in `engine/presence.js` and
   **expire nobody** — the server has no TTL and must not grow one, see
   `room/presence-and-reconnect.md`.

   `GONE_MS` is the number the deleted server TTL got wrong. Browsers throttle a
   background tab's timers to roughly once a minute, so anything near the old
   12–30 s reads a tabbed-away player as departed; 120 s clears that floor with
   margin. The `hidden` flag on the heartbeat covers the same ground from the
   other side — a stale beat that announced itself as backgrounded is "away",
   not "reconnecting". */
export const OPPONENT_CONNECTED_MS = 15000;
export const OPPONENT_GONE_MS = 120000;
/* Three rungs of concealment, in order: see everything → see the shape but not
   who → see nothing but whether they are done. Kept in step with
   `src/features/rooms/config.js`. */
export const REVEAL_MODE_INSTANT = "instant";
export const REVEAL_MODE_BLUR = "blur";
export const REVEAL_MODE_HIDDEN = "hidden";

// ── Room status ───────────────────────────────────────────────────
/* The server's `ROOM_STATUS` values, as the client needs to read them off a
   snapshot. Kept in step with `src/features/rooms/store.js`, which is where the
   transitions between them live — this side only ever compares.

   The last four are all the same screen (Start Match); the status says which of
   its three handshakes is open. `LIVE` means *this match is being played*, not
   "the room is alive". */
export const ROOM_STATUS_DRAFTING = "drafting";
export const ROOM_STATUS_AWAIT_READY = "await-ready";
export const ROOM_STATUS_AWAIT_START = "await-start";
export const ROOM_STATUS_LIVE = "live";
export const ROOM_STATUS_DONE = "done";
/** The statuses that put Start Match on screen with a handshake still open. */
export const START_MATCH_STATUSES = [
  ROOM_STATUS_AWAIT_READY,
  ROOM_STATUS_AWAIT_START,
  ROOM_STATUS_LIVE,
];

// ── Image helpers ─────────────────────────────────────────────────
// Shared with the home bundle — see @/shared/players/playerMeta.js.
export { CARD_IMG, ANON_PLAYER_IMG } from "@/shared/players/playerMeta.js";

// ── Formations ────────────────────────────────────────────────────
// The table is shared with the home page's game-plan pitch — see
// @/shared/players/formations.js. Re-exported so room modules keep importing
// it from "./constants.js" as before.
export { DEFAULT_FORMATION, FORMATION_LAYOUTS } from "@/shared/players/formations.js";

// ── Allowance definitions ─────────────────────────────────────────
/**
 * A ban-setting category takes one of **four shapes**, and `shape` says which.
 * The shape decides both what picks its values and where the player counts hang
 * off them:
 *
 * - `range` — a numeric span (`"30,40"`) plus **one** Min/Max player pair for
 *   the category as a whole. The five measurable attributes, and the only
 *   shape whose counts are a bare number.
 * - `fixed` — a closed set with no picker at all: every option is listed, each
 *   with its own Min/Max. Foot, and only foot — two options fit in the row.
 * - `list` — an option list short enough to read whole (5 regions … 36
 *   leagues). The picker shows all of it and its search box **filters** rather
 *   than fetches, so finding an option beats scrolling to it.
 * - `search` — hundreds of options (693 clubs, 183 nationalities). The picker
 *   shows nothing until something is typed, then asks the server; a list that
 *   long is not a list, it is a scroll.
 *
 * `fixed`, `list` and `search` all carry their counts the same way — a Min and
 * a Max **per selected value**, stored as a `{value: count}` JSON map in both
 * `allowanceCaps` and `allowanceMins`. A value nobody added carries no rule.
 *
 * `unit` heads the value control on a `range` row and the option column on the
 * `fixed` one; the row title already carries the category name, so the heading
 * has to answer "min *what*?" instead of repeating it.
 */
export const ALLOWANCE_CATEGORY_DEFS = [
  { key: "position",     label: "Position",      shape: "list" },
  { key: "overall",      label: "Overall",       shape: "range",  unit: "Rating" },
  { key: "overallMax",   label: "Overall max",   shape: "range",  unit: "Rating" },
  { key: "club",         label: "Club",          shape: "search" },
  { key: "league",       label: "League",        shape: "list" },
  { key: "nationality",  label: "Nationality",   shape: "search" },
  { key: "height",       label: "Height",        shape: "range",  unit: "cm" },
  { key: "weight",       label: "Weight",        shape: "range",  unit: "kg" },
  { key: "age",          label: "Age",           shape: "range",  unit: "Years" },
  { key: "cardType",     label: "Card type",     shape: "list" },
  { key: "region",       label: "Region",        shape: "list" },
  { key: "foot",         label: "Foot",          shape: "fixed",  unit: "Side" },
  { key: "playingStyle", label: "Playing style", shape: "list" },
];
export const ALLOWANCE_DEF_MAP = new Map(ALLOWANCE_CATEGORY_DEFS.map((d) => [d.key, d]));

const keysWithShape = (shape) =>
  new Set(ALLOWANCE_CATEGORY_DEFS.filter((d) => d.shape === shape).map((d) => d.key));

/** One bare Min/Max for the whole category — the only shape that is not a map. */
export const ALLOWANCE_RANGE_KEYS = keysWithShape("range");
/** Everything else: a Min/Max per selected value. */
export const ALLOWANCE_VALUE_LIST_KEYS = new Set(
  ALLOWANCE_CATEGORY_DEFS.filter((d) => d.shape !== "range").map((d) => d.key),
);
/** Picker asks the server and shows nothing until it is typed into. */
export const ALLOWANCE_SEARCH_KEYS = keysWithShape("search");
/** No picker: every option is on the row from the moment it is added. */
export const ALLOWANCE_FIXED_LIST_KEYS = keysWithShape("fixed");

export const LEGACY_ALLOWANCE_KEY_MAP = {
  overallMin:    "overall",
  overallMaxMin: "overallMax",
  heightMin:     "height",
  weightMin:     "weight",
  ageMin:        "age",
};

// ── Player attribute options ──────────────────────────────────────
export const POSITION_OPTIONS = ["GK","CB","LB","RB","DMF","CMF","LMF","RMF","AMF","LWF","RWF","SS","CF"];
export const FOOT_OPTIONS = ["Left", "Right"];

// Mutable: populated at runtime by fetchFilterOptions() in room.js.
// Use .length = 0 + push() to update — never reassign the binding.
export const CARD_TYPE_OPTIONS = [];
export const REGION_OPTIONS = [];
export const PLAYING_STYLE_OPTIONS = [];
