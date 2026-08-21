/**
 * Per-admin console preferences.
 *
 * One row per (account, setting), so a choice made in the console follows the
 * account rather than the browser it was made in. The CATALOG tab's column
 * selection is the first and so far only one: it used to live in
 * `sessionStorage` and die with the tab, which made "my columns" a property of
 * a page load.
 *
 * **The key is allow-listed and the value is shape-checked** before anything is
 * written. This is a JSON column reachable from a browser; without both, it is
 * a place for any admin to park arbitrary data of arbitrary size under their
 * own id. Neither check is about trust — an admin is trusted — they are about
 * the table staying a settings table.
 *
 * Reads and writes are always for `req.admin.uid`, never for an id in the body:
 * there is no legitimate reason for one admin to set another's columns. (Under
 * `ADMIN_CONSOLE_PASSWORD` a caller can open a session as any admin id anyway —
 * that is the shared-password trade documented in `adminSession.js`, and column
 * preferences are the least of what it reaches.)
 */

import db from "#lib/db.js";

/** Setting keys this endpoint will store, and how to check each one's value. */
const SETTINGS = {
  /* The CATALOG column selection: an ordered list of column keys. The client
     filters unknown keys on read, so this only has to bound the size and the
     shape — which columns exist is the client's table to know, and a server
     copy of it would be a second one to keep in step. */
  catalogColumns: (value) =>
    Array.isArray(value) &&
    value.length <= 64 &&
    value.every((v) => typeof v === "string" && v.length > 0 && v.length <= 40),
};

/** Creates the table if this database predates preferences. Same bargain as
    every other healer here: it runs on every boot and does nothing on all but
    one of them. */
export async function ensureUserSettingsTable() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS user_settings (
       user_id       INT UNSIGNED NOT NULL,
       setting_key   VARCHAR(64)  NOT NULL,
       setting_value JSON         NOT NULL,
       updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (user_id, setting_key),
       CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id) REFERENCES users (id)
         ON DELETE CASCADE ON UPDATE CASCADE
     ) ENGINE=InnoDB`,
  );
}

/** Every stored setting for one account, as `{ key: value }`. */
export async function readPreferences(userId) {
  const [rows] = await db.query(
    "SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?",
    [Number(userId)],
  );
  const out = {};
  for (const row of rows) {
    if (!(row.setting_key in SETTINGS)) continue;
    /* mysql2 parses a JSON column for us, but a row written by hand — or by an
       older build with a TEXT column — can still arrive as a string. */
    out[row.setting_key] =
      typeof row.setting_value === "string" ? JSON.parse(row.setting_value) : row.setting_value;
  }
  return out;
}

/** Null if the key is not one we store, or the value is not its shape. */
export function preferenceError(key, value) {
  const check = SETTINGS[key];
  if (!check) return `Unknown setting: ${key}.`;
  return check(value) ? null : `Invalid value for ${key}.`;
}

export async function writePreference(userId, key, value) {
  await db.query(
    `INSERT INTO user_settings (user_id, setting_key, setting_value) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [Number(userId), key, JSON.stringify(value)],
  );
}
