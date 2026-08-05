/** Thin wrappers over the room HTTP API. All calls resolve; none throw. */

import { state } from './state.js';
import { getCurrentIdentity } from './utils.js';

/**
 * POST to /api/rooms/:code/<action>.
 * Resolves to { ok, data } — a network failure yields { ok: false, data: {} }.
 */
export async function postRoomAction(action, body = {}, code = state.room?.code) {
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

/** Same as postRoomAction but fills in the current user's id as requesterId. */
export function postAsMe(action, body = {}, code = state.room?.code) {
  return postRoomAction(action, { requesterId: getCurrentIdentity().id, ...body }, code);
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
