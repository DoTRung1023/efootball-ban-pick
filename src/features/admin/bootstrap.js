/**
 * The built-in admin account.
 *
 * A fresh database has no admin, and an app whose only way in is a hand-written
 * `UPDATE users SET is_admin = 1` has no setup story. This runs once per boot
 * and makes sure a console account exists:
 *
 *   1. `ADMIN_EMAIL` + `ADMIN_PASSWORD` set → that account is created, or its
 *      password reset and its flag restored, **on every boot**. This is also the
 *      way back in after a forgotten password: set the pair, restart, sign in.
 *   2. Otherwise, if no admin exists at all → one is created with a randomly
 *      generated password, printed to the server log exactly once.
 *   3. Otherwise → nothing. An existing admin is never touched.
 *
 * There is deliberately no default password baked into the repo: rule 2 mints a
 * fresh one per installation, which is the one thing a shipped credential can
 * never be.
 *
 * **Both accounts above are seeded as master admins and as email-verified.**
 * Rule 1 restores both on every boot. Verified is not a convenience: sign-in
 * refuses an unconfirmed address, and an account seeded from `.env` has no
 * inbox to click a link in — `admin@localhost` least of all — so without it the
 * recovery path would mint an admin that cannot sign in. Only a master may grant or revoke console access, so if the
 * `.env` account were a plain admin a mis-click in the USERS tab could leave a
 * database with admins and no way to change who they are. Restarting with
 * `ADMIN_EMAIL` set is the recovery path, and it only works if it grants master.
 */

import bcrypt from "bcryptjs";
import db from "#lib/db.js";
import { generatePassword, PASSWORD_MIN } from "#features/auth/index.js";
import { describeError } from "#lib/http.js";
import { loadConsolePassword } from "./consolePassword.js";
import { ensureUserSettingsTable } from "./preferences.js";

const BCRYPT_ROUNDS = 12;
const DEFAULT_USERNAME = "admin";
const DEFAULT_EMAIL = "admin@localhost";

function banner(lines) {
  const width = Math.max(...lines.map((l) => l.length));
  const rule = "─".repeat(width + 2);
  console.log(`┌${rule}┐`);
  for (const line of lines) console.log(`│ ${line.padEnd(width)} │`);
  console.log(`└${rule}┘`);
}

/**
 * Adds `is_master_admin` to a database created before master admins existed.
 *
 * MySQL has no `ADD COLUMN IF NOT EXISTS`, so the column is looked up first.
 * This runs on every boot and is a no-op on all but one of them; the
 * alternative is a console that answers 500 to every USERS read until somebody
 * finds the `ALTER` in `schema.sql`.
 */
async function ensureMasterColumn() {
  const [[{ cnt }]] = await db.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'users'
       AND column_name = 'is_master_admin'`,
  );
  if (cnt) return;
  await db.query(
    "ALTER TABLE users ADD COLUMN is_master_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER is_admin",
  );
  console.log("admin bootstrap: added users.is_master_admin");
}

/** Creates the account, or promotes and re-passwords the one already there. */
async function upsertAdmin({ username, email, password }) {
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const [[existing]] = await db.query(
    "SELECT id FROM users WHERE email = ? OR username = ?",
    [email, username],
  );

  if (existing) {
    await db.query(
      `UPDATE users SET password = ?, is_admin = 1, is_master_admin = 1, email_verified = 1
       WHERE id = ?`,
      [hash, existing.id],
    );
    return { id: existing.id, created: false };
  }
  const [result] = await db.query(
    `INSERT INTO users (username, email, password, is_admin, is_master_admin, email_verified)
     VALUES (?, ?, ?, 1, 1, 1)`,
    [username, email, hash],
  );
  return { id: result.insertId, created: true };
}

export async function ensureConsoleAdmin() {
  const envPassword = process.env.ADMIN_PASSWORD || "";
  const envEmail = process.env.ADMIN_EMAIL || "";
  const username = process.env.ADMIN_USERNAME || DEFAULT_USERNAME;

  try {
    await ensureMasterColumn();
    await ensureUserSettingsTable();
    /* Before any of the branches below — the gate needs an answer whether or
       not an admin account is seeded on this boot. */
    await loadConsolePassword();

    // 1. An explicitly configured admin is enforced on every boot.
    if (envEmail && envPassword) {
      if (envPassword.length < PASSWORD_MIN) {
        console.error(`admin bootstrap: ADMIN_PASSWORD must be at least ${PASSWORD_MIN} characters — skipped.`);
        return;
      }
      const { created } = await upsertAdmin({ username, email: envEmail, password: envPassword });
      console.log(`Master admin ${created ? "created" : "updated"} from ADMIN_EMAIL/ADMIN_PASSWORD: ${envEmail}`);
      return;
    }

    // 2. No admin at all: mint one, and say so loudly and once.
    const [[{ cnt }]] = await db.query("SELECT COUNT(*) AS cnt FROM users WHERE is_admin = 1");
    if (cnt > 0) return;

    const password = generatePassword();
    const email = envEmail || DEFAULT_EMAIL;
    await upsertAdmin({ username, email, password });

    banner([
      "FIRST RUN — console admin created",
      "",
      `  username   ${username}`,
      `  email      ${email}`,
      `  password   ${password}`,
      "",
      "Sign in, then open Admin Console from the account menu.",
      "This password is shown once and stored only as a hash —",
      "change it under Edit Profile.",
    ]);
  } catch (err) {
    /* A database that is down must not stop the server from starting: the rest
       of the app reports its own outage, and the next boot tries again. */
    console.error("admin bootstrap skipped:", describeError(err));
  }
}
