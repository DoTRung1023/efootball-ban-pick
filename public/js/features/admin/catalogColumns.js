/* ============================================================
   CATALOG — which columns the table draws

   Two are fixed: the row number, and the player's name. A table you can hide
   the name from is a list of numbers, and the row number is what makes a
   paginated view legible at all. Everything else is optional, and the choice
   is remembered for the tab's lifetime in sessionStorage — the same store the
   console token uses, so it survives a reload and dies with the tab.

   `field` is the key the API returns, and `csv` is the header the export
   writes; one row here therefore describes the column everywhere it appears.
   ============================================================ */

const STORE = "efb_console_catalog_cols";

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

function read() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORE) || "null");
    if (!Array.isArray(raw)) return null;
    const picked = raw.filter(known);
    return picked.length ? picked : null;
  } catch {
    return null;
  }
}

let selected = new Set(read() || DEFAULT_ON);
/* The fixed ones are not negotiable, including against a hand-edited store. */
FIXED.forEach((key) => selected.add(key));

function persist() {
  try {
    sessionStorage.setItem(STORE, JSON.stringify([...selected]));
  } catch {
    /* private mode, or a full quota — the choice just does not outlive the page */
  }
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
