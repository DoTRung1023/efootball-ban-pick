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
export const ALLOWANCE_CATEGORY_DEFS = [
  { key: "position",     label: "Position",      placeholder: "CF,SS,RWF",      type: "text" },
  { key: "overall",      label: "Overall",       type: "range", unit: "Rating",  minPlaceholder: "", maxPlaceholder: "" },
  { key: "overallMax",   label: "Overall max",   type: "range", unit: "Rating",  minPlaceholder: "", maxPlaceholder: "" },
  { key: "club",         label: "Club",          placeholder: "Barcelona",       type: "text" },
  { key: "league",       label: "League",        placeholder: "La Liga",         type: "text" },
  { key: "nationality",  label: "Nationality",   placeholder: "France",          type: "text" },
  { key: "height",       label: "Height",        type: "range", unit: "cm",      minPlaceholder: "", maxPlaceholder: "" },
  { key: "weight",       label: "Weight",        type: "range", unit: "kg",      minPlaceholder: "", maxPlaceholder: "" },
  { key: "age",          label: "Age",           type: "range", unit: "Years",   minPlaceholder: "", maxPlaceholder: "" },
  { key: "cardType",     label: "Card type",     placeholder: "Epic,Highlight",  type: "text" },
  { key: "region",       label: "Region",        placeholder: "Europe",          type: "text" },
  { key: "foot",         label: "Foot",          placeholder: "Left,Right",      type: "text", unit: "Side" },
  { key: "playingStyle", label: "Playing style", placeholder: "Goal Poacher",    type: "text" },
];
export const ALLOWANCE_DEF_MAP = new Map(ALLOWANCE_CATEGORY_DEFS.map((d) => [d.key, d]));
export const ALLOWANCE_RANGE_KEYS = new Set(["overall", "overallMax", "height", "weight", "age"]);
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
export const TEXT_ALLOWANCE_LIST_KEYS = new Set(["club", "league", "nationality"]);

/**
 * Categories whose player count is a single min/max pair rather than a cap per
 * value. Everything else (position, club, league, nationality, card type,
 * region, playing style) caps each selected value on its own.
 *
 * These six had **no count control at all** and were skipped by the pick-time
 * check, so setting "Age 30-40" changed nothing about the draft.
 */
export const ALLOWANCE_SIMPLE_COUNT_KEYS = new Set([
  "overall", "overallMax", "height", "weight", "age", "foot",
]);

// Mutable: populated at runtime by fetchFilterOptions() in room.js.
// Use .length = 0 + push() to update — never reassign the binding.
export const CARD_TYPE_OPTIONS = [];
export const REGION_OPTIONS = [];
export const PLAYING_STYLE_OPTIONS = [];
