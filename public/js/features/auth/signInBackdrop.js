/* ============================================================
   Sign-in page decoration — floating card art and drifting particles

   Purely visual; nothing here gates sign-in. The fallback list renders
   immediately so the page is never empty, then `/api/top-players` swaps in
   real data if it returns something different.
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

export async function initPlayers() {
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

export function initParticles() {
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
