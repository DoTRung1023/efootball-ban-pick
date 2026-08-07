/* ============================================================
   Sign-up modal — POST /api/signup

   Creating an account does not sign you in; on success the modal closes and
   the user signs in through the form behind it.
   ============================================================ */

import { showToast } from "@/shared/ui/toast.js";
import { bindPasswordToggle } from "./passwordToggle.js";

export function initSignupModal() {
  const overlay   = document.getElementById("signupOverlay");
  const openBtn   = document.querySelector(".signup-link");
  const closeBtn  = document.getElementById("signupClose");
  const backBtn   = document.getElementById("backToSignin");
  const form      = document.getElementById("signupForm");
  const submitBtn = document.getElementById("signupBtn");

  if (!overlay || !openBtn || !form) return;

  bindPasswordToggle("toggleSuPassword", "su-password");

  function openModal() {
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    setTimeout(() => document.getElementById("su-username")?.focus(), 80);
  }

  function closeModal() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    form.reset();
    form.querySelectorAll(".field-input").forEach((el) => {
      el.classList.remove("invalid");
    });
    form.querySelectorAll(".field-error").forEach((el) => {
      el.textContent = "";
      el.classList.remove("show");
    });
  }

  openBtn.addEventListener("click", (e) => { e.preventDefault(); openModal(); });
  closeBtn?.addEventListener("click", closeModal);
  backBtn?.addEventListener("click", (e) => { e.preventDefault(); closeModal(); });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeModal();
  });

  // Inline field validation for signup
  function validateSignupField(input) {
    const value = input.value.trim();
    let error = "";

    if (input.id === "su-username") {
      if (!value) error = "Username is required.";
      else if (value.length < 3) error = "Username must be at least 3 characters.";
      else if (value.length > 50) error = "Username must be 50 characters or fewer.";
    }

    if (input.id === "su-email") {
      if (!value) error = "Email is required.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) error = "Enter a valid email address.";
    }

    if (input.id === "su-password") {
      if (!value) error = "Password is required.";
      else if (value.length < 6) error = "Password must be at least 6 characters.";
    }

    if (input.id === "su-confirm") {
      const pw = document.getElementById("su-password")?.value || "";
      if (!value) error = "Please confirm your password.";
      else if (value !== pw) error = "Passwords do not match.";
    }

    const wrap = input.closest(".field-group");
    let errEl  = wrap?.querySelector(".field-error");
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
    }
    input.classList.remove("invalid");
    errEl.textContent = "";
    errEl.classList.remove("show");
    return true;
  }

  const signupFields = ["su-username", "su-email", "su-password", "su-confirm"].map(
    (id) => document.getElementById(id),
  ).filter(Boolean);

  signupFields.forEach((input) => {
    input.addEventListener("blur", () => validateSignupField(input));
    input.addEventListener("input", () => {
      if (input.classList.contains("invalid")) validateSignupField(input);
      // Re-validate confirm when password changes
      if (input.id === "su-password") {
        const confirm = document.getElementById("su-confirm");
        if (confirm?.classList.contains("invalid")) validateSignupField(confirm);
      }
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const allValid = signupFields.map((f) => validateSignupField(f)).every(Boolean);
    if (!allValid) return;

    submitBtn.classList.add("loading");
    submitBtn.disabled = true;

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: document.getElementById("su-username").value.trim(),
          email:    document.getElementById("su-email").value.trim().toLowerCase(),
          password: document.getElementById("su-password").value,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || "Sign up failed.", "error");
        submitBtn.classList.remove("loading");
        submitBtn.disabled = false;
        return;
      }

      showToast("Account created! You can now sign in.", "success");
      setTimeout(() => closeModal(), 1800);
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      submitBtn.classList.remove("loading");
      submitBtn.disabled = false;
    }
  });
}
