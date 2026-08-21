/* ============================================================
   Sign-in page — the ambient player art

   Two decorative layers off one list: card art falling down the page behind
   the form, and the TOP PLAYERS THIS SEASON strip running horizontally under
   it. Nothing here gates sign-in, and nothing here carries information — if
   both layers failed to render, the page would still work.

   The fallback list renders immediately so the page is never empty, then
   `/api/top-players` swaps in real data if it returns something different.
   Both layers draw from the same `/img/card/:id.png` URLs, so the falling
   cards cost no requests the strip has not already made.

   This is the one screen in the app allowed ambient motion — see DESIGN.md
   §7. `prefers-reduced-motion` drops the falling layer and stops the strip;
   that lives in `auth.css`, not here, so there is one copy of the rule.
   ============================================================ */

import { CARD_IMG } from "@/shared/players/playerMeta.js";

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

/* One card per lane, jittered inside it — random placement alone clumps, and
   a clump on a 12-card layer reads as a mistake rather than as weather. */
const FALLING_CARD_COUNT = 12;
const FALLING_LANE_SPAN = 92;  // % of viewport; the remainder is the card's own width

function cardArt(player, { decorative = false } = {}) {
  const img = document.createElement("img");
  img.src = CARD_IMG(player.id);
  /* The falling layer is `aria-hidden`; naming the players twice would make a
     screen reader read the whole top-25 list before reaching the form. */
  img.alt = decorative ? "" : player.name;
  img.loading = "lazy";
  return img;
}

function renderFallingCards(players) {
  const layer = document.getElementById("fallingCards");
  if (!layer) return;

  const lane = FALLING_LANE_SPAN / FALLING_CARD_COUNT;

  for (let i = 0; i < FALLING_CARD_COUNT; i++) {
    const player = players[i % players.length];
    const el = document.createElement("div");
    el.className = "falling-card";

    /* Depth drives size, speed and opacity together: a bigger card reads as
       nearer, so it has to fall faster and sit slightly more solid. Vary one
       without the others and the layer goes flat. */
    const depth = Math.random();
    const size = 52 + depth * 44;      // 52–96px
    const duration = 34 - depth * 13;  // 34s far → 21s near
    const opacity = 0.10 + depth * 0.12;

    const px = (n) => `${n.toFixed(0)}px`;
    el.style.setProperty("--fall-x", `${(i * lane + Math.random() * lane * 0.7).toFixed(2)}%`);
    el.style.setProperty("--fall-size", px(size));
    el.style.setProperty("--fall-duration", `${duration.toFixed(1)}s`);
    /* Negative, so every card is already mid-fall on the first frame and the
       page never opens on an empty sky waiting for the first one to arrive. */
    el.style.setProperty("--fall-delay", `-${(Math.random() * duration).toFixed(1)}s`);
    el.style.setProperty("--fall-opacity", opacity.toFixed(2));
    el.style.setProperty("--fall-drift", px(Math.random() * 80 - 40));
    el.style.setProperty("--fall-tilt", `${(Math.random() * 24 - 12).toFixed(1)}deg`);
    el.style.setProperty("--fall-spin", `${(Math.random() * 44 - 22).toFixed(1)}deg`);

    const img = cardArt(player, { decorative: true });
    img.onerror = () => { el.hidden = true; };
    el.appendChild(img);
    layer.appendChild(el);
  }
}

/* Swapped in place rather than re-rendered: rebuilding the layer would restart
   every animation, and twelve cards snapping back to the top of the viewport
   at once is the one moment this effect would be noticed. */
function swapFallingCards(players) {
  const layer = document.getElementById("fallingCards");
  if (!layer) return;

  [...layer.children].forEach((el, i) => {
    const img = el.querySelector("img");
    if (!img) return;
    const player = players[i % players.length];
    el.hidden = false;  // a fallback card whose art 404'd
    img.alt = "";
    img.src = CARD_IMG(player.id);
  });
}

function renderStripPlayers(players) {
  const strip = document.getElementById("stripPlayers");
  if (!strip) return;

  /* Listed twice: the marquee loops by shifting the track exactly one copy's
     width, which only lands seamlessly if the second copy is already there. */
  [...players, ...players].forEach((player) => {
    const card = document.createElement("div");
    card.className = "strip-card";

    const img = cardArt(player);
    img.onerror = () => { card.hidden = true; };

    card.appendChild(img);
    strip.appendChild(card);
  });
}

export async function initPlayers() {
  // Render fallback immediately so the UI isn't empty
  renderFallingCards(FALLBACK_PLAYERS);
  renderStripPlayers(FALLBACK_PLAYERS);

  // Fetch real data in the background and swap if it differs
  const players = await fetchTopPlayers();
  if (players[0]?.id === FALLBACK_PLAYERS[0]?.id) return;

  const strip = document.getElementById("stripPlayers");
  if (strip) strip.innerHTML = "";
  renderStripPlayers(players);
  swapFallingCards(players);
}
