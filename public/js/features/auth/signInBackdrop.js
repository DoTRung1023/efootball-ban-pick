/* ============================================================
   Sign-in page — the ambient player art

   Two decorative layers off one list: card art falling down the page behind
   the form, and the TOP PLAYERS THIS SEASON strip running horizontally under
   it. Nothing here gates sign-in, and nothing here carries information — if
   both layers failed to render, the page would still work.

   Both layers draw from `/api/top-players` — the list an admin curates in the
   console's SHOWCASE tab — and from the same `/img/card/:id.png` URLs, so the
   falling cards cost no requests the strip has not already made. If that call
   gives nothing, neither layer draws.

   This is the one screen in the app allowed ambient motion — see DESIGN.md
   §7. `prefers-reduced-motion` drops the falling layer and stops the strip;
   that lives in `auth.css`, not here, so there is one copy of the rule.
   ============================================================ */

import { CARD_IMG } from "@/shared/players/playerMeta.js";

/** The showcase pool, or an empty list. Both layers are decorative, so there
    is nothing to fall back *to* — see `initPlayers`. */
async function fetchTopPlayers() {
  try {
    const res = await fetch("/api/top-players");
    if (!res.ok) return [];
    const { players } = await res.json();
    return players?.length ? players : [];
  } catch {
    return [];
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

    /* Depth drives size, speed, opacity and blur together: a bigger card reads
       as nearer, so it has to fall faster, sit more solid and be the sharper
       one. Vary any of them without the rest and the layer goes flat. */
    const size = 96 + depth * 100;     // 96–196px
    const duration = 40 - depth * 16;  // 40s far → 24s near
    const opacity = 0.24 + depth * 0.34;
    const blur = 3.6 - depth * 2.4;    // 3.6px far → 1.2px near

    const px = (n) => `${n.toFixed(0)}px`;
    el.style.setProperty("--fall-x", `${(lanes[i] * lane + Math.random() * lane * 0.7).toFixed(2)}%`);
    el.style.setProperty("--fall-size", px(size));
    el.style.setProperty("--fall-duration", `${duration.toFixed(1)}s`);
    /* Negative, so every card is already mid-fall on the first frame and the
       page never opens on an empty sky waiting for the first one to arrive. */
    const phase = (phases[i] + Math.random()) / FALLING_CARD_COUNT;
    el.style.setProperty("--fall-delay", `-${(phase * duration).toFixed(1)}s`);
    el.style.setProperty("--fall-opacity", opacity.toFixed(2));
    el.style.setProperty("--fall-blur", `${blur.toFixed(1)}px`);
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

/**
 * Fetch once, render once.
 *
 * This used to paint a hardcoded copy of the list first and then swap the real
 * one in over the top. That cost a full strip re-render and fourteen fresh
 * `/img/card/:id.png` requests on a normal load — against the one endpoint in
 * the app that bills per miss — and it only skipped that work when the stored
 * list happened to match the built-in one exactly. Now that the list is
 * curated from the console, matching is not something to design around.
 *
 * An empty answer renders nothing, deliberately. Both layers are decoration;
 * the page works without either, and the alternative is showing a visitor a
 * list of players an admin has already taken down. `initPlayers` is not
 * awaited by `pages/signin.js`, so the form never waits on this.
 */
export async function initPlayers() {
  const players = await fetchTopPlayers();
  /* Also the guard for the renderers: both index with `i % players.length`,
     which is NaN on an empty list. */
  if (!players.length) return;

  renderFallingCards(players);
  renderStripPlayers(players);
}
