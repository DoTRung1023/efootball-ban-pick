import { CARD_IMG, ANON_PLAYER_IMG } from './constants.js';

/* Card art + the player metadata block are shared with the home bundle —
   see @/shared/players/playerMeta.js. Re-exported so room modules keep importing
   them from "./players.js" as before. */
export {
  makePlayerImg,
  playerDetailSublineHtml,
} from "@/shared/players/playerMeta.js";

/* Same arrangement for the formation table — see
   @/shared/players/formations.js. */
export { normalizeFormation, getFormationLayout,
         BENCH_ROW_LABEL } from "@/shared/players/formations.js";

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
    /* Not printed on the card, but carried: the FILTER panel reads them
       (`p?.card_type ?? p?._raw?.card_type`), and a pick round-trips through the
       room as whatever this function returns. */
    overall: player?.overall ?? "",
    overall_max: player?.overall_max ?? "",
    card_type: player?.card_type ?? "",
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
    // Same three as above: the FILTER panel reads them off a pool card.
    overall: player?.overall ?? "",
    overall_max: player?.overall_max ?? "",
    card_type: player?.card_type ?? "",
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

/* ── Slot-addressed picks ─────────────────────────────────────
   `room.picks[side]` is indexed by pitch slot, and an empty slot is a `null`
   hole — so removing a player leaves his slot empty rather than sliding
   everyone after him along. Every count therefore has to skip holes; reaching
   for `.length` gives the highest filled slot, not the number of picks. */

/** The players actually in the lineup, holes dropped. */
export const filledPicks = (picks) => (Array.isArray(picks) ? picks.filter(Boolean) : []);

/** How many players are in the lineup. Use this, never `picks.length`. */
export const pickCount = (picks) => filledPicks(picks).length;

/* There is no `firstFreeSlot` here any more, and no "first hole, else the end"
   rule anywhere: every pick names its slot (see pick-phase.md). The append
   route it served went with it. */

/** Slot number (1-based) → player, holes omitted so empty slots render empty. */
export function buildOrderedSlotMap(players) {
  const map = {};
  (players || []).forEach((player, idx) => {
    if (player) map[idx + 1] = normalizeDraftPlayer(player);
  });
  return map;
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
