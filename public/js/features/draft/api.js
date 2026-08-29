/** Thin wrappers over the room HTTP API. All calls resolve; none throw. */

import { state } from './state.js';

/**
 * POST to /api/rooms/:code/<action>.
 * Resolves to { ok, data } — a network failure yields { ok: false, data: {} }.
 */
async function postRoomAction(action, body = {}, code = state.room?.code) {
  if (!code) return { ok: false, data: {} };
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: {} };
  }
}

/**
 * The same, as whoever this browser's session cookie says we are.
 *
 * It used to put `requesterId` in the body, read out of localStorage. The
 * server ignores that now and takes the caller from its own signed cookie, so
 * there is nothing left to fill in — the name stays because the *guarantee*
 * did: this is the call that acts as you.
 */
export function postAsMe(action, body = {}, code = state.room?.code) {
  return postRoomAction(action, body, code);
}

/** GET helper returning a parsed body, or {} on any failure. */
export async function getJson(url) {
  try {
    const res = await fetch(url);
    return await res.json().catch(() => ({}));
  } catch {
    return {};
  }
}
