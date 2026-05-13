import {
  CARD_IMG,
  ANON_PLAYER_IMG,
  DEFAULT_FORMATION,
  FORMATION_LAYOUTS,
  FIXED_PICKS_PER_SIDE,
} from './constants.js';
import { escapeHtml } from './utils.js';

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

export function normalizeFormation(f) {
  const s = String(f || "").trim();
  return FORMATION_LAYOUTS[s] ? s : DEFAULT_FORMATION;
}

export function getFormationLayout(formation) {
  return FORMATION_LAYOUTS[normalizeFormation(formation)] || FORMATION_LAYOUTS[DEFAULT_FORMATION];
}

export function getPlayerCardValue(player) {
  return player?.overall_rating ?? player?.overall_max ?? player?.overall ?? "—";
}

export function getPlayerImageSrc(player) {
  const id = player?.pesdb_id ?? player?.id;
  return id ? CARD_IMG(id) : ANON_PLAYER_IMG;
}

export function normalizeDraftPlayer(player) {
  return {
    id: String(player?.player_id ?? player?.id ?? ""),
    name: String(player?.name || ""),
    position: String(player?.position || "—"),
    overall_rating: player?.overall_rating ?? player?.overall_max ?? player?.overall ?? "—",
    nation: String(player?.nation || player?.nationality || "—"),
    club: String(player?.club || ""),
    pesdb_id: player?.pesdb_id ?? player?.player_id ?? player?.id ?? null,
    speed: player?.speed ?? "—",
    finishing: player?.finishing ?? "—",
    passing: player?.passing ?? "—",
    // Footer detail fields
    region: player?.region ?? "",
    nationality: player?.nationality ?? player?.nation ?? "",
    league: player?.league ?? "",
    foot: player?.foot ?? "",
    playing_style: player?.playing_style ?? "",
    height: player?.height ?? "",
    weight: player?.weight ?? "",
    age: player?.age ?? "",
  };
}

export function normalizeMySquadPlayerForDraft(player) {
  const catalogId = String(player?.pesdb_id || player?.id || "");
  return {
    id: catalogId,
    name: String(player?.name || ""),
    position: String(player?.position || "—"),
    overall_rating: player?.overall_max ?? player?.overall ?? "—",
    nation: String(player?.nationality || "—"),
    club: String(player?.club || ""),
    pesdb_id: player?.pesdb_id ?? player?.id ?? null,
    speed: "—",
    finishing: "—",
    passing: "—",
    // Footer detail fields (from My Players API response)
    region: player?.region ?? "",
    nationality: player?.nationality ?? "",
    league: player?.league ?? "",
    foot: player?.foot ?? "",
    playing_style: player?.playing_style ?? "",
    height: player?.height ?? "",
    weight: player?.weight ?? "",
    age: player?.age ?? "",
  };
}

export function normalizeApiPlayer(p) {
  const ovr = p.overall_max ?? p.overall ?? "—";
  return {
    id: String(p.id),
    name: p.name,
    position: p.position || "—",
    overall_rating: ovr,
    nation: p.nationality || "—",
    speed: "—",
    finishing: "—",
    passing: "—",
    _raw: p,
  };
}

export function mapPlayersBySlot(rows) {
  const map = {};
  (rows || []).forEach((row) => {
    const slot = Number(row?.slot);
    if (!Number.isFinite(slot) || slot < 1 || slot > FIXED_PICKS_PER_SIDE) return;
    map[slot] = normalizeDraftPlayer(row);
  });
  return map;
}

export function buildOrderedSlotMap(players) {
  const map = {};
  (players || []).forEach((player, idx) => {
    map[idx + 1] = normalizeDraftPlayer(player);
  });
  return map;
}

export function slotCardsSummary(players) {
  const count = Array.isArray(players) ? players.length : 0;
  return `${count}/${FIXED_PICKS_PER_SIDE}`;
}

export function playerDetailSublineHtml(player) {
  const h = (s) => (s != null && String(s).trim() ? escapeHtml(String(s).trim()) : "");
  const hyph = `<span class="pmeta-sep pmeta-hyphen"> · </span>`;

  function dashLine(...raw) {
    const bits = raw
      .filter((v) => v != null && String(v).trim())
      .map((v) => h(String(v).trim()));
    return bits.length ? bits.join(hyph) : "";
  }

  const phys = [
    player.height ? `${player.height} cm` : null,
    player.weight ? `${player.weight} kg` : null,
    player.age ? `${player.age} yo` : null,
  ];

  const rows = [
    dashLine(player.region, player.nationality),
    dashLine(player.league, player.club),
    dashLine(player.foot, player.playing_style),
    dashLine(...phys),
  ].filter(Boolean);

  if (!rows.length) {
    return `<div class="pmeta-stack"><div class="pmeta-row pmeta-empty">—</div></div>`;
  }
  return `<div class="pmeta-stack">${rows.map((line) => `<div class="pmeta-row">${line}</div>`).join("")}</div>`;
}

export function playerDetailTooltipText(player) {
  if (!player) return "";
  const h = (s) => (s != null && String(s).trim() ? String(s).trim() : "");

  function dashLine(...raw) {
    const bits = raw
      .filter((v) => v != null && String(v).trim())
      .map((v) => h(String(v).trim()));
    return bits.length ? bits.join(" · ") : "";
  }

  const phys = [
    player.height ? `${player.height} cm` : null,
    player.weight ? `${player.weight} kg` : null,
    player.age ? `${player.age} yo` : null,
  ];

  const rows = [
    dashLine(player.region, player.nationality),
    dashLine(player.league, player.club),
    dashLine(player.foot, player.playing_style),
    dashLine(...phys),
  ].filter(Boolean);

  return rows.length ? rows.join("\n") : "—";
}

export function normalizePlayerForFooter(player) {
  if (!player || typeof player !== "object") return {};
  return {
    region: player.region ?? "",
    nationality: player.nationality ?? player.nation ?? "",
    league: player.league ?? "",
    club: player.club ?? "",
    foot: player.foot ?? "",
    playing_style: player.playing_style ?? "",
    height: player.height ?? "",
    weight: player.weight ?? "",
    age: player.age ?? "",
  };
}

export function miniCardHtml(player, o) {
  const { banned, picked, clickable, isBanPhase } = o;
  const unavailable = banned || picked;
  return `
    <div class="mini-card ${isBanPhase ? "is-ban-phase" : "is-pick-phase"} ${unavailable ? (banned ? "is-ban" : "is-pick") : ""} ${clickable ? "is-clickable" : ""}"
         data-player-id="${escapeHtml(player.id)}"
         tabindex="${clickable ? 0 : -1}">
      <div class="mini-thumb">
        <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
      </div>
      ${isBanPhase ? "" : `
        <div class="mini-row">
          <div class="mini-ovr">${getPlayerCardValue(player)}</div>
          <div style="min-width:0">
            <div class="mini-name">${escapeHtml(player.name)}</div>
            <div class="mini-sub">${escapeHtml(player.position)} · ${escapeHtml(player.nation)}</div>
          </div>
        </div>
        <div class="mini-stats">
          ${["SPD", "FIN", "PAS"]
            .map((l, i) => {
              const vals = [player.speed, player.finishing, player.passing];
              return `<div class="mini-stat"><div class="mini-stat-l">${l}</div><div class="mini-stat-v">${vals[i] ?? "—"}</div></div>`;
            })
            .join("")}
        </div>
        <div class="mini-cta ${isBanPhase ? "is-ban" : "is-pick"} mini-cta-hover" style="display:none"></div>
      `}
    </div>
  `;
}
