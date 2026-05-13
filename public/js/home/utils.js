/* ============================================================
   Shared utilities — imported by all home sub-modules
   ============================================================ */

/* ============================================================
   eFootball Ban & Pick — Home Page
   ============================================================ */

export const CARD_IMG    = (id) => `/img/card/${id}.png`;
export const ANON_PLAYER_IMG = "/img/anonymous_player.jpeg";
export const PAGE_SIZE   = 50;
export const POS_DEF     = ["CB","LB","RB"];
export const POS_MID     = ["CMF","DMF", "RMF", "LMF", "AMF"];
export const POS_FWD     = ["RWF","LWF","CF","SS"];

export function makePlayerImg(src, alt = "Player image") {
  const img = document.createElement("img");
  img.src = src || ANON_PLAYER_IMG;
  img.alt = alt;
  img.loading = "lazy";
  img.addEventListener("error", () => {
    if (img.dataset.fallbackApplied === "1") {
      return;
    }
    img.dataset.fallbackApplied = "1";
    img.src = ANON_PLAYER_IMG;
  });
  return img;
}

/* ============================================================
   Auth
   ============================================================ */
export function getUser() {
  try { return JSON.parse(localStorage.getItem("efb_user") || "null"); }
  catch { return null; }
}

export function requireAuth() {
  const user = getUser();
  if (!user) { window.location.href = "/signin"; return null; }
  return user;
}

/* ============================================================
   Confirm Dialog
   ============================================================ */
export let _confirmResolve = null;

export function showConfirm(message) {
  return new Promise((resolve) => {
    _confirmResolve = resolve;
    const overlay = document.getElementById("confirmOverlay");
    const msgEl   = document.getElementById("confirmMessage");
    if (msgEl) msgEl.textContent = message;
    overlay?.classList.add("open");
  });
}

export function _closeConfirm(result) {
  document.getElementById("confirmOverlay")?.classList.remove("open");
  if (_confirmResolve) { _confirmResolve(result); _confirmResolve = null; }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("confirmOk")?.addEventListener("click",     () => _closeConfirm(true));
  document.getElementById("confirmCancel")?.addEventListener("click", () => _closeConfirm(false));
  document.getElementById("confirmOverlay")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("confirmOverlay")) _closeConfirm(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("confirmOverlay")?.classList.contains("open"))
      _closeConfirm(false);
  });
});

/* ============================================================
   Toast
   ============================================================ */
export let toastTimer = null;
export function showToast(message, type = "info") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}

/* ============================================================
   User Menu
   ============================================================ */
export function initUserMenu(user) {
  const avatar   = document.getElementById("userAvatar");
  const name     = document.getElementById("userName");
  const menu     = document.getElementById("userMenu");
  const trigger  = document.getElementById("userTrigger");
  const dropUser = document.getElementById("dropUsername");
  const dropMail = document.getElementById("dropEmail");

  if (avatar)   avatar.textContent   = user.username[0].toUpperCase();
  if (name)     name.textContent     = user.username;
  if (dropUser) dropUser.textContent = user.username;
  if (dropMail) dropMail.textContent = user.email;

  trigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle("open");
    trigger.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", (e) => {
    if (!menu?.contains(e.target)) {
      menu?.classList.remove("open");
      trigger?.setAttribute("aria-expanded", "false");
    }
  });

  document.getElementById("signOutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("efb_user");
    window.location.href = "/signin";
  });

  document.getElementById("editProfileBtn")?.addEventListener("click", () => {
    menu?.classList.remove("open");
    trigger?.setAttribute("aria-expanded", "false");
    openEditProfile();
  });
}

/* ============================================================
   Edit Profile Modal
   ============================================================ */
export function openEditProfile() {
  const user = getUser();
  if (!user) return;

  document.getElementById("epUsername").value = user.username || "";
  document.getElementById("epEmail").value    = user.email    || "";
  document.getElementById("epPassword").value = "";
  document.getElementById("epConfirm").value  = "";
  clearEpErrors();

  document.getElementById("epOverlay")?.classList.add("open");
}

export function closeEditProfile() {
  document.getElementById("epOverlay")?.classList.remove("open");
}

export function clearEpErrors() {
  ["epUsernameErr", "epEmailErr", "epPasswordErr", "epConfirmErr"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });
  ["epUsername", "epEmail", "epPassword", "epConfirm"].forEach((id) => {
    document.getElementById(id)?.classList.remove("error");
  });
}

export function initEditProfile() {
  const overlay = document.getElementById("epOverlay");
  const form    = document.getElementById("epForm");

  document.getElementById("epClose")?.addEventListener("click", closeEditProfile);
  overlay?.addEventListener("click", (e) => { if (e.target === overlay) closeEditProfile(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay?.classList.contains("open")) closeEditProfile();
  });

  // Block copy/cut on password fields
  ["epPassword", "epConfirm"].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener("copy", (e) => e.preventDefault());
    el?.addEventListener("cut",  (e) => e.preventDefault());
  });

  // Password toggle
  document.getElementById("epPwToggle")?.addEventListener("click", () => {
    const inp = document.getElementById("epPassword");
    inp.type = inp.type === "password" ? "text" : "password";
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearEpErrors();

    const user     = getUser();
    if (!user) return;

    const username = document.getElementById("epUsername").value.trim();
    const email    = document.getElementById("epEmail").value.trim();
    const password = document.getElementById("epPassword").value;
    const confirm  = document.getElementById("epConfirm").value;
    const submit   = document.getElementById("epSubmit");

    // Client-side validation
    let valid = true;
    if (!username || username.length < 3) {
      document.getElementById("epUsernameErr").textContent = "Username must be at least 3 characters.";
      document.getElementById("epUsername").classList.add("error");
      valid = false;
    } else if (username.length > 50) {
      document.getElementById("epUsernameErr").textContent = "Username must be 50 characters or fewer.";
      document.getElementById("epUsername").classList.add("error");
      valid = false;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      document.getElementById("epEmailErr").textContent = "Enter a valid email address.";
      document.getElementById("epEmail").classList.add("error");
      valid = false;
    }
    if (password && password.length < 6) {
      document.getElementById("epPasswordErr").textContent = "Password must be at least 6 characters.";
      document.getElementById("epPassword").classList.add("error");
      valid = false;
    }
    if (password && password !== confirm) {
      document.getElementById("epConfirmErr").textContent = "Passwords do not match.";
      document.getElementById("epConfirm").classList.add("error");
      valid = false;
    }
    if (!valid) return;

    submit.disabled = true;
    submit.textContent = "SAVING…";

    try {
      const body = { userId: user.id, username, email };
      if (password) body.password = password;

      const res  = await fetch("/api/profile", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        const errEl = data.field
          ? document.getElementById(`ep${data.field.charAt(0).toUpperCase() + data.field.slice(1)}Err`)
          : null;
        if (errEl) {
          errEl.textContent = data.error;
          document.getElementById(`ep${data.field.charAt(0).toUpperCase() + data.field.slice(1)}`)?.classList.add("error");
        } else {
          showToast(data.error || "Something went wrong.", "error");
        }
        return;
      }

      // Persist updated user info
      const updated = { ...user, ...data.user };
      localStorage.setItem("efb_user", JSON.stringify(updated));

      // Refresh displayed name & email in nav
      document.getElementById("userName").textContent   = updated.username;
      document.getElementById("dropUsername").textContent = updated.username;
      document.getElementById("dropEmail").textContent    = updated.email;

      showToast("Profile updated successfully.");
      closeEditProfile();
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      submit.disabled = false;
      submit.textContent = "SAVE CHANGES";
    }
  });
}

/* ============================================================
   Tabs
   ============================================================ */
export function initTabs() {
  const tabs   = document.querySelectorAll(".nav-tab");
  const panels = document.querySelectorAll(".tab-panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((t)   => t.classList.toggle("active", t.dataset.tab === target));
      panels.forEach((p) => p.classList.toggle("active", p.id === target + "Panel"));
    });
  });
}

/* ============================================================
   Helpers
   ============================================================ */
export function posClass(pos) {
  if (!pos) return "pos-other";
  if (pos === "GK")           return "pos-gk";
  if (POS_DEF.includes(pos)) return "pos-def";
  if (POS_MID.includes(pos)) return "pos-mid";
  if (POS_FWD.includes(pos)) return "pos-fwd";
  return "pos-other";
}

/* ============================================================
   POSITION UTILITIES
   ============================================================ */

export const POSITION_LINE_ORDER = ["CF", "SS", "RWF", "LWF", "AMF", "RMF", "LMF", "CMF", "DMF", "RB", "LB", "CB", "GK"];

export function positionLineRank(pos) {
  const p = String(pos || "").toUpperCase().trim();
  const i = POSITION_LINE_ORDER.indexOf(p);
  return i === -1 ? POSITION_LINE_ORDER.length : i;
}

/** When the primary sort key ties, order by overall (highest first), then name. */
export function tiebreakOverallDescThenName(a, b) {
  const oa = Number(a.overall ?? -1);
  const ob = Number(b.overall ?? -1);
  if (ob !== oa) return ob - oa;
  return (a.name || "").localeCompare(b.name || "");
}

/** Max OVR for sorting; falls back to level-1 overall when max is unknown. */
export function ovrMaxForSort(p) {
  const mx = p?.overall_max;
  if (mx != null && Number.isFinite(Number(mx))) return Number(mx);
  if (p?.overall != null && Number.isFinite(Number(p.overall))) return Number(p.overall);
  return -1;
}

/** When overall rating ties: line order CF→…→GK, then name. */
export function tiebreakPositionLineThenName(a, b) {
  const ra = positionLineRank(a.position);
  const rb = positionLineRank(b.position);
  if (ra !== rb) return ra - rb;
  return (a.name || "").localeCompare(b.name || "");
}

export function compareByPositionLine(a, b, forwardCfToGk) {
  const ra = positionLineRank(a.position);
  const rb = positionLineRank(b.position);
  if (ra !== rb) return forwardCfToGk ? ra - rb : rb - ra;
  return tiebreakOverallDescThenName(a, b);
}

export function openDdPanel(panelId, btnId) {
  const panel = document.getElementById(panelId);
  const btn   = document.getElementById(btnId);
  panel?.classList.add("open");
  btn?.classList.add("open");
  btn?.setAttribute("aria-expanded", "true");
}

export function closeDdPanel(panelId, btnId) {
  const panel = document.getElementById(panelId);
  const btn   = document.getElementById(btnId);
  panel?.classList.remove("open");
  btn?.classList.remove("open");
  btn?.setAttribute("aria-expanded", "false");
}

export function toggleDdPanel(panelId, btnId, otherPanelId, otherBtnId) {
  const panel = document.getElementById(panelId);
  if (panel?.classList.contains("open")) {
    closeDdPanel(panelId, btnId);
  } else {
    closeDdPanel(otherPanelId, otherBtnId);
    openDdPanel(panelId, btnId);
  }
}

export function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

/**
 * Stacked lines (each "/" in the spec = newline): region - country; league - club; foot - style; H - W - age.
 * Hyphens only within a line. Catalog, popup, plan picker, squad footer.
 */
export function playerDetailSublineHtml(player) {
  const h = (s) => (s != null && String(s).trim() ? escapeHtml(String(s).trim()) : "");
  const hyph = `<span class="pmeta-sep pmeta-hyphen"> · </span>`;

  function dashLine(...raw) {
    const bits = raw
      .filter((v) => v != null && String(v).trim())
      .map((v) => h(String(v).trim()));
    return bits.length ? bits.join(hyph) : "";
  }

  const phys = [
    player.height ? `${player.height} cm` : null,
    player.weight ? `${player.weight} kg` : null,
    player.age ? `${player.age} yo` : null,
  ];

  const rows = [
    dashLine(player.region, player.nationality),
    dashLine(player.league, player.club),
    dashLine(player.foot, player.playing_style),
    dashLine(...phys),
  ].filter(Boolean);

  if (!rows.length) {
    return `<div class="pmeta-stack"><div class="pmeta-row pmeta-empty">—</div></div>`;
  }
  return `<div class="pmeta-stack">${rows.map((line) => `<div class="pmeta-row">${line}</div>`).join("")}</div>`;
}

// Generate tooltip text with all player detail info (for card titles).
export function playerDetailTooltipText(player) {
  if (!player) return "";
  const h = (s) => (s != null && String(s).trim() ? String(s).trim() : "");

  function dashLine(...raw) {
    const bits = raw
      .filter((v) => v != null && String(v).trim())
      .map((v) => h(String(v).trim()));
    return bits.length ? bits.join(" · ") : "";
  }

  const phys = [
    player.height ? `${player.height} cm` : null,
    player.weight ? `${player.weight} kg` : null,
    player.age ? `${player.age} yo` : null,
  ];

  const rows = [
    dashLine(player.region, player.nationality),
    dashLine(player.league, player.club),
    dashLine(player.foot, player.playing_style),
    dashLine(...phys),
  ].filter(Boolean);

  return rows.length ? rows.join("\n") : "—";
}

/** Both ratings known — show level 1 and max side by side (compact layout in catalog rows). */
export function hasFullOvrPair(p) {
  return p?.overall != null && p?.overall_max != null;
}

/** HTML snippet: Level 1 and max OVR (uses overall + overall_max from API). */
export function ovrPairInnerHtml(p) {
  if (p?.overall == null && p?.overall_max == null) return "—";
  if (hasFullOvrPair(p)) {
    return (
      `<span class="ovr-pair" title="Level 1 / Max level">` +
      `<span class="ovr-l1">${escapeHtml(String(p.overall))}</span>` +
      `<span class="ovr-slash">/</span>` +
      `<span class="ovr-max">${escapeHtml(String(p.overall_max))}</span>` +
      `</span>`
    );
  }
  if (p?.overall != null) return escapeHtml(String(p.overall));
  return escapeHtml(String(p.overall_max ?? ""));
}

