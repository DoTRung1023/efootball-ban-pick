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
export const REVEAL_MODE_INSTANT = "instant";
export const REVEAL_MODE_HIDDEN = "hidden";

// ── Image helpers ─────────────────────────────────────────────────
// Shared with the home bundle — see ../shared/playerMeta.js.
export { CARD_IMG, ANON_PLAYER_IMG } from "../shared/playerMeta.js";

// ── Formations ────────────────────────────────────────────────────
export const DEFAULT_FORMATION = "4-3-3";
export const FORMATION_LAYOUTS = {
  "4-3-3": [
    { id: "pitchRowFwd", slots: [9, 10, 11] },
    { id: "pitchRowMid", slots: [6, 7, 8] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "4-4-2": [
    { id: "pitchRowFwd", slots: [10, 11] },
    { id: "pitchRowMid", slots: [6, 7, 8, 9] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "4-5-1": [
    { id: "pitchRowFwd", slots: [11] },
    { id: "pitchRowMid", slots: [6, 7, 8, 9, 10] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "3-6-1": [
    { id: "pitchRowFwd", slots: [11] },
    { id: "pitchRowMid", slots: [5, 6, 7, 8, 9, 10] },
    { id: "pitchRowDef", slots: [2, 3, 4] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "3-4-3": [
    { id: "pitchRowFwd", slots: [9, 10, 11] },
    { id: "pitchRowMid", slots: [5, 6, 7, 8] },
    { id: "pitchRowDef", slots: [2, 3, 4] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "3-5-2": [
    { id: "pitchRowFwd", slots: [10, 11] },
    { id: "pitchRowMid", slots: [5, 6, 7, 8, 9] },
    { id: "pitchRowDef", slots: [2, 3, 4] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "5-2-3": [
    { id: "pitchRowFwd", slots: [9, 10, 11] },
    { id: "pitchRowMid", slots: [7, 8] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5, 6] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "5-3-2": [
    { id: "pitchRowFwd", slots: [10, 11] },
    { id: "pitchRowMid", slots: [7, 8, 9] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5, 6] },
    { id: "pitchRowGk", slots: [1] },
  ],
  "5-4-1": [
    { id: "pitchRowFwd", slots: [11] },
    { id: "pitchRowMid", slots: [7, 8, 9, 10] },
    { id: "pitchRowDef", slots: [2, 3, 4, 5, 6] },
    { id: "pitchRowGk", slots: [1] },
  ],
};

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
