/* ============================================================
   Sign-in page — the TOP PLAYERS THIS SEASON strip

   Purely visual; nothing here gates sign-in. The fallback list renders
   immediately so the page is never empty, then `/api/top-players` swaps in
   real data if it returns something different.

   The rotated floating card art that used to sit behind the form went with the
   re-skin: it was decoration on an animation, and the new surface rule is a
   flat --bg (DESIGN.md §7).
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
  renderStripPlayers(FALLBACK_PLAYERS);

  // Fetch real data in the background and swap if it differs
  const players = await fetchTopPlayers();
  const firstFetchedId = players[0]?.id;
  const firstFallbackId = FALLBACK_PLAYERS[0]?.id;

  if (firstFetchedId !== firstFallbackId) {
    // Clear and re-render with fresh data
    const strip = document.getElementById("stripPlayers");
    if (strip) strip.innerHTML = "";
    renderStripPlayers(players);
  }
}

