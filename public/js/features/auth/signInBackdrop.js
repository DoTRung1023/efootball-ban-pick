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
   a clump on a fourteen-card layer reads as a mistake rather than as weather. */
const FALLING_CARD_COUNT = 14;
const FALLING_LANE_SPAN = 90;  // % of viewport; the remainder is the card's own width

function cardArt(player, { decorative = false } = {}) {
  const img = document.createElement("img");
  img.src = CARD_IMG(player.id);
  /* The falling layer is `aria-hidden`; naming the players twice would make a
     screen reader read the whole top-25 list before reaching the form. */
  img.alt = decorative ? "" : player.name;
  img.loading = "lazy";
  return img;
}

/* Fisher–Yates. Lanes are handed out in shuffled order because the cards are
   appended in depth order below, and `sort` + `i` would otherwise put every
   small card on the left of the screen and every large one on the right. */
function shuffled(n) {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderFallingCards(players) {
  const layer = document.getElementById("fallingCards");
  if (!layer) return;

  const lane = FALLING_LANE_SPAN / FALLING_CARD_COUNT;
  const lanes = shuffled(FALLING_CARD_COUNT);
  /* Same trick vertically. Vertical position is linear in time, so giving
     each card a phase from its own slice of the cycle spreads the fourteen
     evenly down the screen instead of letting chance pile six of them in one
     corner and leave the top empty. Shuffled for the same reason the lanes
     are: taken in order, the phase would track the depth sort below and every
     large card would sit at the bottom of the screen. */
  const phases = shuffled(FALLING_CARD_COUNT);
  /* Ascending, and appended in that order: these are absolutely positioned
     siblings, so DOM order *is* paint order. Far cards therefore go down
     first and near ones overlap them, which is the only thing making the
     layer read as having depth rather than as one flat plane. */
  const depths = Array.from({ length: FALLING_CARD_COUNT }, Math.random).sort((a, b) => a - b);

  depths.forEach((depth, i) => {
    const player = players[i % players.length];
    const el = document.createElement("div");
    el.className = "falling-card";

    /* Depth drives size, speed and opacity together: a bigger card reads as
       nearer, so it has to fall faster and sit more solid. Vary one without
       the others and the layer goes flat. */
    const size = 96 + depth * 100;     // 96–196px
    const duration = 40 - depth * 16;  // 40s far → 24s near
    const opacity = 0.24 + depth * 0.34;

    const px = (n) => `${n.toFixed(0)}px`;
    el.style.setProperty("--fall-x", `${(lanes[i] * lane + Math.random() * lane * 0.7).toFixed(2)}%`);
    el.style.setProperty("--fall-size", px(size));
    el.style.setProperty("--fall-duration", `${duration.toFixed(1)}s`);
    /* Negative, so every card is already mid-fall on the first frame and the
       page never opens on an empty sky waiting for the first one to arrive. */
    const phase = (phases[i] + Math.random()) / FALLING_CARD_COUNT;
    el.style.setProperty("--fall-delay", `-${(phase * duration).toFixed(1)}s`);
    el.style.setProperty("--fall-opacity", opacity.toFixed(2));
    /* Sway is the mid-fall flutter, drift is where it ends up. Sway is the
       larger of the two on purpose — a card that only drifts falls in a
       straight diagonal, which reads as sliding rather than falling. */
    el.style.setProperty("--fall-sway", px(Math.random() * 70 + 30));
    el.style.setProperty("--fall-drift", px(Math.random() * 90 - 45));
    el.style.setProperty("--fall-tilt", `${(Math.random() * 28 - 14).toFixed(1)}deg`);
    /* Tilt and spin compound, so the ceiling here is what decides the most
       tipped a card ever gets: 14 + 55 = 69°. Past ~90° it reads as upside
       down, which looks like a bug rather than like tumbling — the art has a
       name and a rating printed on it and both have to stay the right way up. */
    el.style.setProperty("--fall-spin", `${(Math.random() * 110 - 55).toFixed(1)}deg`);

    const img = cardArt(player, { decorative: true });
    img.onerror = () => { el.hidden = true; };
    el.appendChild(img);
    layer.appendChild(el);
  });
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
