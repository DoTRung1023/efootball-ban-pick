/**
 * Email confirmation.
 *
 * An account is unusable until the address on it has been proved: `/api/signin`
 * refuses an unverified user even with the right password. That is the whole
 * point of the feature — the console emails a generated password to whatever is
 * in `users.email`, so an address nobody proved is an address that can be typed
 * to receive somebody else's reset.
 *
 * **Three rules the rest of the app depends on:**
 *
 *   1. **Only the hash is stored.** `token_hash` is a SHA-256 of a 32-byte
 *      random token; the token itself exists in the email and nowhere else.
 *      A dump of `email_verifications` confirms nobody's address.
 *      SHA-256 without a salt is right here and bcrypt would be wrong: the
 *      input is 256 bits of randomness, so there is no dictionary to run, and
 *      the lookup is by hash and must stay one indexed query.
 *   2. **A link is good once, for `EXPIRY_HOURS`, for the address it was minted
 *      for.** If the account's email changed after the mail went out, the token
 *      is dead — otherwise an old link would confirm an address its owner never
 *      agreed to.
 *   3. **Minting supersedes.** Every earlier link for that user is deleted, so
 *      "resend" cannot leave two live links behind.
 *
 * Accounts that predate this feature are backfilled as verified by
 * `ensureAuthSchema` — the alternative is an upgrade that locks out every
 * existing user, including the admins, with no way back in but SQL.
 */

import crypto from "node:crypto";
import db from "#lib/db.js";
import { describeError } from "#lib/http.js";
import { mailConfigured, sendMail, verificationEmail } from "#features/mail/index.js";

const EXPIRY_HOURS = 24;
/** How close together the **public** RESEND button may actually send. One click
    must not equal one email on an endpoint that takes a bare username and
    answers the same thing whatever it finds. Sign-up and an email change are
    not throttled: each is a state change somebody just made, and each is the
    only notice they get that it needs confirming. */
const RESEND_COOLDOWN_SEC = 60;

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Adds what this feature needs to a database created before it existed.
 *
 * Same shape as `ensureMasterColumn` in the admin seeder and for the same
 * reason: MySQL has no `ADD COLUMN IF NOT EXISTS`, and an install that has to
 * find an `ALTER` in `schema.sql` before it can sign in is an install that is
 * simply broken. Runs on every boot; does nothing on all but one of them.
 *
 * The backfill is the load-bearing line. It runs **only** in the same boot that
 * adds the column, so it means "everyone who existed before confirmation did"
 * rather than "everyone", and it never re-verifies an account that was created
 * afterwards and has not clicked its link.
 */
export async function ensureAuthSchema() {
  try {
    const [[{ cnt }]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'users'
         AND column_name = 'email_verified'`,
    );
    if (!cnt) {
      await db.query(
        "ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER email",
      );
      const [result] = await db.query("UPDATE users SET email_verified = 1");
      console.log(
        `auth schema: added users.email_verified (${result.affectedRows} existing account(s) kept signed in)`,
      );
    }

    await db.query(
      `CREATE TABLE IF NOT EXISTS email_verifications (
         id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
         user_id     INT UNSIGNED  NOT NULL,
         token_hash  CHAR(64)      NOT NULL,
         email       VARCHAR(255)  NOT NULL,
         expires_at  DATETIME      NOT NULL,
         consumed_at DATETIME      NULL,
         created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         UNIQUE KEY uq_ev_token (token_hash),
         KEY idx_ev_user (user_id),
         CONSTRAINT fk_ev_user FOREIGN KEY (user_id) REFERENCES users (id)
           ON DELETE CASCADE ON UPDATE CASCADE
       ) ENGINE=InnoDB`,
    );
  } catch (err) {
    /* Same bargain as the admin seeder: a database that is down delays this
       feature, not the server. The next boot tries again. */
    console.error("auth schema check skipped:", describeError(err));
  }
}

/** Seconds since this user's most recent link, or null if they have none. */
async function secondsSinceLastSend(userId) {
  const [[row]] = await db.query(
    `SELECT TIMESTAMPDIFF(SECOND, MAX(created_at), NOW()) AS age
     FROM email_verifications WHERE user_id = ?`,
    [userId],
  );
  return row?.age ?? null;
}

/** Replaces every live link for this user with one new one, and returns it. */
async function mintToken(userId, email) {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.query("DELETE FROM email_verifications WHERE user_id = ?", [userId]);
  await db.query(
    `INSERT INTO email_verifications (user_id, token_hash, email, expires_at)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [userId, hashToken(token), email, EXPIRY_HOURS],
  );
  return token;
}

/**
 * Mints a link and mails it.
 *
 * Returns `{ sent, delivered, throttled }`. The three are not the same thing
 * and every caller has to tell them apart when it writes its message:
 * `delivered: false` with `sent: true` is the no-SMTP mode — the link went to
 * the server log, so "check your inbox" would be a lie — and `throttled` means
 * a live link already exists and is under a minute old.
 *
 * `throttle` is opt-in and only the public RESEND endpoint asks for it. Sign-up
 * and an email change must always send, or the message they show ("check your
 * email") would be describing an email nobody sent.
 *
 * Throws only if the transport fails. Sign-up leans on that: the account is
 * already committed by then, so it answers with the failure instead of leaving
 * somebody staring at an inbox that will never fill.
 */
export async function sendVerificationEmail({ id, username, email }, baseUrl, { throttle = false } = {}) {
  if (throttle) {
    const age = await secondsSinceLastSend(id);
    if (age !== null && age < RESEND_COOLDOWN_SEC) {
      return { sent: false, delivered: false, throttled: true };
    }
  }

  const token = await mintToken(id, email);
  const url = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const { subject, text } = verificationEmail({ username, url, hours: EXPIRY_HOURS });
  const { delivered } = await sendMail({ to: email, subject, text });
  return { sent: true, delivered, throttled: false };
}

/**
 * Spends a token.
 *
 * One of `ok` · `already` · `expired` · `stale` · `invalid`, which the redirect
 * in `routes.js` turns into the message the sign-in page shows. `stale` is its
 * own answer rather than `invalid` because it is the one failure with a
 * sensible next step: the address on the account changed, so the link that
 * matters is the newer one.
 */
export async function consumeVerificationToken(token) {
  if (!token) return "invalid";

  const [[row]] = await db.query(
    `SELECT v.id, v.user_id, v.email, v.consumed_at, v.expires_at < NOW() AS expired,
            u.email AS current_email, u.email_verified
     FROM email_verifications v
     JOIN users u ON u.id = v.user_id
     WHERE v.token_hash = ?`,
    [hashToken(token)],
  );

  /* A spent row is marked, not deleted, so the second click on the same link —
     a double-tap, or a mail scanner that fetched it before the human did —
     reads as `already` instead of as a broken link. */
  if (!row) return "invalid";
  if (row.email_verified) return "already";
  if (row.consumed_at) return "already";
  if (row.expired) return "expired";
  if (row.email !== row.current_email) return "stale";

  await db.query("UPDATE users SET email_verified = 1 WHERE id = ?", [row.user_id]);
  await db.query("UPDATE email_verifications SET consumed_at = NOW() WHERE id = ?", [row.id]);
  return "ok";
}

/** Re-exported so routes can tell a user "check your inbox" or "ask the admin
    to look at the server log" without reaching into the mail feature. */
export { mailConfigured };
