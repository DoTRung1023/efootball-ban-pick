/* ============================================================
   rooms — the Rooms tab on the home page

   The room code and OPEN ROOM button, and the join-by-code flow. This is the
   *lobby entrance*; the draft itself is a separate page and a separate feature
   (`features/draft/`). There is no create-room drawer — the code sits on the
   page.

   `goToRoom` is async for `mode: "join"` — it checks `GET /api/rooms/:code`
   first and refuses to navigate into a room that does not exist.
   ============================================================ */

export { initRoomHost, initRoomHub, redirectToActiveRoom } from "./rooms.js";
