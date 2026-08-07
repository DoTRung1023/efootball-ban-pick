/* ============================================================
   Home page shell — nav user menu, edit-profile modal, tabs

   Everything that more than one feature needs has moved out to
   `@/shared/{lib,ui,players}/` — import from there rather than adding to this
   file. What is left is the home page's own chrome.
   ============================================================ */

import { getUser } from "@/shared/lib/session.js";
import { showToast } from "@/shared/ui/toast.js";

/* ============================================================
   User Menu
   ============================================================ */
export function initUserMenu(user) {
  const name     = document.getElementById("userName");
  const menu     = document.getElementById("userMenu");
  const trigger  = document.getElementById("userTrigger");
  const dropUser = document.getElementById("dropUsername");
  const dropMail = document.getElementById("dropEmail");

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
