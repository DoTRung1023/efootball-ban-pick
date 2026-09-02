/**
 * Browser errors, in the server's log.
 *
 * The server already tells you when it breaks: 45 `console.error` sites and
 * `errorHandler` all land in Render's log stream. The browser told nobody. A
 * runtime error or an unhandled rejection in the draft showed the user a toast,
 * logged to *their* console, and left no trace anywhere the person who could
 * fix it would ever look — so the only bug report was somebody saying "it broke".
 *
 * This closes that half, and deliberately nothing more. It is a log line, not a
 * monitoring product: no grouping, no history, no alerting, no third party, no
 * dependency, and no error data leaving this box. If those turn out to matter,
 * that is the moment to reach for Sentry — not before.
 *
 * **Everything here assumes the body is hostile.** It is an unauthenticated
 * endpoint that writes to the log, which makes it two things at once: a way to
 * flood the log, and a way to put attacker-chosen text in front of whoever
 * reads it. Hence the size caps, the newline stripping, and `JSON.stringify` on
 * every interpolated field rather than bare concatenation.
 */

/* Long enough for a real stack's top frames, short enough that a flood is
   bounded by the rate limiter times these numbers rather than by the JSON
   body limit. */
const MAX_MESSAGE = 300;
const MAX_STACK = 1500;
const MAX_URL = 300;
const MAX_KIND = 40;

/* One line, one entry. A stack arrives with newlines in it and a log reader
   splits on those, so an attacker who controls the text controls how many
   entries appear and what they look like — including a convincing fake. Tabs
   keep the frames readable without giving that away. */
const oneLine = (value, max) =>
  String(value ?? "")
    .slice(0, max)
    .replace(/\r?\n/g, " → ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * `POST /api/client-error` — 204, always.
 *
 * The client is fire-and-forget and ignores the response, so there is nothing
 * useful to say back. Answering 204 rather than 200 also means a body can never
 * be reflected, which is one fewer thing to get wrong on a route whose whole
 * input is untrusted.
 */
export function handleClientError(req, res) {
  try {
    const body = req.body ?? {};
    const kind = oneLine(body.kind, MAX_KIND) || "error";
    const message = oneLine(body.message, MAX_MESSAGE) || "(no message)";
    const stack = oneLine(body.stack, MAX_STACK);
    const page = oneLine(body.url, MAX_URL);
    /* `req.userId` is the signed-in account or null, and `identityId` is the
       cookie behind it — both server-minted, neither taken from this body. An
       integer id is what makes two reports comparable without logging a name
       or an address. */
    const who = req.userId ? `user ${req.userId}` : `visitor ${req.identityId ?? "?"}`;

    console.error(
      `client error [${kind}] ${who} at ${JSON.stringify(page)}: ${JSON.stringify(message)}` +
        (stack ? ` | ${JSON.stringify(stack)}` : ""),
    );
  } catch (err) {
    /* A reporter that throws would be reported by `errorHandler`, which logs —
       so a bad body could turn one client error into two log lines, the second
       of them ours. Swallow it. */
    console.error("client error report rejected:", err?.message || "unknown");
  }
  res.status(204).end();
}
