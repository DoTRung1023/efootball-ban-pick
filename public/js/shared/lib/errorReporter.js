/**
 * Global error surfacing, for every page.
 *
 * Two jobs, and they are for different audiences. The **user** gets told that
 * something broke, because an unhandled rejection is unprompted by definition —
 * nobody clicks their way into one, so without a message the page simply stops
 * working with no explanation. The **server log** gets the error itself, because
 * until this existed a browser error was seen by nobody who could fix it: it
 * logged to the user's own console and died there, and the only bug report was
 * somebody saying "it broke".
 *
 * This began as four copies waiting to happen — the room page had the handlers,
 * the other three had nothing. It lives in `shared/` because all four pages
 * install it, which is the bar CLAUDE.md sets.
 *
 * **`notify` is injected rather than imported**, and that is what keeps this
 * module free of dependencies: the home page's toast takes `info|success|error`
 * and the room's takes a `warn` variant of its own, the two are deliberately not
 * merged, and the console has no toast element at all. A module that picked one
 * would be wrong on two pages out of three.
 */

/* A page in an error loop would otherwise post forever. The server's limiter
   would stop the flood either way, but stopping it here means the loop never
   becomes network traffic, and it keeps the log honest: five reports from one
   page load is a bug, five hundred is just noise about the same bug. */
const MAX_REPORTS_PER_LOAD = 5;
let reportsSent = 0;

/**
 * Sends one error to the server log, where the server's own errors already go.
 *
 * Fire-and-forget by design. Nothing awaits it, nothing reads the response, and
 * every failure is swallowed — a reporter that throws or rejects would be caught
 * by the very handlers that called it, and the loop would be ours. `keepalive`
 * lets the request outlive a page that is navigating away, which is exactly when
 * the interesting errors happen.
 */
function postErrorToServer(kind, error, message) {
  if (reportsSent >= MAX_REPORTS_PER_LOAD) return;
  reportsSent += 1;
  try {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        kind,
        message: String(message ?? ""),
        stack: String(error?.stack ?? ""),
        url: location.pathname + location.search,
      }),
    }).catch(() => {});
  } catch {
    /* JSON.stringify on an exotic reason, or fetch missing entirely. Reporting
       that the reporter failed is not worth a second failure. */
  }
}

/**
 * Installs `error` and `unhandledrejection` handlers on `window`.
 *
 * `notify` is optional and receives the message to show a person. It is called
 * inside the same guard as everything else, so a page whose toast element is
 * missing — the console has none — still logs and still reports.
 *
 * Call once, from a page entry file.
 */
export function installErrorReporter({ notify } = {}) {
  function report(label, error, message) {
    try {
      console.error(label, error);
      if (notify) notify(String(message || "An unexpected error occurred"));
      postErrorToServer(label, error, message);
    } catch (err) {
      console.error(`Error in ${label} handler:`, err);
    }
  }

  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev.reason;
    report(
      "Unhandled promise rejection:",
      reason,
      reason?.message ?? String(reason ?? "Unexpected error"),
    );
    /* The room page swallowed these so a rejection could not also surface as a
       browser-level console error the user might see behind the toast. Kept for
       every page, now that every page has the handler. */
    ev.preventDefault?.();
  });

  window.addEventListener("error", (ev) => {
    report("Runtime error:", ev.error || ev.message, ev.message || ev.error?.message);
  });
}
