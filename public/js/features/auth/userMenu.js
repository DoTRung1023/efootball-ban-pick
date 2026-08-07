/* ============================================================
   Account menu in the nav bar — identity, sign out, edit profile
   ============================================================ */

import { openEditProfile } from "./editProfile.js";

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
