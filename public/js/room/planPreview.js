/**
 * "Consult this plan" — a read-only view of one of the user's saved game plans,
 * shown in the ban-phase sidebar so they can see their intended lineup while
 * deciding what to ban.
 *
 * Purely a reference: nothing here affects the draft. The pick phase has its own
 * plan chips and a live pitch; this exists because the ban phase has neither.
 *
 * renderBanBoard runs on every presence poll (~500ms), so the panel is behind a
 * state-key guard like every other repeated render in this page.
 */

import { escapeHtml } from './utils.js';
import { state } from './state.js';
import {
  getPlayerCardValue,
  getPlayerImageSrc,
  mapPlayersBySlot,
  normalizeFormation,
  slotCardsSummary,
  getFormationLayout,
} from './players.js';
import { getSelectedPlan } from './gamePlans.js';

const BENCH_START_SLOT = 12;
const BENCH_SLOT_COUNT = 12;

function formationSlotHtml(slot, player) {
  if (!player) {
    return `
      <div class="formation-slot formation-slot--empty">
        <div class="formation-slot-num">${slot}</div>
        <div class="formation-slot-empty">Empty</div>
      </div>
    `;
  }
  return `
    <div class="formation-slot formation-slot--filled">
      <div class="formation-slot-num">${slot}</div>
      <div class="formation-slot-card">
        <img src="${escapeHtml(getPlayerImageSrc(player))}" alt="${escapeHtml(player.name || "Player")}" loading="lazy" />
        <div class="formation-slot-card-body">
          <div class="formation-slot-name">${escapeHtml(player.name || "—")}</div>
          <div class="formation-slot-meta">${escapeHtml(player.position || "—")} · ${escapeHtml(player.nation || player.nationality || "—")}</div>
        </div>
        <div class="formation-slot-ovr">${escapeHtml(getPlayerCardValue(player))}</div>
      </div>
    </div>
  `;
}

function formationBenchSlotHtml(slot, player) {
  if (!player) {
    return `
      <div class="formation-bench-slot">
        <div class="formation-bench-slot-num">${slot}</div>
        <div class="formation-bench-slot-empty">Open</div>
      </div>
    `;
  }
  return `
    <div class="formation-bench-slot is-filled">
      <div class="formation-bench-slot-num">${slot}</div>
      <div class="formation-bench-slot-name">${escapeHtml(player.name || "—")}</div>
      <div class="formation-bench-slot-meta">${escapeHtml(player.position || "—")}</div>
    </div>
  `;
}

/** Renders a slot map (1–11 pitch, 12–23 bench) as a formation preview. */
export function renderSlotMapPreview(title, slotMap, formation, { compact = false } = {}) {
  const layout = getFormationLayout(formation);
  const bench = Array.from({ length: BENCH_SLOT_COUNT }, (_, i) => slotMap[BENCH_START_SLOT + i] || null);

  return `
    <div class="formation-preview ${compact ? "formation-preview--compact" : ""}">
      <div class="formation-preview-head">
        <div>
          <div class="formation-preview-k">${escapeHtml(title)}</div>
          <div class="formation-preview-sub">${escapeHtml(normalizeFormation(formation))} formation</div>
        </div>
        <div class="formation-preview-count">${slotCardsSummary(Object.values(slotMap).filter(Boolean))}</div>
      </div>
      <div class="formation-pitch">
        ${layout.map((row) => `
          <div class="formation-row" data-row="${escapeHtml(row.id)}">
            ${row.slots.map((slot) => formationSlotHtml(slot, slotMap[slot] || null)).join("")}
          </div>
        `).join("")}
      </div>
      <div class="formation-bench">
        ${bench.map((player, idx) => formationBenchSlotHtml(BENCH_START_SLOT + idx, player)).join("")}
      </div>
    </div>
  `;
}

/** Options for the plan <select>, labelled with formation and fill counts. */
function planOptionsHtml(selectedId) {
  return state.draftGamePlans.map((plan) => {
    const formation = normalizeFormation(plan.formation);
    const counts = `${Number(plan.lineup_count || 0)}/11 · ${Number(plan.sub_count || 0)}/12`;
    const selected = String(plan.id) === String(selectedId) ? " selected" : "";
    return `<option value="${escapeHtml(String(plan.id))}"${selected}>${escapeHtml(plan.name || "Plan")} · ${escapeHtml(formation)} · ${escapeHtml(counts)}</option>`;
  }).join("");
}

/**
 * Paints the ban-phase plan panel. Returns early when its markup is absent, so
 * removing the panel from room.html degrades to a no-op rather than an error.
 */
export function renderBanPlanPanel() {
  const section = document.getElementById("banPlanSection");
  const select = document.getElementById("banPlanSelect");
  const body = document.getElementById("banPlanBody");
  const preview = document.getElementById("banPlanPreview");
  const meta = document.getElementById("banPlanMeta");
  const toggle = document.getElementById("banPlanToggle");
  if (!section || !select || !body || !preview || !meta) return;

  const open = state.banPlanPanelOpen !== false;
  section.classList.toggle("is-collapsed", !open);
  body.hidden = !open;
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "▾" : "▸";
  }

  if (state.draftGamePlansLoading) {
    paint(select, meta, preview, {
      key: "loading",
      options: `<option value="">Loading game plans…</option>`,
      disabled: true,
      metaText: "Fetching your saved plans…",
      previewHtml: `<div class="draft-empty-panel">Loading game plans…</div>`,
    });
    return;
  }

  if (!state.draftGamePlans.length) {
    paint(select, meta, preview, {
      key: "empty",
      options: `<option value="">No game plans found</option>`,
      disabled: true,
      metaText: "Create a game plan on the home page to use it here.",
      previewHtml: `<div class="draft-empty-panel">No saved game plans yet.</div>`,
    });
    return;
  }

  const plan = getSelectedPlan() || state.draftGamePlans[0];
  state.draftGamePlanSelectedId = plan.id;

  const formation = normalizeFormation(plan.formation);
  const players = state.draftGamePlanPlayers;
  // Re-render only when the plan, its players, or the loading flag actually change.
  const key = [
    plan.id,
    formation,
    state.draftGamePlanPlayersLoading ? "L" : "",
    players.map((p) => `${p.slot}:${p.player_id}`).join(","),
    state.draftGamePlans.map((p) => `${p.id}~${p.name}~${p.lineup_count}~${p.sub_count}`).join("|"),
  ].join("§");

  paint(select, meta, preview, {
    key,
    options: planOptionsHtml(plan.id),
    disabled: false,
    metaText: `${plan.name || "Plan"} · ${formation} · ${Number(plan.lineup_count || 0)}/11 starters`,
    previewHtml: state.draftGamePlanPlayersLoading
      ? `<div class="draft-empty-panel">Loading lineup…</div>`
      : renderSlotMapPreview("Consult this plan", mapPlayersBySlot(players), formation, { compact: true }),
  });
}

function paint(select, meta, preview, { key, options, disabled, metaText, previewHtml }) {
  if (preview.dataset.planKey === key) return;
  preview.dataset.planKey = key;

  select.innerHTML = options;
  select.disabled = disabled;
  meta.textContent = metaText;
  preview.innerHTML = previewHtml;
}
