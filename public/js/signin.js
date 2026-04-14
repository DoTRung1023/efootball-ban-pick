/* ============================================================
   eFootball Ban & Pick — Sign In Page Scripts
   ============================================================ */

const CARD_IMG = (id) => `https://pesdb.net/assets/img/card/f${id}.png`;

// Fallback list shown while the API loads or if it fails
const FALLBACK_PLAYERS = [
  { id: "110718", name: "Mbappé"       },
  { id: "133543", name: "Haaland"      },
  { id: "117047", name: "Vinícius Jr." },
  { id: "110644", name: "Raphinha"     },
  { id: "47287",  name: "H. Kane"      },
  { id: "162114", name: "L. Yamal"     },
  { id: "135067", name: "Vitinha"      },
  { id: "133157", name: "Pedri"        },
  { id: "127544", name: "B. Saka"      },
  { id: "110815", name: "Rodri"        },
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
      await new Promise((resolve) => setTimeout(resolve, 1200));

      showToast("Signing in… Welcome back!", "success");

      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } catch {
      showToast("Something went wrong. Please try again.", "error");
      btn.classList.remove("loading");
      btn.disabled = false;
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
});
