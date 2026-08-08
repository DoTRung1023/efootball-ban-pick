import {
  CARD_IMG,
  ANON_PLAYER_IMG,
  FIXED_PICKS_PER_SIDE,
} from './constants.js';

/* Card art + the player metadata block are shared with the home bundle —
   see @/shared/players/playerMeta.js. Re-exported so room modules keep importing
   them from "./players.js" as before. */
export {
  makePlayerImg,
  playerDetailSublineHtml,
  playerDetailTooltipText,
} from "@/shared/players/playerMeta.js";

/* Same arrangement for the formation table — see
   @/shared/players/formations.js. */
export { normalizeFormation, getFormationLayout } from "@/shared/players/formations.js";

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
