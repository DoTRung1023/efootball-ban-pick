/**
 * WAKE PAGE — poll the app, then hand off.
 *
 * Loaded with `defer` from index.html's <head>, so the DOM is complete by
 * the time this runs. See the comment block there for why the page exists;
 * the short version is that Render's free tier sleeps and this page is
 * served by Vercel, which does not.
 *
 * Deliberately plain — no imports, no module type, no importmap. The app's
 * pages are ESM because they import from `@/`; this one has nothing to
 * import, and a module here would only add a fetch to a page whose entire
 * job is to be instant.
 */

/* The one thing to change if the app moves — a custom domain, a paid
   Render instance, somewhere else entirely. Nothing else on this page
   names the host, apart from the <noscript> fallback link and the
   preconnect hint in index.html. */
const APP_ORIGIN = "https://efootball-ban-pick.onrender.com";

/* Measured, not guessed: a cold boot answered /api/health in 23s. 30s is
   that with room, and it is what the "usually" copy promises — so if the
   boot gets slower, change both or neither. */
const TYPICAL_WAKE_MS = 30_000;
/* Render holds the connection open through a cold start rather than
   refusing it, so one probe usually just takes ~23s. This cap exists for
   the other case: a 502 from the proxy mid-boot, which comes back fast
   and needs retrying. */
const PROBE_TIMEOUT_MS = 12_000;
const RETRY_GAP_MS = 1_000;
const GIVE_UP_MS = 120_000;
/* A warm server answers in ~200ms. Under this, nobody sees a loader. */
const REVEAL_DELAY_MS = 600;

const shell = document.getElementById("shell");
const card = document.getElementById("card");
const kicker = document.getElementById("kicker");
const headline = document.getElementById("headline");
const blurb = document.getElementById("blurb");
const bar = document.getElementById("bar");
const elapsedEl = document.getElementById("elapsed");
const estimateEl = document.getElementById("estimate");
const retry = document.getElementById("retry");

/* Where to land after the hand-off. `?to=/room?code=ABC` lets a shared
   link survive the wait instead of dumping everyone on the home page.
   Only a path is accepted: the `(?!\/)` rejects `//evil.com`, which is a
   protocol-relative URL and would otherwise be an open redirect. */
function destination() {
  const raw = new URLSearchParams(location.search).get("to") || "/";
  return /^\/(?!\/)/.test(raw) ? raw : "/";
}

const startedAt = Date.now();
let settled = false;

/* One probe. Resolves true only on a real 2xx from the app itself —
   `/api/health` answers {ok:true} and sends the CORS header that lets us
   read it, so a Render holding page or a 502 can never be mistaken for
   the app being up. */
async function probe() {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(APP_ORIGIN + "/api/health", {
      signal: abort.signal,
      cache: "no-store",
      mode: "cors",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function handOff() {
  settled = true;
  bar.style.width = "100%";
  location.replace(APP_ORIGIN + destination());
}

function fail() {
  settled = true;
  card.dataset.state = "failed";
  kicker.textContent = "No answer";
  headline.textContent = "The server is not responding";
  blurb.textContent =
    "It has been two minutes with no reply, which is longer than a cold start. " +
    "The service may be down rather than asleep.";
  retry.focus();
}

function tick() {
  if (settled) return;
  const elapsed = Date.now() - startedAt;

  const secs = Math.floor(elapsed / 1000);
  elapsedEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  /* Stops at 92%: the remaining 8% is the part we genuinely cannot
     predict, and a bar that sits full while nothing happens is the
     thing people learn not to trust. */
  bar.style.width = `${Math.min(elapsed / TYPICAL_WAKE_MS, 1) * 92}%`;

  if (elapsed > TYPICAL_WAKE_MS && kicker.textContent === "Starting up") {
    kicker.textContent = "Still starting";
    estimateEl.textContent = "longer than usual";
    blurb.textContent =
      "This one is taking longer than the usual half minute. It is still " +
      "starting — leave the page open and it will go through on its own.";
  }
}

async function run() {
  setTimeout(() => {
    if (!settled) shell.dataset.visible = "true";
  }, REVEAL_DELAY_MS);

  const clock = setInterval(tick, 250);

  while (!settled && Date.now() - startedAt < GIVE_UP_MS) {
    if (await probe()) {
      clearInterval(clock);
      handOff();
      return;
    }
    await new Promise((r) => setTimeout(r, RETRY_GAP_MS));
  }

  clearInterval(clock);
  if (!settled) fail();
}

retry.addEventListener("click", () => location.reload());
run();
