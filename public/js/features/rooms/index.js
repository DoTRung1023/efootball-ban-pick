/* ============================================================
   rooms — the Rooms tab on the home page

   Create-room drawer, join-by-code / invite-link flow, and the squad + plan
   stat panels. This is the *lobby entrance*; the draft itself is a separate
   page and a separate feature (`features/draft/`).

   `goToRoom` is async for `mode: "join"` — it checks `GET /api/rooms/:code`
   first and refuses to navigate into a room that does not exist.
   ============================================================ */

export { initRoomModal, initRoomHub, redirectToActiveRoom } from "./rooms.js";
