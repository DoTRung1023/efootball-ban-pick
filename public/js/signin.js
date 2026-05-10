/* ============================================================
   eFootball Ban & Pick — Sign In Page Scripts
   ============================================================ */

const CARD_IMG = (id) => `/img/card/${id}.png`;

// Fallback shown when the API is unavailable
// Mirrors /api/top-players: top 25 unique Epic/Highlight players by overall_max
const FALLBACK_PLAYERS = [
  { id: "89136409091415",  name: "Lionel Messi"       },
  { id: "89137214427270",  name: "Eden Hazard"         },
  { id: "89136677522134",  name: "George Best"         },
  { id: "89136140651034",  name: "Zlatan Ibrahimović"  },
  { id: "88040387119495",  name: "Pelé"                },
  { id: "88039581945329",  name: "Franco Baresi"       },
  { id: "88039581945324",  name: "Franz Beckenbauer"   },
  { id: "88039581945323",  name: "Johan Cruyff"        },
  { id: "106773692401975", name: "Vinícius Júnior"     },
  { id: "106771008057263", name: "Victor Osimhen"      },
  { id: "89138019757152",  name: "Bruno Fernandes"     },
  { id: "89134261635137",  name: "Luis Suárez"         },
  { id: "89133993205152",  name: "Neymar Jr"           },
  { id: "89133724764840",  name: "Gareth Bale"         },
  { id: "88041460993514",  name: "Ruud Gullit"         },
  { id: "88041460993461",  name: "Luís Figo"           },
  { id: "88040655690467",  name: "Jaap Stam"           },
  { id: "88040655554922",  name: "Gerd Müller"         },
  { id: "88040655554414",  name: "Gianfranco Zola"     },
  { id: "88040387251641",  name: "Carles Puyol"        },
  { id: "88040387126189",  name: "Pepe"                },
  { id: "88040387126185",  name: "Franck Ribéry"       },
  { id: "88040387120247",  name: "Petr Čech"           },
  { id: "88040387119839",  name: "Michel Platini"      },
  { id: "88040387118554",  name: "Samuel Eto'o"        },
];

/* ============================================================
   Fetch top players from the server API (all players, not just base)
   ============================================================ */
async function fetchTopPlayers() {
  try {
    const res = await fetch("/api/top-players");
    if (!res.ok) throw new Error("API error");
    const { players } = await res.json();
    if (!players?.length) throw new Error("empty");
    return players;
  } catch {
    return FALLBACK_PLAYERS;
  }
}

/* ============================================================
   Floating Background Cards
   ============================================================ */
function renderBackgroundCards(players) {
  const container = document.getElementById("playerCardsBg");
  if (!container) return;

  const positions = [
    { left: "3%",  top: "8%"  }, { left: "88%", top: "5%"  },
    { left: "6%",  top: "45%" }, { left: "85%", top: "40%" },
    { left: "2%",  top: "75%" }, { left: "87%", top: "70%" },
    { left: "18%", top: "3%"  }, { left: "72%", top: "2%"  },
    { left: "15%", top: "88%" }, { left: "75%", top: "85%" },
    { left: "40%", top: "1%"  }, { left: "55%", top: "92%" },
  ];

  const shuffled = [...players].sort(() => Math.random() - 0.5);

  positions.forEach((pos, i) => {
    const player = shuffled[i % shuffled.length];
    const el = document.createElement("div");
    el.className = "bg-player-card";

    const rotate = (Math.random() * 24 - 12).toFixed(1);
    const duration = (14 + Math.random() * 12).toFixed(1);
    const delay = (Math.random() * 8).toFixed(1);

    el.style.cssText = `
      left: ${pos.left};
      top: ${pos.top};
      --card-rotate: ${rotate}deg;
      --card-duration: ${duration}s;
      --card-delay: -${delay}s;
    `;

    const img = document.createElement("img");
    img.src = CARD_IMG(player.id);
    img.alt = player.name;
    img.loading = "lazy";
    img.onerror = () => { el.style.display = "none"; };

    el.appendChild(img);
    container.appendChild(el);
  });
}

/* ============================================================
   Featured Players Strip
   ============================================================ */
function renderStripPlayers(players) {
  const strip = document.getElementById("stripPlayers");
  if (!strip) return;

  // Double the list for seamless loop
  [...players, ...players].forEach((player) => {
    const card = document.createElement("div");
    card.className = "strip-card";

    const img = document.createElement("img");
    img.src = CARD_IMG(player.id);
    img.alt = player.name;
    img.loading = "lazy";
    img.onerror = () => { card.style.display = "none"; };

    card.appendChild(img);
    strip.appendChild(card);
  });
}

async function initPlayers() {
  // Render fallback immediately so the UI isn't empty
  renderBackgroundCards(FALLBACK_PLAYERS);
  renderStripPlayers(FALLBACK_PLAYERS);

  // Fetch real data in the background and swap if it differs
  const players = await fetchTopPlayers();
  const firstFetchedId = players[0]?.id;
  const firstFallbackId = FALLBACK_PLAYERS[0]?.id;

  if (firstFetchedId !== firstFallbackId) {
    // Clear and re-render with fresh data
    const bg = document.getElementById("playerCardsBg");
    const strip = document.getElementById("stripPlayers");
    if (bg) bg.innerHTML = "";
    if (strip) strip.innerHTML = "";
    renderBackgroundCards(players);
    renderStripPlayers(players);
  }
}

/* ============================================================
   Particles
   ============================================================ */
function initParticles() {
  const container = document.getElementById("particles");
  if (!container) return;

  for (let i = 0; i < 30; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    p.style.cssText = `
      --x: ${Math.random() * 100}%;
      --duration: ${6 + Math.random() * 10}s;
      --delay: ${Math.random() * 12}s;
      width: ${1 + Math.random() * 3}px;
      height: ${1 + Math.random() * 3}px;
      opacity: 0;
    `;
    container.appendChild(p);
  }
}

/* ============================================================
   Password Toggle
   ============================================================ */
function initPasswordToggle() {
  const btn = document.getElementById("togglePassword");
  const input = document.getElementById("password");
  if (!btn || !input) return;

  btn.addEventListener("click", () => {
    const isText = input.type === "text";
    input.type = isText ? "password" : "text";

    const icon = btn.querySelector(".eye-icon");
    if (icon) {
      icon.innerHTML = isText
        ? `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
        : `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
    }
  });
}

/* ============================================================
   Toast Helper
   ============================================================ */
let toastTimer = null;

function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast show ${type}`;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

/* ============================================================
   Form Validation & Submission
   ============================================================ */
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

function initForm() {
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
      showToast("Welcome back, " + data.username + "!", "success");

      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
    } catch {
      showToast("Network error. Please try again.", "error");
      btn.classList.remove("loading");
      btn.disabled = false;
    }
  });
}

/* ============================================================
   Sign Up Modal
   ============================================================ */
function initSignupModal() {
  const overlay   = document.getElementById("signupOverlay");
  const openBtn   = document.querySelector(".signup-link");
  const closeBtn  = document.getElementById("signupClose");
  const backBtn   = document.getElementById("backToSignin");
  const form      = document.getElementById("signupForm");
  const submitBtn = document.getElementById("signupBtn");

  if (!overlay || !openBtn || !form) return;

  // Password toggle for signup modal
  const toggleBtn = document.getElementById("toggleSuPassword");
  const pwInput   = document.getElementById("su-password");
  if (toggleBtn && pwInput) {
    toggleBtn.addEventListener("click", () => {
      const isText = pwInput.type === "text";
      pwInput.type = isText ? "password" : "text";
      const icon = toggleBtn.querySelector(".eye-icon");
      if (icon) {
        icon.innerHTML = isText
          ? `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
          : `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
      }
    });
  }

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

/* ============================================================
   Boot
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  initParticles();
  initPlayers();
  initPasswordToggle();
  initForm();
  initSignupModal();
});
