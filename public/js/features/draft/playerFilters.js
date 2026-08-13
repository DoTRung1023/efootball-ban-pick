/* ============================================================
   The draft filter panel, shared by the ban and pick boards

   Both boards filter the same player shape through the same 18 fields, so the
   field tables, the panel markup, the event wiring and the predicate live here
   once and are parameterised by a `prefix` — "ban" or "pick".

   The prefix names both halves of the contract:
     state key  `${prefix}Filter${Field}`   e.g. banFilterClub / pickFilterClub
     element id `${prefix}Fc${Field}`       e.g. banFcClub    / pickFcClub

   A phase opts in by spreading `createDraftFilterState(prefix)` into `state`,
   putting an `.ap-dd-panel` in its toolbar, and calling the two functions at the
   bottom. Nothing else is per-phase.

   Two constraints shape the imports:

   - **`state` is passed in, never imported.** `state.js` spreads
     `createDraftFilterState()` into its own literal, so importing `state` here
     would be a cycle. `shared/players/filterPanel.js` takes `state` the same way.
   - `escapeHtml` comes from `shared/players/playerMeta.js` rather than the
     draft's own `utils.js` for the same reason — `utils.js` imports `state`.

   `LEAGUE_OPTIONS` is filled at runtime by `fetchFilterOptions()`, which is why
   every option list is read through a thunk rather than captured at module load.
   ============================================================ */

import {
  CARD_TYPE_OPTIONS,
  FOOT_OPTIONS,
  PLAYING_STYLE_OPTIONS,
  POSITION_OPTIONS,
  REGION_OPTIONS,
} from "./constants.js";
import { LEAGUE_OPTIONS } from "./filterOptions.js";
import { getPlayerCardValue } from "./players.js";
import { escapeHtml } from "@/shared/players/playerMeta.js";

/**
 * Coerces a *single* value to a valid position, or "".
 *
 * Not to be confused with `normalizePositionValue` in allowance.js, which takes
 * a comma-separated list and returns an array. They were nearly merged once;
 * they are not interchangeable.
 */
export function toValidPosition(raw) {
  const v = String(raw || "").trim().toUpperCase();
  return POSITION_OPTIONS.includes(v) ? v : "";
}

/* ── Field tables ─────────────────────────────────────────────
   These three tables are the single declaration of the 18 fields. Adding a
   filter means adding a row here; the markup, the clear button, the active-dot
   and the predicate all follow from it. */

/** Multi-selects. `field` is the state suffix, `id` the element-id fragment. */
const MULTI_FILTERS = [
  { field: "Positions", id: "Pos", attr: "pos-ms", label: "POSITION", allText: "All positions",
    max: 7, options: () => POSITION_OPTIONS, normalize: toValidPosition,
    read: (p) => String(p?.position || "").toUpperCase() },
  { field: "CardType", id: "Ct", attr: "ct-ms", label: "CARD TYPE", allText: "Any card type",
    options: () => CARD_TYPE_OPTIONS, read: (p) => String(p?.card_type ?? p?._raw?.card_type ?? "") },
  { field: "PlayingStyle", id: "Ps", attr: "ps-ms", label: "PLAYING STYLE", allText: "Any playing style",
    options: () => PLAYING_STYLE_OPTIONS, read: (p) => String(p?.playing_style ?? p?._raw?.playing_style ?? "") },
  { field: "Foot", id: "Foot", attr: "foot-ms", label: "FOOT", allText: "Any foot",
    options: () => FOOT_OPTIONS, read: (p) => String(p?.foot ?? p?._raw?.foot ?? "") },
  { field: "League", id: "Lg", attr: "lg-ms", label: "LEAGUE", allText: "Any league",
    options: () => LEAGUE_OPTIONS, read: (p) => String(p?.league ?? p?._raw?.league ?? "") },
  { field: "Region", id: "Rg", attr: "rg-ms", label: "REGION", allText: "Any region",
    options: () => REGION_OPTIONS, read: (p) => String(p?.region ?? p?._raw?.region ?? "") },
];

/** Numeric min/max pairs. `min`/`max` are state suffixes, `minId`/`maxId` id fragments. */
const RANGE_FILTERS = [
  { label: "OVERALL LEVEL 1", min: "OverallMin", max: "OverallMax", minId: "OvrMin", maxId: "OvrMax",
    read: (p) => Number(p?._raw?.overall ?? p?.overall_rating ?? 0) },
  { label: "OVERALL MAX", min: "OverallMaxMin", max: "OverallMaxMax", minId: "OvrMxMin", maxId: "OvrMxMax",
    read: (p) => Number(getPlayerCardValue(p)) },
  { label: "AGE", min: "AgeMin", max: "AgeMax", minId: "AgeMin", maxId: "AgeMax",
    read: (p) => Number(p?.age ?? p?._raw?.age ?? 0) },
  { label: "HEIGHT (cm)", min: "HeightMin", max: "HeightMax", minId: "HtMin", maxId: "HtMax",
    read: (p) => Number(p?.height ?? p?._raw?.height ?? 0) },
  { label: "WEIGHT (kg)", min: "WeightMin", max: "WeightMax", minId: "WtMin", maxId: "WtMax",
    read: (p) => Number(p?.weight ?? p?._raw?.weight ?? 0) },
];

/** Free-text contains-matches. */
const TEXT_FILTERS = [
  { field: "Club", id: "Club", label: "CLUB", placeholder: "e.g. FC Barcelona",
    read: (p) => String(p?.club ?? p?._raw?.club ?? "") },
  { field: "Nation", id: "Nation", label: "NATIONALITY", placeholder: "e.g. Brazil",
    read: (p) => String(p?.nationality ?? p?.nation ?? p?._raw?.nationality ?? "") },
];

const stateKey = (prefix, field) => `${prefix}Filter${field}`;
const inputId = (prefix, id) => `${prefix}Fc${id}`;
const msBtnId = (prefix, id) => `${prefix}${id}MsBtn`;
const msPanelId = (prefix, id) => `${prefix}${id}MsPanel`;
const idOf = (f) => (f.normalize || ((v) => v));

function listOf(st, prefix, field) {
  const v = st[stateKey(prefix, field)];
  return Array.isArray(v) ? v : [];
}

const selectedOf = (st, prefix, f) => listOf(st, prefix, f.field).map(idOf(f)).filter(Boolean);

// ── State ────────────────────────────────────────────────────

/** The 18 fields at their empty values. Spread into `state` once per phase. */
export function createDraftFilterState(prefix) {
  const fresh = {};
  for (const f of MULTI_FILTERS) fresh[stateKey(prefix, f.field)] = [];
  for (const r of RANGE_FILTERS) {
    fresh[stateKey(prefix, r.min)] = "";
    fresh[stateKey(prefix, r.max)] = "";
  }
  for (const t of TEXT_FILTERS) fresh[stateKey(prefix, t.field)] = "";
  return fresh;
}

export function resetDraftFilters(st, prefix) {
  Object.assign(st, createDraftFilterState(prefix));
}

/** Drives the little green dot on the FILTER button. */
export function hasActiveDraftFilters(st, prefix) {
  return (
    MULTI_FILTERS.some((f) => listOf(st, prefix, f.field).length) ||
    RANGE_FILTERS.some((r) => st[stateKey(prefix, r.min)] !== "" || st[stateKey(prefix, r.max)] !== "") ||
    TEXT_FILTERS.some((t) => String(st[stateKey(prefix, t.field)] || "").trim() !== "")
  );
}

// ── Predicate ────────────────────────────────────────────────

/** Applies every active filter for `prefix`. Returns a new array. */
export function applyDraftFilters(rows, st, prefix) {
  let out = rows;

  for (const f of MULTI_FILTERS) {
    const selected = new Set(selectedOf(st, prefix, f));
    if (selected.size) out = out.filter((p) => selected.has(f.read(p)));
  }

  for (const r of RANGE_FILTERS) {
    const min = st[stateKey(prefix, r.min)];
    const max = st[stateKey(prefix, r.max)];
    if (min !== "" && min != null) {
      const n = Number(min);
      out = out.filter((p) => { const v = r.read(p); return !isNaN(v) && v >= n; });
    }
    if (max !== "" && max != null) {
      const n = Number(max);
      out = out.filter((p) => { const v = r.read(p); return !isNaN(v) && v <= n; });
    }
  }

  for (const t of TEXT_FILTERS) {
    const q = String(st[stateKey(prefix, t.field)] || "").trim().toLowerCase();
    if (q) out = out.filter((p) => t.read(p).toLowerCase().includes(q));
  }

  return out;
}

// ── Markup ───────────────────────────────────────────────────

const msLabel = (arr, allText, max = 3) =>
  !arr.length ? allText : arr.length <= max ? arr.join(", ") : `${arr.slice(0, max).join(", ")} +${arr.length - max}`;

function msItemsHtml(options, selected, attr) {
  return options.map((v) => `
      <div class="pos-ms-item ${selected.includes(v) ? "checked" : ""}" data-${escapeHtml(attr)}="${escapeHtml(v)}">
        <span class="pos-ms-check"></span><span>${escapeHtml(v)}</span>
      </div>`).join("");
}

function multiSectionHtml(st, prefix, f) {
  const selected = selectedOf(st, prefix, f);
  return `
    <div class="filter-section">
      <div class="filter-section-label">${escapeHtml(f.label)}</div>
      <div class="pos-multiselect">
        <button class="pos-ms-btn ${selected.length ? "has-pos-filter" : ""}" id="${msBtnId(prefix, f.id)}" type="button">
          <span>${escapeHtml(msLabel(selected, f.allText, f.max))}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="pos-ms-panel" id="${msPanelId(prefix, f.id)}" data-options="${escapeHtml(optionsKey(f))}">${msItemsHtml(f.options(), selected, `${prefix}-${f.attr}`)}</div>
      </div>
    </div>`;
}

function rangeSectionHtml(st, prefix, r) {
  return `
    <div class="filter-section">
      <div class="filter-section-label">${escapeHtml(r.label)}</div>
      <div class="range-pair">
        <input type="number" class="filter-input" id="${inputId(prefix, r.minId)}" placeholder="Min" value="${escapeHtml(String(st[stateKey(prefix, r.min)] ?? ""))}">
        <span class="range-sep">—</span>
        <input type="number" class="filter-input" id="${inputId(prefix, r.maxId)}" placeholder="Max" value="${escapeHtml(String(st[stateKey(prefix, r.max)] ?? ""))}">
      </div>
    </div>`;
}

function textSectionHtml(st, prefix, t) {
  return `
    <div class="filter-section">
      <div class="filter-section-label">${escapeHtml(t.label)}</div>
      <input type="text" class="filter-input" id="${inputId(prefix, t.id)}" placeholder="${escapeHtml(t.placeholder)}" value="${escapeHtml(String(st[stateKey(prefix, t.field)] ?? ""))}" autocomplete="off">
    </div>`;
}

const byField = (field) => MULTI_FILTERS.find((f) => f.field === field);

/** Identifies a multi-select's option list, so a changed one can be spotted. */
const optionsKey = (f) => f.options().join("|");

/** The whole panel, from state. Written once — see `renderDraftFilterPanel`. */
function panelMarkup(st, prefix) {
  const multi = (field) => multiSectionHtml(st, prefix, byField(field));
  const range = (i) => rangeSectionHtml(st, prefix, RANGE_FILTERS[i]);
  return `
    <div class="filter-group-label">IDENTITY</div>
    ${multi("Positions")}${multi("CardType")}${multi("PlayingStyle")}${multi("Foot")}
    <div class="filter-group-label">STATS</div>
    ${range(0)}${range(1)}
    <div class="filter-group-label">CLUB &amp; ORIGIN</div>
    ${multi("League")}${multi("Region")}
    ${TEXT_FILTERS.map((t) => textSectionHtml(st, prefix, t)).join("")}
    <div class="filter-group-label">PHYSICAL</div>
    ${range(2)}${range(3)}${range(4)}
    <div class="filter-section">
      <button class="filter-clear-btn" id="${prefix}ClearFiltersBtn">CLEAR ALL FILTERS</button>
    </div>
  `;
}

/**
 * Fills a multi-select's list when its options change under it.
 *
 * `CARD_TYPE_OPTIONS` and friends are **mutable arrays filled at runtime** by
 * `fetchFilterOptions()`, which the lobby kicks off without awaiting — so the
 * lists can still be empty when the panel is built, and this is what fills them
 * in afterwards. It replaces the items *inside* the list, never the list itself,
 * so an expanded one stays expanded and no input is touched.
 */
function syncMsOptions(panel, st, prefix) {
  for (const f of MULTI_FILTERS) {
    const sub = panel.querySelector(`#${msPanelId(prefix, f.id)}`);
    const key = optionsKey(f);
    if (!sub || sub.dataset.options === key) continue;
    sub.dataset.options = key;
    sub.innerHTML = msItemsHtml(f.options(), selectedOf(st, prefix, f), `${prefix}-${f.attr}`);
  }
}

/** Repaints one multi-select's trigger — its summary label and its active tint. */
function paintMsButton(panel, st, prefix, f) {
  const btn = panel.querySelector(`#${msBtnId(prefix, f.id)}`);
  if (!btn) return;
  const selected = selectedOf(st, prefix, f);
  const span = btn.querySelector("span");
  if (span) span.textContent = msLabel(selected, f.allText, f.max);
  btn.classList.toggle("has-pos-filter", selected.length > 0);
}

/**
 * Writes the panel **once**, then leaves it alone.
 *
 * The four `.filter-group-label` sections mirror the catalog page's grouping —
 * IDENTITY / STATS / CLUB & ORIGIN / PHYSICAL.
 *
 * This is the same shape as `buildPlayerFilterPanel` on the home page, and for
 * the same reason. It used to rebuild from state on every call, which is twice a
 * second here because the ban and pick boards re-render on the presence poll —
 * so an expanded list was thrown away within half a second, and a focused CLUB
 * or Min/Max box was destroyed by the keystroke that filled it. You could type
 * exactly one character. **Nothing in a panel a poll rebuilds can hold state**,
 * and the fix is not to rebuild: after the first write, the DOM is the record of
 * what the user typed and expanded, and the handlers below patch the few things
 * that need to change. The home page's panel never had either bug because it has
 * always worked this way.
 *
 * Two things still happen per call, both idempotent and neither structural: the
 * FILTER dot, and `syncMsOptions` for option lists that arrive late.
 */
export function renderDraftFilterPanel(panel, st, prefix, dot) {
  if (!panel) return;

  if (dot) dot.style.display = hasActiveDraftFilters(st, prefix) ? "inline-block" : "none";

  if (panel.dataset.builtFor !== prefix) {
    panel.dataset.builtFor = prefix;
    panel.innerHTML = panelMarkup(st, prefix);
    return;
  }
  syncMsOptions(panel, st, prefix);
}

// ── Wiring ───────────────────────────────────────────────────

/**
 * Delegates every control inside the panel. Call once per phase.
 *
 * Delegation rather than a listener per control, because the option lists are
 * refilled when `fetchFilterOptions()` lands — the panel's shell is permanent
 * but the items inside a multi-select are not.
 *
 * Since `renderDraftFilterPanel` no longer rebuilds, **these handlers own the
 * DOM**: each one writes state and then patches the elements it changed. What
 * they must not do is leave a repaint to the next render, because there is no
 * next render.
 */
export function bindDraftFilterPanel(panel, st, prefix, onChange) {
  if (!panel) return;

  panel.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;

    /* The one place the markup is legitimately rewritten: every box, label and
       tick has to go back to empty at once, which is most of the panel. Nothing
       is focused — you just clicked a button — and no list needs to stay open. */
    if (e.target.closest(`#${prefix}ClearFiltersBtn`)) {
      resetDraftFilters(st, prefix);
      panel.innerHTML = panelMarkup(st, prefix);
      onChange();
      return;
    }

    for (const f of MULTI_FILTERS) {
      const item = e.target.closest(`[data-${prefix}-${f.attr}]`);
      if (item) {
        const value = idOf(f)(item.getAttribute(`data-${prefix}-${f.attr}`) || "");
        if (!value) return;
        const cur = new Set(selectedOf(st, prefix, f));
        const nowChecked = !cur.has(value);
        nowChecked ? cur.add(value) : cur.delete(value);
        st[stateKey(prefix, f.field)] = [...cur];
        // Tick and summary label, in place — the list stays open, which is the
        // point of a multi-select.
        item.classList.toggle("checked", nowChecked);
        paintMsButton(panel, st, prefix, f);
        onChange();
        return;
      }
    }

    /* Sub-panel open/close. stopPropagation keeps the outer dropdown open.

       Opening one closes the rest: they are absolutely positioned over the
       sections below them, so two at once overlap. */
    for (const f of MULTI_FILTERS) {
      const btn = e.target.closest(`#${msBtnId(prefix, f.id)}`);
      if (btn) {
        const open = !panel.querySelector(`#${msPanelId(prefix, f.id)}`)?.classList.contains("open");
        for (const other of MULTI_FILTERS) {
          const on = open && other.id === f.id;
          panel.querySelector(`#${msPanelId(prefix, other.id)}`)?.classList.toggle("open", on);
          panel.querySelector(`#${msBtnId(prefix, other.id)}`)?.classList.toggle("open", on);
        }
        e.stopPropagation();
        return;
      }
    }
  });

  /* Every scalar field, keyed by element id. Nothing to repaint for these — the
     input the user is typing into already shows its own value. */
  const scalarByInputId = new Map();
  for (const r of RANGE_FILTERS) {
    scalarByInputId.set(inputId(prefix, r.minId), stateKey(prefix, r.min));
    scalarByInputId.set(inputId(prefix, r.maxId), stateKey(prefix, r.max));
  }
  for (const t of TEXT_FILTERS) {
    scalarByInputId.set(inputId(prefix, t.id), stateKey(prefix, t.field));
  }

  panel.addEventListener("input", (e) => {
    if (!(e.target instanceof Element)) return;
    const key = scalarByInputId.get(e.target.id);
    if (!key) return;
    st[key] = e.target.value;
    onChange();
  });
}
