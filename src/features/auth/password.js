/**
 * Generated passwords.
 *
 * Two places mint one: the boot seeder, when a database has no admin at all,
 * and the console, when a master resets somebody's password. They were the same
 * fifteen lines twice, and the alphabet is the reason to keep them the same —
 * the first is read off a terminal and typed back in, the second is read out of
 * an email and typed back in, so neither can afford a character that is two
 * characters depending on the font.
 */

import crypto from "node:crypto";

/* No 0/O/1/I/l. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const GROUPS = 4;
const GROUP_LEN = 5;

/** 20 characters as four hyphenated groups, e.g. `k4mzp-r7wqd-…`.

    `randomInt` rather than `randomBytes(n) % 31`: 256 is not a multiple of the
    alphabet, so the byte-modulo version the seeder used to carry made its first
    eight letters slightly likelier than its last. It never mattered at this
    length — it is simply free to not do. */
export function generatePassword() {
  const chars = Array.from(
    { length: GROUPS * GROUP_LEN },
    () => ALPHABET[crypto.randomInt(ALPHABET.length)],
  );
  return Array.from({ length: GROUPS }, (_, i) =>
    chars.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN).join(""),
  ).join("-");
}
