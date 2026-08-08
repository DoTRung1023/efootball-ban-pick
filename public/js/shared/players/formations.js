/* ============================================================
   Formations — the pitch layout table

   One table, two features: the game-plan pitch on the home page and the pick
   pitch in the draft room. Both render the same four rows top-down
   (attack → midfield → defence → GK) into the same row ids, and both address
   players by lineup slot 1–11, so a formation added here shows up in both.

   The row ids and slot numbers are load-bearing: `pitchRow*` are real element
   ids in `home.html` / `room.html`, and slots 1–11 are the LINEUP half of
   `game_plan_players` (12–23 are SUB).
   ============================================================ */

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

/** Any unknown or blank value falls back to `DEFAULT_FORMATION`. */
export function normalizeFormation(f) {
  const s = String(f || "").trim();
  return FORMATION_LAYOUTS[s] ? s : DEFAULT_FORMATION;
}

/** The row list to render, guaranteed non-null. */
export function getFormationLayout(formation) {
  return FORMATION_LAYOUTS[normalizeFormation(formation)] || FORMATION_LAYOUTS[DEFAULT_FORMATION];
}
