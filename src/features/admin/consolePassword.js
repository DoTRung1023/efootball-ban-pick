/**
 * The shared /console password.
 *
 * The gate takes one password from every admin instead of making each of them
 * retype their own account password. Where that password lives is the whole
 * subject of this file, because it has to satisfy two things that pull apart:
 * a master admin must be able to rotate it from the console, and there must be
 * a way back in when nobody remembers what it was rotated to.
 *
 *   - **The stored hash wins.** `app_settings.console_password` holds a bcrypt
 *     hash, and a rotation survives a restart. An env value that overrode it on
 *     every boot would make the rotation button a lie.
 *   - **`ADMIN_CONSOLE_PASSWORD` seeds it**, once, when nothing is stored yet.
 *     That is how a fresh install gets a console password at all.
 *   - **`ADMIN_CONSOLE_PASSWORD_RESET=1` forces the seed**, overwriting whatever
 *     is stored, on the next boot. This is the way back in, and it is the same
 *     shape as the `ADMIN_EMAIL`/`ADMIN_PASSWORD` recovery in `bootstrap.js`:
 *     edit `.env`, restart, you are in.
 *
 * With neither a stored hash nor an env seed the console falls back to
 * per-account passwords — the behaviour before any of this existed. There is no
 * default value baked into the repo, which is the one thing a shipped
 * credential can never be.
 *
 * The trade a shared secret makes is real and is stated where it is felt: see
 * the note at the top of `adminSession.js`.
 */

import bcrypt from "bcryptjs";
import db from "#lib/db.js";

const BCRYPT_ROUNDS = 12;
const SETTING_KEY = "console_password";

/* Read once at boot and after every rotation, so the gate costs no query. A
   `null` means "no shared password" and sends the gate back to account
   passwords; `undefined` means "not loaded yet" and is never served. */
let cachedHash;

const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v || ""));

/** Creates `app_settings` if this database predates it. Idempotent by design —
    it runs on every boot and does nothing on all but one of them. */
export async function ensureSettingsTable() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS app_settings (
       setting_key   VARCHAR(64)  NOT NULL,
       setting_value VARCHAR(255) NOT NULL,
       updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (setting_key)
     ) ENGINE=InnoDB`,
  );
}

async function readStoredHash() {
  const [[row]] = await db.query(
    "SELECT setting_value FROM app_settings WHERE setting_key = ?",
    [SETTING_KEY],
  );
  return row?.setting_value || null;
}

async function writeStoredHash(hash) {
  await db.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [SETTING_KEY, hash],
  );
  cachedHash = hash;
}

/**
 * Resolves the console password for this boot and caches it.
 *
 * Called from `ensureConsoleAdmin`, which already swallows its own errors so a
 * database that is down delays the console rather than the server.
 */
export async function loadConsolePassword() {
  await ensureSettingsTable();

  const seed = process.env.ADMIN_CONSOLE_PASSWORD || "";
  const stored = await readStoredHash();

  if (seed && (!stored || truthy(process.env.ADMIN_CONSOLE_PASSWORD_RESET))) {
    await writeStoredHash(await bcrypt.hash(seed, BCRYPT_ROUNDS));
    console.log(
      stored
        ? "Console password reset from ADMIN_CONSOLE_PASSWORD (ADMIN_CONSOLE_PASSWORD_RESET is set)."
        : "Console password seeded from ADMIN_CONSOLE_PASSWORD.",
    );
    return;
  }

  cachedHash = stored;
  if (!stored) {
    console.log("No console password set — the gate will ask for each admin's own account password.");
  }
}

/** Whether the gate should ask for the shared password rather than the account's. */
export function usesConsolePassword() {
  return Boolean(cachedHash);
}

/** bcrypt is the timing-safe comparison here; there is no separate fast path. */
export async function consolePasswordMatches(candidate) {
  if (!cachedHash) return false;
  return bcrypt.compare(String(candidate ?? ""), cachedHash);
}

/**
 * Replaces the shared password. The caller has already proved it is a master
 * admin and has already re-entered the current password.
 *
 * Rotating **turns the shared password on** if it was off: an install that ran
 * on account passwords and then set one from the console is a deliberate
 * change, not an accident, and refusing it would leave the button dead with no
 * way to explain why.
 */
export async function rotateConsolePassword(newPassword) {
  await writeStoredHash(await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS));
}
