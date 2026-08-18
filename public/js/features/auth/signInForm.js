/* ============================================================
   Sign-in form — POST /api/signin, then persist the session

   `efb_user` in localStorage is the whole session; every other page reads it
   back through `@/shared/lib/session.js`.
   ============================================================ */

import { showToast } from "@/shared/ui/toast.js";
import { setPendingToast } from "@/shared/ui/pendingToast.js";
import { bindPasswordToggle } from "./passwordToggle.js";

function validateField(input) {
  const value = input.value.trim();
  let error = "";

  if (input.id === "username") {
    if (!value) error = "Username is required.";
    else if (value.length < 2) error = "Too short.";
  }

  if (input.id === "password") {
    if (!value) error = "Password is required.";
    else if (value.length < 4) error = "Password must be at least 4 characters.";
  }

  const wrap = input.closest(".field-group");
  let errEl = wrap?.querySelector(".field-error");

  if (!errEl) {
    errEl = document.createElement("p");
    errEl.className = "field-error";
    wrap?.appendChild(errEl);
  }

  if (error) {
    input.classList.add("invalid");
    errEl.textContent = error;
    errEl.classList.add("show");
    return false;
  } else {
    input.classList.remove("invalid");
    errEl.textContent = "";
    errEl.classList.remove("show");
    return true;
  }
}

export function initPasswordToggle() {
  bindPasswordToggle("togglePassword", "password");
}

export function initForm() {
  const form = document.getElementById("signinForm");
  const btn = document.getElementById("signinBtn");
  if (!form || !btn) return;

  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");

  [usernameInput, passwordInput].forEach((input) => {
    if (!input) return;
    input.addEventListener("blur", () => validateField(input));
    input.addEventListener("input", () => {
      if (input.classList.contains("invalid")) validateField(input);
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const validUsername = validateField(usernameInput);
    const validPassword = validateField(passwordInput);
    if (!validUsername || !validPassword) return;

    btn.classList.add("loading");
    btn.disabled = true;

    try {
      const res = await fetch("/api/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: usernameInput.value.trim(),
          password: passwordInput.value,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || "Sign in failed.", "error");
        btn.classList.remove("loading");
        btn.disabled = false;
        return;
      }

      localStorage.setItem("efb_user", JSON.stringify(data));
      /* The greeting belongs to the page it is greeting you *on*. It used to be
         shown here behind a 1s `setTimeout` whose only job was to let a bit of
         it be read before this page was replaced — a second of dead time to
         half-show a message. Stashed, it arrives whole and the redirect can be
         immediate. */
      setPendingToast("Welcome back, " + data.username + "!", "success");
      window.location.href = "/";
    } catch {
      showToast("Network error. Please try again.", "error");
      btn.classList.remove("loading");
      btn.disabled = false;
    }
  });
}
