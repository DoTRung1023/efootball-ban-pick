// ── Colours ──────────────────────────────────────────────────────
export const GREEN = "#2ccf75";
export const RED = "#ff4444";

// ── Draft config ─────────────────────────────────────────────────
export const FIXED_PICKS_PER_SIDE = 23;
export const DEFAULT_BAN_DURATION_SECONDS = 120;
export const MIN_BAN_DURATION_SECONDS = 5;
export const MAX_BAN_DURATION_SECONDS = 900;
export const DEFAULT_PICK_DURATION_SECONDS = 300;
export const MIN_PICK_DURATION_SECONDS = 5;
export const MAX_PICK_DURATION_SECONDS = 1200;
export const LOBBY_PRESENCE_POLL_MS = 500;
/* Three rungs of concealment, in order: see everything → see the shape but not
   who → see nothing but whether they are done. Kept in step with
   `src/features/rooms/config.js`. */
export const REVEAL_MODE_INSTANT = "instant";
export const REVEAL_MODE_BLUR = "blur";
export const REVEAL_MODE_HIDDEN = "hidden";

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
  { key: "overall",      label: "Overall",       type: "range", minPlaceholder: "", maxPlaceholder: "" },
  { key: "overallMax",   label: "Overall max",   type: "range", minPlaceholder: "", maxPlaceholder: "" },
  { key: "club",         label: "Club",          placeholder: "Barcelona",       type: "text" },
  { key: "league",       label: "League",        placeholder: "La Liga",         type: "text" },
  { key: "nationality",  label: "Nationality",   placeholder: "France",          type: "text" },
  { key: "height",       label: "Height",        type: "range", minPlaceholder: "", maxPlaceholder: "" },
  { key: "weight",       label: "Weight",        type: "range", minPlaceholder: "", maxPlaceholder: "" },
  { key: "age",          label: "Age",           type: "range", minPlaceholder: "", maxPlaceholder: "" },
  { key: "cardType",     label: "Card type",     placeholder: "Epic,Highlight",  type: "text" },
  { key: "region",       label: "Region",        placeholder: "Europe",          type: "text" },
  { key: "foot",         label: "Foot",          placeholder: "Left,Right",      type: "text" },
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

// Mutable: populated at runtime by fetchFilterOptions() in room.js.
// Use .length = 0 + push() to update — never reassign the binding.
export const CARD_TYPE_OPTIONS = [];
export const REGION_OPTIONS = [];
export const PLAYING_STYLE_OPTIONS = [];
