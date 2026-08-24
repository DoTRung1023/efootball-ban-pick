/* ============================================================
   OVERVIEW — the four tiles, catalog health, and the scrape log

   Everything here answers "is the system healthy right now". The room and user
   tables it used to duplicate live on their own tabs; this tab shows each
   number once.
   ============================================================ */

import { escapeHtml } from "@/shared/players/playerMeta.js";
import { apiFetch } from "./adminApi.js";
import { fmtDate, fmtDuration, fmtNum, fmtRelative, scrapeRunState, scrapeStatusPill, tableMessage } from "./format.js";

const SCRAPE_ROWS = 8;
const SCRAPE_COLS = 6;

/**
 * Catalog health, grouped the way the three kinds of problem differ.
 *
 * `MISSING` is every nullable column in `players_catalog`, not a chosen four:
 * a gap the panel does not name is a gap nobody goes looking for. `IMPOSSIBLE`
 * is data that cannot be true whatever the source says. `REFERENCES` is a row
 * elsewhere pointing at a card that is not here, which is the only group whose
 * failures are visible to a player.
 *
 * Labels live here rather than on the server, which returns counts only.
 */
const QUALITY_GROUPS = [
  {
    title: "Missing fields",
    from: "missing",
    rows: [
      ["name", "Name"], ["position", "Position"], ["overall", "Overall"],
      ["overall_max", "Overall max"], ["club", "Club"], ["league", "League"],
      ["nationality", "Nationality"], ["height", "Height"], ["weight", "Weight"],
      ["age", "Age"], ["card_type", "Card type"], ["region", "Region"],
      ["foot", "Foot"], ["playing_style", "Playing style"],
    ],
  },
  {
    title: "Impossible values",
    from: "integrity",
    rows: [
      ["maxBelowBase", "Max rating below base"],
      ["overall", "Rating out of range"],
      ["age", "Age out of range"],
      ["height", "Height out of range"],
      ["weight", "Weight out of range"],
      ["untrimmedName", "Name has stray spaces"],
    ],
  },
  {
    title: "Broken references",
    from: "references",
    rows: [
      ["orphanSquadPlayers", "Squad rows with no card"],
      ["orphanShowcase", "Showcase entries with no card"],
    ],
  },
];

const BAD_PCT = 10;

const setText = (id, text) => { document.getElementById(id).textContent = text; };

/** A tile's number wears a hue only when the number has a state — see the note
    beside `.stat-value.is-live` in `admin.css`. */
function setTone(id, tone = "") {
  const el = document.getElementById(id);
  el.className = tone ? `stat-value ${tone}` : "stat-value";
}

function setSub(id, text, variant = "") {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = variant ? `stat-sub ${variant}` : "stat-sub";
}

async function loadStats() {
  try {
    const d = await apiFetch("/api/admin/stats");

    setText("statCatalog", fmtNum(d.catalogCount));
    setText("statUsers", fmtNum(d.userCount));
    setSub("statUsersSub",
      d.newUsersThisWeek > 0 ? `+${fmtNum(d.newUsersThisWeek)} this week` : "none this week",
      d.newUsersThisWeek > 0 ? "is-pos" : "");

    setText("statRooms", fmtNum(d.activeRoomCount));
    setTone("statRooms", d.activeRoomCount > 0 ? "is-live" : "");
    setSub("statRoomsSub",
      d.draftRoomCount > 0 ? `${d.draftRoomCount} in draft` : "none in draft",
      d.draftRoomCount > 0 ? "is-pos" : "");

    if (d.lastScrape) {
      const state = scrapeRunState(d.lastScrape);
      setText("statScrape", fmtRelative(d.lastScrape.started_at));
      setTone("statScrape", state === "done" ? "is-ok" : "is-warn");
      setSub("statScrapeSub", `${d.lastScrape.scrape_type} · ${state}`, state === "done" ? "is-pos" : "is-warn");
    } else {
      setText("statScrape", "never");
      setTone("statScrape", "is-warn");
      setSub("statScrapeSub", "run npm run scrape", "is-warn");
    }
  } catch {
    setSub("statUsersSub", "stats unavailable", "is-warn");
  }
}

async function loadDataQuality() {
  const body = document.getElementById("dataQualityBody");
  try {
    const d = await apiFetch("/api/admin/data-quality");
    const total = d.total || 1;
    let flagged = 0;

    const row = (label, count) => {
      flagged += count;
      const pct = (count / total) * 100;
      const barClass = count === 0 ? "is-ok" : pct >= BAD_PCT ? "is-bad" : "is-warn";
      /* A real percentage, with a 3% floor so a handful of rows is still a mark
         rather than an invisible sliver. */
      const width = count === 0 ? 100 : Math.max(3, Math.min(100, pct));
      return `
        <div class="dq-row">
          <span class="dq-label">${escapeHtml(label)}</span>
          <span class="dq-count">${fmtNum(count)}</span>
          <span class="dq-pct">${pct.toFixed(2)}%</span>
          <span class="dq-bar-wrap"><span class="dq-bar ${barClass}" style="width:${width.toFixed(1)}%"></span></span>
        </div>`;
    };

    body.innerHTML = QUALITY_GROUPS.map(({ title, from, rows }) => {
      const counts = d[from] || {};
      return `<div class="dq-group-title">${escapeHtml(title)}</div>`
        + rows.map(([key, label]) => row(label, counts[key] || 0)).join("");
    }).join("");

    setSub("statCatalogSub",
      flagged > 0 ? `${fmtNum(flagged)} fields need attention` : "no gaps found",
      flagged > 0 ? "is-warn" : "is-pos");
  } catch {
    body.innerHTML = `<div class="dq-row dq-empty">Failed to load</div>`;
  }
}

export async function loadScrapeRuns() {
  const tbody = document.getElementById("scrapeLogsBody");
  try {
    const d = await apiFetch(`/api/admin/scrape-logs?limit=${SCRAPE_ROWS}`);
    if (!d.logs.length) {
      tbody.innerHTML = tableMessage(SCRAPE_COLS, "No scrape runs yet");
      return;
    }
    tbody.innerHTML = d.logs.map((l) => `
      <tr>
        <td class="td-mono" data-label="RUN">#${l.id}</td>
        <td class="td-dim" data-label="MODE">${escapeHtml(String(l.scrape_type || "—").toUpperCase())}</td>
        <td data-label="PLAYERS">${fmtNum(l.players_upserted)}</td>
        <td class="td-dim col-lo" data-label="DURATION">${fmtDuration(l.started_at, l.finished_at)}</td>
        <td class="td-dim col-mid" data-label="STARTED">${fmtDate(l.started_at)}</td>
        <td data-label="STATUS">${scrapeStatusPill(l)}</td>
      </tr>`).join("");
  } catch {
    tbody.innerHTML = tableMessage(SCRAPE_COLS, "Failed to load");
  }
}

export function loadOverview() {
  loadStats();
  loadDataQuality();
  loadScrapeRuns();
}

export function initOverviewTab() {
  document.getElementById("refreshOverview").addEventListener("click", loadOverview);
}
