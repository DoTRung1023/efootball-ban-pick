/* ============================================================
   Shared by the home and room bundles

   Both pages render the same player card art and the same metadata block, so
   these live in one place instead of being kept in sync by hand. Each bundle
   re-exports them from its own utils module (`home/utils.js`,
   `room/players.js`, `room/constants.js`, `room/utils.js`), so every existing
   import site keeps working unchanged — import from your bundle as before.
   ============================================================ */

export const CARD_IMG = (id) => `/img/card/${id}.png`;
export const ANON_PLAYER_IMG = "/img/anonymous_player.jpeg";

/**
 * Escapes text for interpolation into HTML — including into an *attribute*.
 *
 * The home bundle previously used a DOM-based version (`div.textContent` read
 * back as `innerHTML`), which does not escape `"`. That is safe in text
 * position but silently allows attribute injection the moment a caller writes
 * `title="${escapeHtml(v)}"` — which the room bundle does in several places.
 * This version escapes quotes too, and keeps the home version's null handling
 * (`null`/`undefined` → empty string, not the text "null").
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function makePlayerImg(src, alt = "Player image") {
  const img = document.createElement("img");
  img.src = src || ANON_PLAYER_IMG;
  img.alt = alt;
  img.loading = "lazy";
  img.addEventListener("error", () => {
    if (img.dataset.fallbackApplied === "1") return;
    img.dataset.fallbackApplied = "1";
    img.src = ANON_PLAYER_IMG;
  });
  return img;
}

/** The four metadata lines shared by both bundles, as rows or as plain text. */
function detailRows(player, joiner) {
  const dashLine = (...raw) => {
    const bits = raw
      .filter((v) => v != null && String(v).trim())
      .map((v) => String(v).trim());
    return bits.length ? bits : null;
  };

  const phys = [
    player.height ? `${player.height} cm` : null,
    player.weight ? `${player.weight} kg` : null,
    player.age ? `${player.age} yo` : null,
  ];

  return [
    dashLine(player.region, player.nationality),
    dashLine(player.league, player.club),
    dashLine(player.foot, player.playing_style),
    dashLine(...phys),
  ].filter(Boolean).map(joiner);
}

/**
 * Stacked lines (each "/" in the spec = newline): region - country; league - club;
 * foot - style; H - W - age. Hyphens only within a line.
 * Catalog, popup, plan picker, squad footer.
 */
export function playerDetailSublineHtml(player) {
  const hyph = `<span class="pmeta-sep pmeta-hyphen"> · </span>`;
  const rows = detailRows(player, (bits) => bits.map(escapeHtml).join(hyph));

  if (!rows.length) {
    return `<div class="pmeta-stack"><div class="pmeta-row pmeta-empty">—</div></div>`;
  }
  return `<div class="pmeta-stack">${rows.map((line) => `<div class="pmeta-row">${line}</div>`).join("")}</div>`;
}

/** Same four lines as plain text, for card `title` tooltips. */
export function playerDetailTooltipText(player) {
  if (!player) return "";
  const rows = detailRows(player, (bits) => bits.join(" · "));
  return rows.length ? rows.join("\n") : "—";
}
