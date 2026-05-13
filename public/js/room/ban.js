import {
  POSITION_OPTIONS,
  FOOT_OPTIONS,
  CARD_TYPE_OPTIONS,
  REGION_OPTIONS,
  PLAYING_STYLE_OPTIONS,
} from './constants.js';

import {
  getPlayerCardValue,
  getPlayerImageSrc,
  playerDetailSublineHtml,
  playerDetailTooltipText,
  normalizePlayerForFooter,
  normalizeMySquadPlayerForDraft,
  normalizeApiPlayer,
} from './players.js';

import { escapeHtml, showToast } from './utils.js';
import { cb } from './callbacks.js';
import { state } from './state.js';
import { applyPresenceSnapshot } from './state.js';

export let BAN_LEAGUE_OPTIONS = [];

export async function fetchFilterOptions() {
  try {
    const res = await fetch("/api/players/filter-options");
    if (res.ok) {
      const data = await res.json();
      CARD_TYPE_OPTIONS.length = 0;
      (data.card_type || []).forEach((v) => CARD_TYPE_OPTIONS.push(v));
      PLAYING_STYLE_OPTIONS.length = 0;
      (data.playing_style || []).forEach((v) => PLAYING_STYLE_OPTIONS.push(v));
      BAN_LEAGUE_OPTIONS.length = 0;
      (data.league || []).forEach((v) => BAN_LEAGUE_OPTIONS.push(v));
      REGION_OPTIONS.length = 0;
      (data.region || []).forEach((v) => REGION_OPTIONS.push(v));
    }
  } catch (err) {
    console.warn("Could not fetch filter options:", err);
  }
}

export function normalizeBanSortValue(raw) {
  const v = String(raw || "").trim();
  const ok = new Set([
    "overall_max_desc", "overall_max_asc",
    "overall_desc", "overall_asc",
    "name_desc", "name_asc",
    "position_desc", "position_asc",
    "height_desc", "height_asc",
    "weight_desc", "weight_asc",
    "age_desc", "age_asc",
    "club_desc", "club_asc",
    "nationality_desc", "nationality_asc",
  ]);
  return ok.has(v) ? v : "overall_max_desc";
}

export function normalizeBanPositionValue(raw) {
  const v = String(raw || "").trim().toUpperCase();
  return POSITION_OPTIONS.includes(v) ? v : "";
}

export function comparePlayersByBanSort(a, b, sortKey) {
  const sa = String(a?.name || "");
  const sb = String(b?.name || "");
  const key = String(sortKey || "overall_max_desc");
  const dir = key.endsWith("_asc") ? "asc" : "desc";
  const baseKey = key.replace(/_(asc|desc)$/, "");
  const overallMaxA = Number(getPlayerCardValue(a)) || 0;
  const overallMaxB = Number(getPlayerCardValue(b)) || 0;
  const overallA = Number(a?._raw?.overall ?? a?.overall_rating ?? 0) || 0;
  const overallB = Number(b?._raw?.overall ?? b?.overall_rating ?? 0) || 0;
  const posA = String(a?.position || "");
  const posB = String(b?.position || "");
  const heightA = Number(a?._raw?.height ?? a?.height ?? 0) || 0;
  const heightB = Number(b?._raw?.height ?? b?.height ?? 0) || 0;
  const weightA = Number(a?._raw?.weight ?? a?.weight ?? 0) || 0;
  const weightB = Number(b?._raw?.weight ?? b?.weight ?? 0) || 0;
  const ageA = Number(a?._raw?.age ?? a?.age ?? 0) || 0;
  const ageB = Number(b?._raw?.age ?? b?.age ?? 0) || 0;
  const clubA = String(a?._raw?.club ?? a?.club ?? "");
  const clubB = String(b?._raw?.club ?? b?.club ?? "");
  const nationA = String(a?._raw?.nationality ?? a?.nationality ?? a?.nation ?? "");
  const nationB = String(b?._raw?.nationality ?? b?.nationality ?? b?.nation ?? "");

  let cmp = 0;
  if (baseKey === "overall") cmp = overallA - overallB || sa.localeCompare(sb);
  else if (baseKey === "name") cmp = sb.localeCompare(sa) || overallMaxB - overallMaxA;
  else if (baseKey === "position") cmp = posA.localeCompare(posB) || overallMaxB - overallMaxA;
  else if (baseKey === "height") cmp = heightA - heightB || overallMaxB - overallMaxA;
  else if (baseKey === "weight") cmp = weightA - weightB || overallMaxB - overallMaxA;
  else if (baseKey === "age") cmp = ageA - ageB || overallMaxB - overallMaxA;
  else if (baseKey === "club") cmp = clubA.localeCompare(clubB) || overallMaxB - overallMaxA;
  else if (baseKey === "nationality") cmp = nationA.localeCompare(nationB) || overallMaxB - overallMaxA;
  else cmp = overallMaxA - overallMaxB || sa.localeCompare(sb);

  return dir === "asc" ? cmp : -cmp;
}

export function getBanListPlayers() {
  const base = Array.isArray(state.opponentBanPlayers) ? state.opponentBanPlayers : [];
  const q = String(state.banSearch || "").trim().toLowerCase();
  const sortKey = normalizeBanSortValue(state.banSort);
  const posSet = new Set((Array.isArray(state.banFilterPositions) ? state.banFilterPositions : []).map(normalizeBanPositionValue).filter(Boolean));
  const footSet = new Set(Array.isArray(state.banFilterFoot) ? state.banFilterFoot : []);
  const psSet = new Set(Array.isArray(state.banFilterPlayingStyle) ? state.banFilterPlayingStyle : []);
  const ctSet = new Set(Array.isArray(state.banFilterCardType) ? state.banFilterCardType : []);
  const lgSet = new Set(Array.isArray(state.banFilterLeague) ? state.banFilterLeague : []);
  const rgSet = new Set(Array.isArray(state.banFilterRegion) ? state.banFilterRegion : []);
  const ovrMin = state.banFilterOverallMin !== "" ? Number(state.banFilterOverallMin) : null;
  const ovrMax = state.banFilterOverallMax !== "" ? Number(state.banFilterOverallMax) : null;
  const ovrMxMin = state.banFilterOverallMaxMin !== "" ? Number(state.banFilterOverallMaxMin) : null;
  const ovrMxMax = state.banFilterOverallMaxMax !== "" ? Number(state.banFilterOverallMaxMax) : null;
  const clubQ = String(state.banFilterClub || "").trim().toLowerCase();
  const nationQ = String(state.banFilterNation || "").trim().toLowerCase();
  const htMin = state.banFilterHeightMin !== "" ? Number(state.banFilterHeightMin) : null;
  const htMax = state.banFilterHeightMax !== "" ? Number(state.banFilterHeightMax) : null;
  const wtMin = state.banFilterWeightMin !== "" ? Number(state.banFilterWeightMin) : null;
  const wtMax = state.banFilterWeightMax !== "" ? Number(state.banFilterWeightMax) : null;
  const ageMin = state.banFilterAgeMin !== "" ? Number(state.banFilterAgeMin) : null;
  const ageMax = state.banFilterAgeMax !== "" ? Number(state.banFilterAgeMax) : null;

  let rows = base;
  if (q) rows = rows.filter((p) => String(p?.name || "").toLowerCase().includes(q));
  if (posSet.size) rows = rows.filter((p) => posSet.has(String(p?.position || "").toUpperCase()));
  if (footSet.size) rows = rows.filter((p) => footSet.has(String(p?.foot ?? p?._raw?.foot ?? "")));
  if (psSet.size) rows = rows.filter((p) => psSet.has(String(p?.playing_style ?? p?._raw?.playing_style ?? "")));
  if (ctSet.size) rows = rows.filter((p) => ctSet.has(String(p?.card_type ?? p?._raw?.card_type ?? "")));
  if (lgSet.size) rows = rows.filter((p) => lgSet.has(String(p?.league ?? p?._raw?.league ?? "")));
  if (rgSet.size) rows = rows.filter((p) => rgSet.has(String(p?.region ?? p?._raw?.region ?? "")));
  if (ovrMin !== null) rows = rows.filter((p) => { const v = Number(p?._raw?.overall ?? p?.overall_rating ?? 0); return !isNaN(v) && v >= ovrMin; });
  if (ovrMax !== null) rows = rows.filter((p) => { const v = Number(p?._raw?.overall ?? p?.overall_rating ?? 0); return !isNaN(v) && v <= ovrMax; });
  if (ovrMxMin !== null) rows = rows.filter((p) => { const v = Number(getPlayerCardValue(p)); return !isNaN(v) && v >= ovrMxMin; });
  if (ovrMxMax !== null) rows = rows.filter((p) => { const v = Number(getPlayerCardValue(p)); return !isNaN(v) && v <= ovrMxMax; });
  if (clubQ) rows = rows.filter((p) => String(p?.club ?? p?._raw?.club ?? "").toLowerCase().includes(clubQ));
  if (nationQ) rows = rows.filter((p) => String(p?.nationality ?? p?.nation ?? p?._raw?.nationality ?? "").toLowerCase().includes(nationQ));
  if (htMin !== null) rows = rows.filter((p) => { const v = Number(p?.height ?? p?._raw?.height ?? 0); return !isNaN(v) && v >= htMin; });
  if (htMax !== null) rows = rows.filter((p) => { const v = Number(p?.height ?? p?._raw?.height ?? 0); return !isNaN(v) && v <= htMax; });
  if (wtMin !== null) rows = rows.filter((p) => { const v = Number(p?.weight ?? p?._raw?.weight ?? 0); return !isNaN(v) && v >= wtMin; });
  if (wtMax !== null) rows = rows.filter((p) => { const v = Number(p?.weight ?? p?._raw?.weight ?? 0); return !isNaN(v) && v <= wtMax; });
  if (ageMin !== null) rows = rows.filter((p) => { const v = Number(p?.age ?? p?._raw?.age ?? 0); return !isNaN(v) && v >= ageMin; });
  if (ageMax !== null) rows = rows.filter((p) => { const v = Number(p?.age ?? p?._raw?.age ?? 0); return !isNaN(v) && v <= ageMax; });
  return [...rows].sort((a, b) => comparePlayersByBanSort(a, b, sortKey));
}

export function getPickListPlayers() {
  const base = Array.isArray(state.players) ? state.players : [];
  const q = String(state.pickSearch || "").trim().toLowerCase();
  const sortKey = normalizeBanSortValue(state.pickSort);
  const posSet = new Set((Array.isArray(state.pickFilterPosition) ? state.pickFilterPosition : []).map(normalizeBanPositionValue).filter(Boolean));
  let rows = base;
  if (q) rows = rows.filter((p) => String(p?.name || "").toLowerCase().includes(q));
  if (posSet.size) rows = rows.filter((p) => posSet.has(String(p?.position || p?._raw?.position || "").toUpperCase()));
  return [...rows].sort((a, b) => comparePlayersByBanSort(a, b, sortKey));
}

export function imageOnlyThumbHtml(player, size = "md") {
  if (!player) return "";
  return `
    <div class="ban-phase-thumb ban-phase-thumb--${escapeHtml(size)}" data-player-id="${escapeHtml(player.id)}">
      <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
    </div>
  `;
}

export function opponentStagedBanThumbHtml(player, size = "md") {
  if (!player) return "";
  return `
    <div class="ban-phase-thumb ban-phase-thumb--${escapeHtml(size)} is-opponent-staged" data-player-id="${escapeHtml(player.id)}">
      <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
    </div>
  `;
}

export function stagedBanThumbHtml(player, size = "md") {
  if (!player) return "";
  return `
    <div class="ban-phase-thumb ban-phase-thumb--${escapeHtml(size)} is-staged" data-player-id="${escapeHtml(player.id)}">
      <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
      <button class="ban-thumb-remove" data-remove-ban="${escapeHtml(String(player.id))}" type="button" aria-label="Remove staged ban">×</button>
    </div>
  `;
}

export function resetOpponentBanPlayers() {
  state.opponentBanPlayers = [];
  state.loadingOpponentBanPlayers = false;
  state.opponentBanPlayersLoaded = false;
}

export async function loadOpponentBanPlayers() {
  const room = state.room;
  if (!room) return;
  const loading = document.getElementById("draftLoading");
  const mySide = state.mySide;
  const theirSide = mySide === "host" ? "guest" : "host";
  let opponentUserId = Number(room?.[theirSide]?.id);

  if (!Number.isFinite(opponentUserId) || opponentUserId <= 0) {
    // In some flows, draft starts before presence polling fully hydrates numeric ids.
    // Attempt a one-time presence refresh, then retry extracting opponent id.
    try {
      const code = String(room.code || "").trim();
      if (code) {
        const pres = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
        const data = await pres.json().catch(() => ({}));
        if (pres.ok && data?.room) applyPresenceSnapshot(data.room);
      }
    } catch {
      /* ignore */
    }
    opponentUserId = Number(state.room?.[theirSide]?.id);
    if (!Number.isFinite(opponentUserId) || opponentUserId <= 0) {
      // Fallback: if opponent is not signed in (anon ids), we can't load /api/my-players.
      // Provide a small demo pool so ban UI is usable in single-browser testing.
      try {
        const res = await fetch("/api/top-players");
        const data = await res.json().catch(() => ({}));
        const rows = Array.isArray(data.players) ? data.players : [];
        state.opponentBanPlayers = rows.map((p) =>
          normalizeApiPlayer({
            id: p.id,
            name: p.name,
            position: p.position,
            overall_max: p.overall,
            nationality: p.nationality,
          }),
        );
        state.opponentBanPlayersLoadSource = "top-players";
      } catch {
        state.opponentBanPlayers = [];
      } finally {
        state.opponentBanPlayersLoaded = true;
        cb.renderDraftUi();
      }
      return;
    }
  }

  state.loadingOpponentBanPlayers = true;
  if (loading) loading.hidden = false;
  cb.renderDraftUi();
  try {
    const res = await fetch(`/api/my-players?userId=${encodeURIComponent(opponentUserId)}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error || `Failed to load opponent squad (${res.status})`);
    }
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data.players) ? data.players : [];
    const dedup = new Map();
    rows.forEach((row) => {
      const normalized = normalizeMySquadPlayerForDraft(row);
      if (!normalized.id) return;
      if (!dedup.has(normalized.id)) dedup.set(normalized.id, normalized);
    });
    state.opponentBanPlayers = Array.from(dedup.values());
    state.opponentBanPlayersLoadSource = "my-players";

    // If opponent has no saved squad, fall back to a small demo pool so the ban UI isn't empty/stuck.
    if (!state.opponentBanPlayers.length) {
      try {
        const demoRes = await fetch("/api/top-players");
        const demoData = await demoRes.json().catch(() => ({}));
        const demoRows = Array.isArray(demoData.players) ? demoData.players : [];
        state.opponentBanPlayers = demoRows.map((p) =>
          normalizeApiPlayer({
            id: p.id,
            name: p.name,
            position: p.position,
            overall_max: p.overall,
            nationality: p.nationality,
          }),
        );
        state.opponentBanPlayersLoadSource = "top-players";
      } catch {
        /* ignore */
      }
    }
  } catch {
    state.opponentBanPlayers = [];
  } finally {
    state.loadingOpponentBanPlayers = false;
    state.opponentBanPlayersLoaded = true;
    if (loading) loading.hidden = state.loadingPlayers;
    cb.renderDraftUi();
  }
}

export function banHistoryCardHtml(player) {
  return `
    <div class="ban-history-card">
      <div class="ban-history-thumb">
        <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
      </div>
      <div class="ban-history-text">
        <div class="ban-history-name">${escapeHtml(player.name || "—")}</div>
        <div class="ban-history-meta">${escapeHtml(player.position || "—")} · OVR ${escapeHtml(getPlayerCardValue(player))}</div>
      </div>
    </div>
  `;
}

export function banPlayerCardHtml(player, o) {
  const { banned, picked, clickable } = o;
  const unavailable = banned || picked;
  const cls = [
    "player-card",
    clickable ? "is-clickable" : "",
    unavailable ? "is-unavailable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tooltipText = playerDetailTooltipText(normalizePlayerForFooter(player));

  return `
    <div class="${cls}" data-player-id="${escapeHtml(player.id)}" tabindex="${clickable ? 0 : -1}" title="${escapeHtml(tooltipText)}">
      <div class="pc-img-wrap">
        <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
      </div>
      <div class="pc-footer">
        <div class="pc-footer-meta pmeta-in-card pc-footer-detail-only">${playerDetailSublineHtml(normalizePlayerForFooter(player))}</div>
      </div>
    </div>
  `;
}

export function renderBanToolbar() {
  const sortSelect = document.getElementById("banSort");
  const posSelect = document.getElementById("banPosition");
  const sortLabel = document.getElementById("banSortLabel");
  const sortPanel = document.getElementById("banSortPanel");
  const posPanel = document.getElementById("banPosPanel");
  const posDot = document.getElementById("banPosDot");
  const sortDirIcon = document.getElementById("banSortDirIcon");
  if (!sortSelect || !posSelect || !sortLabel || !sortPanel || !posPanel) return;

  const sortVal = normalizeBanSortValue(state.banSort);
  const posVal = "";
  sortSelect.value = sortVal;
  posSelect.value = posVal;

  // Home-style: sort category + direction toggle
  const dir = sortVal.endsWith("_asc") ? "asc" : "desc";
  const baseKey = sortVal.replace(/_(asc|desc)$/, "");
  const labelMap = {
    overall_max: "Overall Max",
    overall: "Overall Level 1",
    name: "Player Name",
    position: "Position",
    height: "Height",
    weight: "Weight",
    age: "Age",
  };
  sortLabel.textContent = labelMap[baseKey] || "Overall Max";
  if (sortDirIcon) sortDirIcon.textContent = dir === "asc" ? "↑" : "↓";

  const sortCats = [
    { key: "overall_max", label: "Overall Max" },
    { key: "overall", label: "Overall Level 1" },
    { key: "name", label: "Player Name" },
    { key: "position", label: "Position" },
    { key: "club", label: "Club" },
    { key: "nationality", label: "Nationality" },
    { key: "height", label: "Height" },
    { key: "weight", label: "Weight" },
    { key: "age", label: "Age" },
  ];
  sortPanel.innerHTML = sortCats
    .map((c) => {
      const active = c.key === baseKey;
      return `
        <div class="sort-option ${active ? "active" : ""}" data-ban-sort-cat="${escapeHtml(c.key)}">
          <span>${escapeHtml(c.label)}</span>
          <span class="sort-check">✓</span>
        </div>
      `;
    })
    .join("");

  // Filter panel: matches all-players page
  function msLabel(arr, allText, max = 3) {
    return !arr.length ? allText : arr.length <= max ? arr.join(", ") : `${arr.slice(0, max).join(", ")} +${arr.length - max}`;
  }
  const selPos  = (Array.isArray(state.banFilterPositions)    ? state.banFilterPositions    : []).map(normalizeBanPositionValue).filter(Boolean);
  const selFoot = Array.isArray(state.banFilterFoot)          ? state.banFilterFoot          : [];
  const selPs   = Array.isArray(state.banFilterPlayingStyle)  ? state.banFilterPlayingStyle  : [];
  const selCt   = Array.isArray(state.banFilterCardType)      ? state.banFilterCardType      : [];
  const selLg   = Array.isArray(state.banFilterLeague)        ? state.banFilterLeague        : [];
  const selRg   = Array.isArray(state.banFilterRegion)         ? state.banFilterRegion         : [];

  function msItemsHtml(options, selected, attr) {
    return options.map((v) => `
      <div class="pos-ms-item ${selected.includes(v) ? "checked" : ""}" data-${attr}="${escapeHtml(v)}">
        <span class="pos-ms-check"></span><span>${escapeHtml(v)}</span>
      </div>`).join("");
  }

  posPanel.innerHTML = `
    <div class="filter-group-label">IDENTITY</div>
    <div class="filter-section">
      <div class="filter-section-label">POSITION</div>
      <div class="pos-multiselect">
        <button class="pos-ms-btn ${selPos.length ? "has-pos-filter" : ""}" id="banPosMsBtn" type="button">
          <span id="banPosMsLabel">${escapeHtml(msLabel(selPos, "All positions", 7))}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="banPosMsPanel">${msItemsHtml(POSITION_OPTIONS, selPos, "ban-pos-ms")}</div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">CARD TYPE</div>
      <div class="pos-multiselect">
        <button class="pos-ms-btn ${selCt.length ? "has-pos-filter" : ""}" id="banCtMsBtn" type="button">
          <span id="banCtMsLabel">${escapeHtml(msLabel(selCt, "Any card type"))}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="banCtMsPanel">${msItemsHtml(CARD_TYPE_OPTIONS, selCt, "ban-ct-ms")}</div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">PLAYING STYLE</div>
      <div class="pos-multiselect">
        <button class="pos-ms-btn ${selPs.length ? "has-pos-filter" : ""}" id="banPsMsBtn" type="button">
          <span id="banPsMsLabel">${escapeHtml(msLabel(selPs, "Any playing style"))}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="banPsMsPanel">${msItemsHtml(PLAYING_STYLE_OPTIONS, selPs, "ban-ps-ms")}</div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">FOOT</div>
      <div class="pos-multiselect">
        <button class="pos-ms-btn ${selFoot.length ? "has-pos-filter" : ""}" id="banFootMsBtn" type="button">
          <span id="banFootMsLabel">${escapeHtml(msLabel(selFoot, "Any foot"))}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="banFootMsPanel">${msItemsHtml(FOOT_OPTIONS, selFoot, "ban-foot-ms")}</div>
      </div>
    </div>
    <div class="filter-group-label">STATS</div>
    <div class="filter-section">
      <div class="filter-section-label">OVERALL LEVEL 1</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="banFcOvrMin" placeholder="Min" value="${escapeHtml(String(state.banFilterOverallMin))}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="banFcOvrMax" placeholder="Max" value="${escapeHtml(String(state.banFilterOverallMax))}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">OVERALL MAX</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="banFcOvrMxMin" placeholder="Min" value="${escapeHtml(String(state.banFilterOverallMaxMin))}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="banFcOvrMxMax" placeholder="Max" value="${escapeHtml(String(state.banFilterOverallMaxMax))}">
      </div>
    </div>
    <div class="filter-group-label">CLUB & ORIGIN</div>
    <div class="filter-section">
      <div class="filter-section-label">LEAGUE</div>
      <div class="pos-multiselect">
        <button class="pos-ms-btn ${selLg.length ? "has-pos-filter" : ""}" id="banLgMsBtn" type="button">
          <span id="banLgMsLabel">${escapeHtml(msLabel(selLg, "Any league"))}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="banLgMsPanel">${msItemsHtml(BAN_LEAGUE_OPTIONS, selLg, "ban-lg-ms")}</div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">REGION</div>
      <div class="pos-multiselect">
        <button class="pos-ms-btn ${selRg.length ? "has-pos-filter" : ""}" id="banRgMsBtn" type="button">
          <span id="banRgMsLabel">${escapeHtml(msLabel(selRg, "Any region"))}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="banRgMsPanel">${msItemsHtml(REGION_OPTIONS, selRg, "ban-rg-ms")}</div>
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">CLUB</div>
      <input type="text" class="filter-input" id="banFcClub" placeholder="e.g. FC Barcelona" value="${escapeHtml(state.banFilterClub)}" autocomplete="off">
    </div>
    <div class="filter-section">
      <div class="filter-section-label">NATIONALITY</div>
      <input type="text" class="filter-input" id="banFcNation" placeholder="e.g. Brazil" value="${escapeHtml(state.banFilterNation)}" autocomplete="off">
    </div>
    <div class="filter-group-label">PHYSICAL</div>
    <div class="filter-section">
      <div class="filter-section-label">AGE</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="banFcAgeMin" placeholder="Min" value="${escapeHtml(String(state.banFilterAgeMin))}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="banFcAgeMax" placeholder="Max" value="${escapeHtml(String(state.banFilterAgeMax))}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">HEIGHT (cm)</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="banFcHtMin" placeholder="Min" value="${escapeHtml(String(state.banFilterHeightMin))}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="banFcHtMax" placeholder="Max" value="${escapeHtml(String(state.banFilterHeightMax))}">
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-label">WEIGHT (kg)</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="banFcWtMin" placeholder="Min" value="${escapeHtml(String(state.banFilterWeightMin))}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="banFcWtMax" placeholder="Max" value="${escapeHtml(String(state.banFilterWeightMax))}">
      </div>
    </div>
    <div class="filter-section">
      <button class="filter-clear-btn" id="banClearFiltersBtn">CLEAR ALL FILTERS</button>
    </div>
  `;

  const anyFilterActive = selPos.length || selFoot.length || selPs.length || selCt.length || selLg.length || selRg.length
    || state.banFilterOverallMin || state.banFilterOverallMax
    || state.banFilterOverallMaxMin || state.banFilterOverallMaxMax
    || state.banFilterClub || state.banFilterNation
    || state.banFilterHeightMin || state.banFilterHeightMax
    || state.banFilterWeightMin || state.banFilterWeightMax
    || state.banFilterAgeMin || state.banFilterAgeMax;
  if (posDot) {
    posDot.style.display = anyFilterActive ? "inline-block" : "none";
  }
}

export function bindBanPhaseUiOnce() {
  if (state.banUiBound) return;
  const search = document.getElementById("banSearch");
  const sort = document.getElementById("banSort");
  const pos = document.getElementById("banPosition");
  const sortBtn = document.getElementById("banSortBtn");
  const sortWrap = document.getElementById("banSortWrap");
  const sortPanel = document.getElementById("banSortPanel");
  const sortDirBtn = document.getElementById("banSortDirBtn");
  const posBtn = document.getElementById("banPosBtn");
  const posWrap = document.getElementById("banPosWrap");
  const posPanel = document.getElementById("banPosPanel");
  if (!search || !sort || !pos) return;
  state.banUiBound = true;

  search.addEventListener("input", (e) => {
    state.banSearch = String(e.target.value || "");
    cb.renderDraftUi();
  });
  sort.addEventListener("change", (e) => {
    state.banSort = normalizeBanSortValue(e.target.value);
    cb.renderDraftUi();
  });
  pos.addEventListener("change", () => {
    // kept for compatibility; filtering is driven by state.banFilterPositions
    cb.renderDraftUi();
  });

  const closeAll = () => {
    sortBtn?.classList.remove("open");
    posBtn?.classList.remove("open");
    sortPanel?.classList.remove("open");
    posPanel?.classList.remove("open");
    sortBtn?.setAttribute("aria-expanded", "false");
    posBtn?.setAttribute("aria-expanded", "false");
  };

  document.addEventListener("click", (e) => {
    const t = e.target;
    const insideSort = sortWrap && t instanceof Element ? Boolean(t.closest("#banSortWrap")) : false;
    const insidePos = posWrap && t instanceof Element ? Boolean(t.closest("#banPosWrap")) : false;
    if (!insideSort && !insidePos) closeAll();
  });

  sortBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const open = !Boolean(sortPanel?.classList.contains("open"));
    closeAll();
    if (open) {
      renderBanToolbar();
      sortBtn.classList.add("open");
      sortPanel?.classList.add("open");
      sortBtn.setAttribute("aria-expanded", "true");
    }
  });

  sortDirBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const cur = normalizeBanSortValue(state.banSort);
    const baseKey = cur.replace(/_(asc|desc)$/, "");
    const next = cur.endsWith("_asc") ? `${baseKey}_desc` : `${baseKey}_asc`;
    sort.value = normalizeBanSortValue(next);
    sort.dispatchEvent(new Event("change", { bubbles: true }));
  });

  posBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const open = !Boolean(posPanel?.classList.contains("open"));
    closeAll();
    if (open) {
      renderBanToolbar();
      posBtn.classList.add("open");
      posPanel?.classList.add("open");
      posBtn.setAttribute("aria-expanded", "true");
    }
  });

  sortPanel?.addEventListener("click", (e) => {
    const opt = e.target instanceof Element ? e.target.closest("[data-ban-sort-cat]") : null;
    if (!opt) return;
    const cat = String(opt.getAttribute("data-ban-sort-cat") || "");
    const cur = normalizeBanSortValue(state.banSort);
    const dir = cur.endsWith("_asc") ? "asc" : "desc";
    const v = `${cat}_${dir}`;
    sort.value = normalizeBanSortValue(v);
    sort.dispatchEvent(new Event("change", { bubbles: true }));
    closeAll();
  });

  // Helper: wire a multiselect sub-panel inside posPanel
  function bindBanMs(btnId, panelId, getState, setState, normalize) {
    posPanel?.addEventListener("click", (e) => {
      if (!(e.target instanceof Element)) return;
      const btn = e.target.closest(`#${btnId}`);
      const panel = document.getElementById(panelId);
      const panelBtn = document.getElementById(btnId);
      if (btn && panel && panelBtn) {
        const open = !panel.classList.contains("open");
        panel.classList.toggle("open", open);
        panelBtn.classList.toggle("open", open);
        e.stopPropagation();
      }
    });
  }

  posPanel?.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    const clear = e.target.closest("#banClearFiltersBtn");
    if (clear) {
      state.banFilterPositions = [];
      state.banFilterFoot = [];
      state.banFilterPlayingStyle = [];
      state.banFilterCardType = [];
      state.banFilterLeague = [];
      state.banFilterRegion = [];
      state.banFilterOverallMin = "";
      state.banFilterOverallMax = "";
      state.banFilterOverallMaxMin = "";
      state.banFilterOverallMaxMax = "";
      state.banFilterClub = "";
      state.banFilterNation = "";
      state.banFilterHeightMin = "";
      state.banFilterHeightMax = "";
      state.banFilterWeightMin = "";
      state.banFilterWeightMax = "";
      state.banFilterAgeMin = "";
      state.banFilterAgeMax = "";
      cb.renderDraftUi();
      return;
    }

    // Multiselect item clicks
    const msConfigs = [
      { attr: "ban-pos-ms",  stateKey: "banFilterPositions",   normalize: normalizeBanPositionValue },
      { attr: "ban-foot-ms", stateKey: "banFilterFoot",         normalize: (v) => v },
      { attr: "ban-ps-ms",   stateKey: "banFilterPlayingStyle", normalize: (v) => v },
      { attr: "ban-ct-ms",   stateKey: "banFilterCardType",     normalize: (v) => v },
      { attr: "ban-lg-ms",   stateKey: "banFilterLeague",       normalize: (v) => v },
      { attr: "ban-rg-ms",   stateKey: "banFilterRegion",       normalize: (v) => v },
    ];
    for (const cfg of msConfigs) {
      const item = e.target.closest(`[data-${cfg.attr}]`);
      if (item) {
        const raw = item.getAttribute(`data-${cfg.attr}`) || "";
        const v = cfg.normalize(raw);
        if (!v) return;
        const cur = new Set((Array.isArray(state[cfg.stateKey]) ? state[cfg.stateKey] : []).map(cfg.normalize).filter(Boolean));
        cur.has(v) ? cur.delete(v) : cur.add(v);
        state[cfg.stateKey] = [...cur];
        cb.renderDraftUi();
        return;
      }
    }

    // Toggle sub-panel open/close
    const subBtns = ["banPosMsBtn", "banFootMsBtn", "banPsMsBtn", "banCtMsBtn", "banLgMsBtn", "banRgMsBtn"];
    for (const btnId of subBtns) {
      const btn = e.target.closest(`#${btnId}`);
      if (btn) {
        const panelId = btnId.replace("Btn", "Panel");
        const panel = document.getElementById(panelId);
        if (panel) {
          const open = !panel.classList.contains("open");
          panel.classList.toggle("open", open);
          btn.classList.toggle("open", open);
        }
        e.stopPropagation();
        return;
      }
    }
  });

  // Range + text inputs inside posPanel (use input event delegation)
  posPanel?.addEventListener("input", (e) => {
    if (!(e.target instanceof Element)) return;
    const id = e.target.id;
    const v = e.target.value;
    if (id === "banFcOvrMin")   { state.banFilterOverallMin = v; cb.renderDraftUi(); }
    else if (id === "banFcOvrMax")   { state.banFilterOverallMax = v; cb.renderDraftUi(); }
    else if (id === "banFcOvrMxMin") { state.banFilterOverallMaxMin = v; cb.renderDraftUi(); }
    else if (id === "banFcOvrMxMax") { state.banFilterOverallMaxMax = v; cb.renderDraftUi(); }
    else if (id === "banFcClub")     { state.banFilterClub = v; cb.renderDraftUi(); }
    else if (id === "banFcNation")   { state.banFilterNation = v; cb.renderDraftUi(); }
    else if (id === "banFcHtMin")    { state.banFilterHeightMin = v; cb.renderDraftUi(); }
    else if (id === "banFcHtMax")    { state.banFilterHeightMax = v; cb.renderDraftUi(); }
    else if (id === "banFcWtMin")    { state.banFilterWeightMin = v; cb.renderDraftUi(); }
    else if (id === "banFcWtMax")    { state.banFilterWeightMax = v; cb.renderDraftUi(); }
    else if (id === "banFcAgeMin")   { state.banFilterAgeMin = v; cb.renderDraftUi(); }
    else if (id === "banFcAgeMax")   { state.banFilterAgeMax = v; cb.renderDraftUi(); }
  });

  void bindBanMs;
}

export function attachMiniCardGridHandlers(grid, getDraftDisplayPlayers, submitBan, submitPick) {
  if (!grid || grid._bound) return;
  grid._bound = true;

  grid.addEventListener("mouseover", (e) => {
    // Only track is-hovered on mini-cards; player-cards use pure CSS :hover to avoid
    // polluting innerHTML and breaking the diff-guard that prevents grid rebuilds.
    const miniCard = e.target.closest(".mini-card.is-clickable");
    grid.querySelectorAll(".mini-card.is-hovered").forEach((c) => c.classList.remove("is-hovered"));
    if (miniCard) miniCard.classList.add("is-hovered");
  });
  grid.addEventListener("mouseout", (e) => {
    const miniCard = e.target.closest(".mini-card");
    if (miniCard) miniCard.classList.remove("is-hovered");
  });

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".mini-card.is-clickable, .player-card.is-clickable");
    if (!card) return;
    const id = card.dataset.playerId;
    const room = state.room;
    const turn = room ? state.schedule[room.turnIndex] : null;
    const isReadyPhase = state.phase === "ready" || String(room?.status || "") === "await-ready";
    const isBanPhase = turn?.action === "ban";
    const source = isBanPhase
      ? (Array.isArray(state.opponentBanPlayers) ? state.opponentBanPlayers : [])
      : getDraftDisplayPlayers(room);
    const player = source.find((p) => String(p.id) === id);
    if (!player) return;

    state.actionError = "";
    const errEl = document.getElementById("draftActionError");
    if (errEl) errEl.hidden = true;
    if (isBanPhase && !isReadyPhase) {
      submitBan(player);
      return;
    }
    if (!isReadyPhase) {
      void submitPick(player);
      return;
    }
  });
}

// Toggle showing player footer info in ban grid
export function initBanGridInfoToggle() {
  try {
    const btn = document.getElementById("toggleInfoBtn");
    const grid = document.getElementById("banGrid");
    if (!btn || !grid) return;
    // initialize from saved pref if desired (localStorage)
    const key = "banGridInfoHidden";
    const hidden = localStorage.getItem(key) === "1";
    if (hidden) grid.classList.add("info-hidden");
    btn.setAttribute("aria-pressed", hidden ? "true" : "false");
    // reflect label + visual state like home toolbar
    const setBtnState = (isHidden) => {
      btn.textContent = isHidden ? "SHOW INFO" : "HIDE INFO";
      if (isHidden) btn.classList.add("is-off"); else btn.classList.remove("is-off");
    };
    setBtnState(hidden);

    btn.addEventListener("click", () => {
      const isHidden = grid.classList.toggle("info-hidden");
      btn.setAttribute("aria-pressed", isHidden ? "true" : "false");
      setBtnState(isHidden);
      localStorage.setItem(key, isHidden ? "1" : "0");
    });
  } catch (e) {
    console.error("initBanGridInfoToggle error", e);
  }
}

// Run ban grid info toggle init after DOM content loaded
document.addEventListener("DOMContentLoaded", () => {
  initBanGridInfoToggle();
});
