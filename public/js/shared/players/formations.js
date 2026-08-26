/* ============================================================
   Formations — the pitch layout table

   One table, two features: the game-plan pitch on the home page and the pick
   pitch in the draft room. Both render the same rows top-down (attack → GK) and
   both address players by lineup slot 1–11, so a formation added here shows up
   in both.

   **The fifteen entries below are eFootball's own preset list, in its own
   order.** They used to be nine invented four-line shapes (4-5-1, 3-6-1, 5-2-3
   …), which meant the app could not express the formation someone was actually
   about to play: the game's list is written with one digit per *line*, and a
   line is a row on the pitch, so 4-2-1-3 is five rows and there is no way to
   fold it into four without lying about where the AMF stands.

   ── How to read the table ────────────────────────────────────
   Each formation is its rows **front to back** — the order they are drawn, with
   the attack at the top — and each row is its positions **left to right**. The
   position names are the game's own (GK · CB · LB · RB · DMF · CMF · LMF · RMF ·
   AMF · LWF · RWF · CF), so an empty box names the job it is waiting for rather
   than the generic "MID" four-row pitches had to settle for.

   Because the notation's digits *are* the lines, the row shapes fall straight
   out of the name and the positions follow from the row's depth and width: a
   flat three in 4-3-3 is three CMFs, and the DMF only appears where the name
   breaks it out into its own line (4-1-4-1, 4-2-3-1 …). That is also why 4-3-3
   and 4-1-2-3 are different entries rather than two spellings of one shape.

   ── Slot numbering ───────────────────────────────────────────
   Slots are assigned **from the back**: the GK is 1, then each row up the pitch
   continues the count left to right. That is the numbering the four-row table
   used, so the formations that carry over (4-3-3, 4-4-2, 3-4-3, 5-3-2) keep the
   meaning of every slot already stored against them.

   Slots 1–11 are the LINEUP half of `game_plan_players`; 12–23 are SUB and
   belong to no formation — the bench is a flat strip in both features.

   The names here are the whitelist the server enforces in
   `src/features/gamePlans/routes.js`; the two lists must stay in step.
   ============================================================ */

export const DEFAULT_FORMATION = "4-3-3";

/** Where the lineup half of the slot range ends. Slots 1–11 are the eleven a
    formation lays out; everything above is bench, which belongs to no formation.
    Declared here because this is the module that owns the numbering — it was a
    bare `11` in `pickView.js` and again in `readyView.js`. */
export const LINEUP_SIZE = 11;

/** Slots 12-23 are substitutes on both pitches. */
export const BENCH_ROW_LABEL = "SUB";

/** Rows front → back, positions left → right. See the slot-numbering note. */
const FORMATION_ROWS = {
  "4-4-2":   ["CF CF",      "LMF CMF CMF RMF",                    "LB CB CB RB",    "GK"],
  "4-3-3":   ["LWF CF RWF", "CMF CMF CMF",                        "LB CB CB RB",    "GK"],
  "4-3-2-1": ["CF",         "AMF AMF",         "CMF CMF CMF",     "LB CB CB RB",    "GK"],
  "4-3-1-2": ["CF CF",      "AMF",             "CMF CMF CMF",     "LB CB CB RB",    "GK"],
  "4-2-3-1": ["CF",         "LMF AMF RMF",     "DMF DMF",         "LB CB CB RB",    "GK"],
  "4-2-1-3": ["LWF CF RWF", "AMF",             "DMF DMF",         "LB CB CB RB",    "GK"],
  "4-1-4-1": ["CF",         "LMF CMF CMF RMF", "DMF",             "LB CB CB RB",    "GK"],
  "4-1-2-3": ["LWF CF RWF", "CMF CMF",         "DMF",             "LB CB CB RB",    "GK"],
  "3-4-3":   ["LWF CF RWF", "LMF CMF CMF RMF",                    "CB CB CB",       "GK"],
  "3-2-4-1": ["CF",         "LMF AMF AMF RMF", "DMF DMF",         "CB CB CB",       "GK"],
  "3-2-3-2": ["CF CF",      "LMF AMF RMF",     "DMF DMF",         "CB CB CB",       "GK"],
  "3-1-4-2": ["CF CF",      "LMF CMF CMF RMF", "DMF",             "CB CB CB",       "GK"],
  "5-3-2":   ["CF CF",      "CMF CMF CMF",                        "LB CB CB CB RB", "GK"],
  "5-2-2-1": ["CF",         "AMF AMF",         "CMF CMF",         "LB CB CB CB RB", "GK"],
  "5-2-1-2": ["CF CF",      "AMF",             "CMF CMF",         "LB CB CB CB RB", "GK"],
};

/**
 * The table above, expanded once at module load into what both pitches render:
 * `{ [formation]: Row[] }`, a row being `[{ slot, pos }]` front to back.
 *
 * Numbering runs back to front, so the rows are walked in reverse and the result
 * flipped — see the slot-numbering note above for why that order is load-bearing.
 */
export const FORMATION_LAYOUTS = Object.fromEntries(
  Object.entries(FORMATION_ROWS).map(([name, rows]) => {
    let slot = 0;
    const numbered = [...rows]
      .reverse()
      .map((row) => row.split(" ").map((pos) => ({ slot: (slot += 1), pos })));
    return [name, numbered.reverse()];
  }),
);

/** Any unknown or blank value falls back to `DEFAULT_FORMATION`. */
export function normalizeFormation(f) {
  const s = String(f || "").trim();
  return FORMATION_LAYOUTS[s] ? s : DEFAULT_FORMATION;
}

/** The row list to render, guaranteed non-null. */
export function getFormationLayout(formation) {
  return FORMATION_LAYOUTS[normalizeFormation(formation)] || FORMATION_LAYOUTS[DEFAULT_FORMATION];
}

