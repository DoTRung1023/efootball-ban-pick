/* ============================================================
   Room codes

   Lives in `shared/` because both bundles generate one: the home page's Rooms
   tab hands the host a code to share, and the room page's post-match screen
   mints a fresh one for "new match". There is no create-room endpoint — a room
   exists as soon as somebody sends presence for its code — so whoever is
   starting one generates it client-side.
   ============================================================ */

/** Ambiguous glyphs are left out: I/O/0/1 cost more in mistyped codes than the
    extra entropy is worth at six characters. */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const ROOM_CODE_LENGTH = 6;

export function genRoomCode(len = ROOM_CODE_LENGTH) {
  return Array.from({ length: len }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
}
