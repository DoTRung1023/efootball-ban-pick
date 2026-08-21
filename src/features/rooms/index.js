/**
 * Rooms feature — room lifecycle, in-memory presence and draft config.
 *
 * Everything below is the feature's public surface. `store.js` holds the
 * in-memory room map; the admin feature reads it through here rather than
 * reaching into the file directly.
 */
export { default as roomRoutes } from "./routes.js";
export {
  findRoomEntry,
  isActiveDraft,
  isValidRoomCode,
  listActiveRooms,
  normalizeRoomCodeParam,
  roomPhase,
  serializeRoomEntry,
} from "./store.js";
