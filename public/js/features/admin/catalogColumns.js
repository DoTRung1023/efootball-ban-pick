/* ============================================================
   CATALOG — which columns the table draws

   Two are fixed: the row number, and the player's name. A table you can hide
   the name from is a list of numbers, and the row number is what makes a
   paginated view legible at all. Everything else is optional, and **the choice
   belongs to the admin account, not to the browser**: it is stored server-side
   under `user_settings.catalogColumns` and read back when the console session
   opens, so the same columns are there on the next sign-in and on a different
   machine. It lived in `sessionStorage` before, which made "my columns" a
   property of one page load.

   The selection in memory is still the authority *during* a session — a write
   that fails leaves the table as chosen rather than snapping back — so the
   server is where it is saved, not where it is read from on every render.

   `field` is the key the API returns, and `csv` is the header the export
   writes; one row here therefore describes the column everywhere it appears.
   ============================================================ */

import { apiFetch, apiSend } from "./adminApi.js";

const SETTING_KEY = "catalogColumns";
/* Toggling four columns is four clicks and one write. The panel stays open
   while you pick, so the debounce is generous. */
const SAVE_DEBOUNCE_MS = 500;

/** `render` receives the raw value and the whole row; it returns cell HTML. */
export const CATALOG_COLUMNS = [
  { key: "rank",          label: "#",             csv: null,            fixed: true },
  { key: "name",          label: "PLAYER",        csv: "name",          fixed: true },
  { key: "position",      label: "POS",           csv: "position",      on: true },
  { key: "overall",       label: "OVR",           csv: "overall",       on: true },
  { key: "overall_max",   label: "MAX",           csv: "overall_max",   on: true },
  { key: "card_type",     label: "CARD TYPE",     csv: "card_type",     on: true },
  { key: "club",          label: "CLUB",          csv: "club",          on: true },
  { key: "id",            label: "PESDB ID",      csv: "pesdb_id",      on: true },
  { key: "league",        label: "LEAGUE",        csv: "league" },
  { key: "nationality",   label: "NATIONALITY",   csv: "nationality" },
  { key: "region",        label: "REGION",        csv: "region" },
  { key: "foot",          label: "FOOT",          csv: "foot" },
  { key: "playing_style", label: "PLAYING STYLE", csv: "playing_style" },
  { key: "height",        label: "HEIGHT",        csv: "height" },
  { key: "weight",        label: "WEIGHT",        csv: "weight" },
  { key: "age",           label: "AGE",           csv: "age" },
];

const FIXED = CATALOG_COLUMNS.filter((c) => c.fixed).map((c) => c.key);
const DEFAULT_ON = CATALOG_COLUMNS.filter((c) => c.fixed || c.on).map((c) => c.key);

/** Whether a key names a column that still exists — a stored selection from an
    older build must not resurrect a column this one has dropped. */
const known = (key) => CATALOG_COLUMNS.some((c) => c.key === key);

let selected = new Set(DEFAULT_ON);
let saveTimer = null;

/**
 * Reads this admin's stored columns and applies them.
 *
 * Called once, after the console session opens and **before** the first render,
 * so the CATALOG tab never shows the default columns and then swaps. A failure
 * is silent on purpose: the defaults are a working table, and a dashboard that
 * opens with an error about a view preference is worse than one that opens.
 *
 * Returns whether anything changed, so the caller knows if the column chooser
 * it already built needs rebuilding.
 */
export async function loadColumnPrefs() {
  let stored;
  try {
    const { preferences } = await apiFetch("/api/admin/preferences");
    stored = preferences?.[SETTING_KEY];
  } catch {
    return false;
  }
  if (!Array.isArray(stored)) return false;

  /* A stored selection from an older build must not resurrect a column this
     one has dropped, and one that filters down to nothing is not a selection —
     it would leave a table of two fixed columns and no way to tell why. */
  const picked = stored.filter(known);
  if (!picked.length) return false;

  const before = [...selected].sort().join();
  selected = new Set(picked);
  FIXED.forEach((key) => selected.add(key));
  return [...selected].sort().join() !== before;
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    /* Fire and forget. `apiSend` rejects on a failed write and there is nothing
       useful to say about it here — the columns on screen are already what was
       asked for, and the next toggle tries again. */
    apiSend("/api/admin/preferences", "PUT", {
      key: SETTING_KEY,
      value: [...selected],
    }).catch(() => {});
  }, SAVE_DEBOUNCE_MS);
}

/** The visible columns, always in the order declared above. */
export function visibleColumns() {
  return CATALOG_COLUMNS.filter((c) => selected.has(c.key));
}

export function isColumnOn(key) {
  return selected.has(key);
}

/** Toggling a fixed column is a no-op rather than an error — the panel does not
    offer it, and nothing else should have to check first. */
export function toggleColumn(key) {
  if (FIXED.includes(key) || !known(key)) return;
  if (selected.has(key)) selected.delete(key);
  else selected.add(key);
  persist();
}

export function resetColumns() {
  selected = new Set(DEFAULT_ON);
  persist();
}
