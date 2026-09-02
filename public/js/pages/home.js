import { installSignedOutGuard, requireAuth } from '@/shared/lib/session.js';
import { initUserMenu, initEditProfile } from '@/features/auth/index.js';
import { loadSquad, initSquadSearchSortFilter, initSquadControls } from '@/features/squad/index.js';
import { initAddPlayerModal, initPlayerPopup } from '@/features/catalog/index.js';
import { loadGamePlans, initGamePlans } from '@/features/gamePlans/index.js';
import { initRoomHost, initRoomHub, redirectToActiveRoom } from '@/features/rooms/index.js';
import { showToast } from '@/shared/ui/toast.js';
import { takePendingToast } from '@/shared/ui/pendingToast.js';
import { installErrorReporter } from '@/shared/lib/errorReporter.js';

/* `error`, not `warn` — this page's toast has no warn variant. */
installErrorReporter({ notify: (message) => showToast(message, "error") });

/* Before anything fetches. Every call below is behind `requireSession`, and an
   account deleted from the console 401s all of them — this is what turns that
   into a sign-out instead of a page that keeps drawing around the failures. */
installSignedOutGuard();

/** Nav tab ↔ URL. `src/pages.js` serves `home.html` on all three, so a reload
    or a shared link lands on the tab named by the path rather than always on
    the first one. */
const TAB_PATHS = { team: "/players", plans: "/game-plans", rooms: "/rooms" };
const DEFAULT_TAB = "team";

/** `/` — the link every "back to home" button uses — and anything unrecognised
    fall back to the default tab. */
function tabFromPath(pathname) {
  return Object.keys(TAB_PATHS).find((tab) => TAB_PATHS[tab] === pathname) ?? DEFAULT_TAB;
}

function tabUrl(tab) {
  return TAB_PATHS[tab] + window.location.search + window.location.hash;
}

function showTab(target) {
  document.querySelectorAll(".nav-tab")
    .forEach((t) => t.classList.toggle("active", t.dataset.tab === target));
  document.querySelectorAll(".tab-panel")
    .forEach((p) => p.classList.toggle("active", p.id === target + "Panel"));
}

/** Nav tabs ↔ tab panels ↔ the address bar. Home-page chrome, so it lives with
    the page entry. */
function initTabs() {
  const initial = tabFromPath(window.location.pathname);
  showTab(initial);
  /* Normalises `/` to the tab it actually shows, so the URL always names the
     visible tab — including the one the user would copy out of the bar. */
  history.replaceState({ tab: initial }, "", tabUrl(initial));

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      if (!TAB_PATHS[target] || target === tabFromPath(window.location.pathname)) return;
      showTab(target);
      history.pushState({ tab: target }, "", tabUrl(target));
    });
  });

  /* Back/forward walks the tabs the user visited instead of leaving the page. */
  window.addEventListener("popstate", () => showTab(tabFromPath(window.location.pathname)));
}

/* Not inside `DOMContentLoaded`: a module script is deferred, so the DOM is
   already parsed by the time this runs, and the tab named by the URL has to be
   on screen from the first frame. Deferring it to the boot block below would
   leave the markup's own default — MY PLAYERS — showing until the seated-room
   fetch resolves. */
initTabs();

document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth();
  if (!user) return;

  /* Still seated in a room? Go there instead. Awaited before anything else
     boots, so a redirect does not first pay for the squad and game-plan
     fetches. */
  if (await redirectToActiveRoom(user.id)) return;

  /* Why you are back here — left by whichever room button walked you out. Read
     *after* the seated-room redirect, so a note is not consumed by a page the
     user only passes through. */
  const pending = takePendingToast();
  if (pending) showToast(pending.message, pending.variant === "warn" ? "error" : "info");

  initUserMenu(user);
  initEditProfile();
  initRoomHub();
  initRoomHost(user);
  initAddPlayerModal();
  initSquadSearchSortFilter();
  initPlayerPopup();
  initSquadControls(user.id);
  initGamePlans(user.id);
  await loadSquad(user.id);
  loadGamePlans(user.id);
});
