import { Router } from "express";
import bcrypt from "bcryptjs";
import db from "../db.js";
import { asyncHandler, duplicateUserField, describeError } from "../lib/http.js";

const router = Router();

const BCRYPT_ROUNDS = 12;
const USERNAME_MIN = 3;
const USERNAME_MAX = 50;
const PASSWORD_MIN = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INVALID_CREDENTIALS = "Invalid username or password.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

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

router.post("/signin", asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    const [rows] = await db.query(
      "SELECT id, username, email, password FROM users WHERE username = ? OR email = ?",
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

    res.json({ id: user.id, username: user.username, email: user.email });
  } catch (err) {
    console.error("signin error:", describeError(err));
    res.status(500).json({ error: GENERIC_ERROR });
  }
}));

router.post("/signup", asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "All fields are required." });
  }

  const invalid =
    validateUsername(username) || validateEmail(email) || validatePassword(password);
  if (invalid) return res.status(400).json({ error: invalid });

  try {
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await db.query(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [username.trim(), email.trim().toLowerCase(), hashed],
    );
    res.status(201).json({ message: "Account created successfully." });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      const field = duplicateUserField(err);
      return res.status(409).json({ error: `That ${field} is already taken.` });
    }
    console.error("signup error:", describeError(err));
    res.status(500).json({ error: GENERIC_ERROR });
  }
}));

// ── Edit Profile ─────────────────────────────────────────────

router.put("/profile", asyncHandler(async (req, res) => {
  const { userId, username, email, password } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required." });

  const updates = [];
  const params = [];

  if (username !== undefined) {
    const error = validateUsername(username);
    if (error) return res.status(400).json({ error, field: "username" });
    updates.push("username = ?");
    params.push(username.trim());
  }

  if (email !== undefined) {
    const error = validateEmail(email);
    if (error) return res.status(400).json({ error, field: "email" });
    updates.push("email = ?");
    params.push(email.trim().toLowerCase());
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
    res.json({ message: "Profile updated.", user });
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
