import { Router } from "express";
import bcrypt from "bcryptjs";
import db from "#lib/db.js";
import { asyncHandler, duplicateUserField, describeError, requestBaseUrl } from "#lib/http.js";
import { appLimiter, authLimiter, emailLimiter } from "#lib/rateLimit.js";
import {
  consumeVerificationToken,
  mailConfigured,
  sendVerificationEmail,
} from "./verification.js";
import { clearSessionCookie, requireSession, setSessionCookie } from "./session.js";

const router = Router();

const BCRYPT_ROUNDS = 12;
const USERNAME_MIN = 3;
const USERNAME_MAX = 50;
export const PASSWORD_MIN = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INVALID_CREDENTIALS = "Invalid username or password.";
const GENERIC_ERROR = "Something went wrong. Please try again.";
const UNVERIFIED = "Confirm your email address before signing in.";

/** Where `/verify-email` sends the browser afterwards. The sign-in page reads
    `?verified=` and toasts; the values are the statuses `consumeVerificationToken`
    returns, so adding one here means adding its message there. */
const VERIFY_REDIRECT = "/signin?verified=";

/** Returns an error message for an invalid username, or null when valid. */
function validateUsername(username) {
  return username.length < USERNAME_MIN || username.length > USERNAME_MAX
    ? `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`
    : null;
}

function validateEmail(email) {
  return EMAIL_RE.test(email) ? null : "Invalid email address.";
}

function validatePassword(password) {
  return password.length < PASSWORD_MIN
    ? `Password must be at least ${PASSWORD_MIN} characters.`
    : null;
}

router.post("/signin", authLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    const [rows] = await db.query(
      `SELECT id, username, email, password, is_admin, email_verified
       FROM users WHERE username = ? OR email = ?`,
      [username.trim(), username.trim().toLowerCase()],
    );

    if (!rows.length) {
      return res.status(401).json({ error: INVALID_CREDENTIALS });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password ?? "");
    if (!match) {
      return res.status(401).json({ error: INVALID_CREDENTIALS });
    }

    /* Checked after the password, not before: until the password is proved,
       "that account exists but is unconfirmed" is a fact about somebody else's
       account. `needsVerification` is what turns the sign-in page's error into
       a RESEND button rather than a dead end. */
    if (!user.email_verified) {
      return res.status(403).json({ error: UNVERIFIED, needsVerification: true });
    }

    /* The password is proved and the address is confirmed: this is the one
       place a session begins. Everything the client gets back below is for
       drawing the account menu — the id it needs to *act* is in the cookie,
       and no route reads the copy in the response. */
    setSessionCookie(req, res, user);

    /* `isAdmin` rides along so the account menu knows whether to offer the
       console. It is display only — the console re-checks the column and the
       password before it hands out a token. */
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: Boolean(user.is_admin),
    });
  } catch (err) {
    console.error("signin error:", describeError(err));
    res.status(500).json({ error: GENERIC_ERROR });
  }
}));

router.post("/signup", authLimiter, asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "All fields are required." });
  }

  const invalid =
    validateUsername(username) || validateEmail(email) || validatePassword(password);
  if (invalid) return res.status(400).json({ error: invalid });

  try {
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const cleanName = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const [result] = await db.query(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [cleanName, cleanEmail, hashed],
    );

    /* The account exists and is unverified, which is the safe order: a send
       that fails leaves a real account somebody can ask for another link for,
       where sending first would leave a live token pointing at no user. The
       201 is therefore reported whatever the mail does — the message says
       which happened. */
    const user = { id: result.insertId, username: cleanName, email: cleanEmail };
    let delivered = false;
    try {
      ({ delivered } = await sendVerificationEmail(user, requestBaseUrl(req)));
    } catch (mailErr) {
      console.error("signup verification mail failed:", describeError(mailErr));
      return res.status(201).json({
        message: "Account created, but the confirmation email could not be sent. Use RESEND on the sign-in page.",
        needsVerification: true,
        delivered: false,
      });
    }

    res.status(201).json({
      message: delivered
        ? "Account created. Check your email for the confirmation link."
        : "Account created. No mail server is configured — the confirmation link is in the server log.",
      needsVerification: true,
      delivered,
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      const field = duplicateUserField(err);
      return res.status(409).json({ error: `That ${field} is already taken.` });
    }
    console.error("signup error:", describeError(err));
    res.status(500).json({ error: GENERIC_ERROR });
  }
}));

/**
 * Ends the session.
 *
 * Answers 200 whether or not there was one to end: the client's next move is
 * the sign-in page either way, and an error here would only ever strand
 * somebody on a page they are trying to leave.
 */
router.post("/signout", (req, res) => {
  clearSessionCookie(req, res);
  res.json({ message: "Signed out." });
});

// ── Confirming an address ────────────────────────────────────

/**
 * The link in the email. Registered at `/verify-email` by `server.js` rather
 * than under `/api`, because this URL is read by a person in a mail client.
 *
 * It answers with a redirect, not JSON: whoever clicks it is in a browser and
 * wants to end up somewhere they can sign in. Every outcome — including the
 * failures — lands on the sign-in page with a `?verified=` status, so there is
 * one place that explains what happened and it is the page you need next.
 */
export const verifyEmailPage = asyncHandler(async (req, res) => {
  try {
    const status = await consumeVerificationToken(String(req.query.token || ""));
    res.redirect(`${VERIFY_REDIRECT}${status}`);
  } catch (err) {
    console.error("verify email error:", describeError(err));
    res.redirect(`${VERIFY_REDIRECT}error`);
  }
});

/**
 * Another link, for a sign-up whose email never arrived or has expired.
 *
 * **Always answers 200**, whether or not the account exists, is already
 * verified, or was throttled. This endpoint is public and takes a bare
 * username-or-email, so a truthful answer would be an oracle for which
 * addresses are registered here. The mail itself is the only signal, and it
 * only reaches the person who owns the address.
 */
router.post("/verify-email/resend", emailLimiter, asyncHandler(async (req, res) => {
  const identifier = String(req.body?.username || "").trim();
  const generic = {
    message: mailConfigured()
      ? "If that account still needs confirming, a new link is on its way."
      : "No mail server is configured — ask whoever runs the site to check the server log.",
  };
  if (!identifier) return res.json(generic);

  try {
    const [[user]] = await db.query(
      `SELECT id, username, email, email_verified FROM users
       WHERE username = ? OR email = ?`,
      [identifier, identifier.toLowerCase()],
    );
    if (user && !user.email_verified) {
      await sendVerificationEmail(user, requestBaseUrl(req), { throttle: true });
    }
  } catch (err) {
    /* Logged, not reported: the answer is the same either way, and a 500 here
       would tell the caller their guess hit a real account. */
    console.error("verification resend error:", describeError(err));
  }
  res.json(generic);
}));

// ── Edit Profile ─────────────────────────────────────────────

router.put("/profile", requireSession, appLimiter, asyncHandler(async (req, res) => {
  /* The account being edited is the one that is signed in, full stop. This
     route used to take `userId` from the body, which made "edit my profile"
     mean "edit anyone's" — including their password. */
  const userId = req.userId;
  const { username, email, password } = req.body;

  const [[current]] = await db.query("SELECT email FROM users WHERE id = ?", [userId]);
  if (!current) return res.status(404).json({ error: "Unknown user." });

  const updates = [];
  const params = [];

  if (username !== undefined) {
    const error = validateUsername(username);
    if (error) return res.status(400).json({ error, field: "username" });
    updates.push("username = ?");
    params.push(username.trim());
  }

  /* A new address has been proved by nobody, so it goes back to unverified and
     gets its own link. The account keeps working until the next sign-in, which
     is where the block bites — the alternative, trusting an address because the
     person typing it was already signed in, is the exact hole confirmation is
     here to close: it is what would let somebody point their account at a
     stranger's inbox and have the console mail a password there. */
  const nextEmail = email === undefined ? null : email.trim().toLowerCase();
  const emailChanged = nextEmail !== null && nextEmail !== current.email;

  if (email !== undefined) {
    const error = validateEmail(email);
    if (error) return res.status(400).json({ error, field: "email" });
    updates.push("email = ?");
    params.push(nextEmail);
    if (emailChanged) updates.push("email_verified = 0");
  }

  if (password !== undefined && password !== "") {
    const error = validatePassword(password);
    if (error) return res.status(400).json({ error, field: "password" });
    updates.push("password = ?");
    params.push(await bcrypt.hash(password, BCRYPT_ROUNDS));
  }

  if (!updates.length) {
    return res.status(400).json({ error: "No changes provided." });
  }

  try {
    params.push(userId);
    await db.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);

    const [[user]] = await db.query(
      "SELECT id, username, email FROM users WHERE id = ?",
      [userId],
    );

    if (!emailChanged) return res.json({ message: "Profile updated.", user });

    /* Three outcomes, three sentences — "not delivered" is the ordinary no-SMTP
       mode and must not be reported as a failure. */
    let delivered = false;
    let failed = false;
    try {
      ({ delivered } = await sendVerificationEmail(user, requestBaseUrl(req)));
    } catch (mailErr) {
      console.error("profile verification mail failed:", describeError(mailErr));
      failed = true;
    }
    const message = failed
      ? "Profile updated, but the confirmation email could not be sent. The next sign-in needs that address confirmed."
      : delivered
        ? "Profile updated. Confirm your new email address — the next sign-in needs it."
        : "Profile updated. No mail server is configured — the confirmation link is in the server log.";
    res.json({ message, user, emailChanged: true });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      const field = duplicateUserField(err);
      return res.status(409).json({ error: `That ${field} is already taken.`, field });
    }
    console.error("profile update error:", describeError(err));
    res.status(500).json({ error: GENERIC_ERROR });
  }
}));

export default router;
