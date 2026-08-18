/**
 * The lobby's allowance editor: the category picker plus one row per enabled
 * category (a value control and, where applicable, a per-value card cap).
 *
 * Card type / region / playing style share one multi-select and one cap-panel
 * shape, so both are built from the descriptor tables below. Position and the
 * text-list categories (club/league/nationality) have their own markup.
 *
 * The generated class names and data- attributes are load-bearing:
 * `css/features/draft/lobby.css` styles them and initLobby delegates events
 * off them.
 */

import {
  ALLOWANCE_CATEGORY_DEFS,
  ALLOWANCE_DEF_MAP,
  POSITION_OPTIONS,
  FOOT_OPTIONS,
  CARD_TYPE_OPTIONS,
  REGION_OPTIONS,
  PLAYING_STYLE_OPTIONS,
  TEXT_ALLOWANCE_LIST_KEYS,
  ALLOWANCE_SIMPLE_COUNT_KEYS,
} from '@/features/draft/constants.js';

import {
  normalizePositionValue,
  normalizeFootValue,
  normalizeCardTypeValue,
  normalizeRegionValue,
  normalizePlayingStyleValue,
  normalizeTextAllowanceListValue,
  positionSummaryText,
  cardTypeSummaryText,
  regionSummaryText,
  playingStyleSummaryText,
  normalizeAllowanceCapValue,
  parsePositionCapMap,
  positionCapSummaryText,
  parseCardTypeCapMap,
  cardTypeCapSummaryText,
  parseRegionCapMap,
  regionCapSummaryText,
  parsePlayingStyleCapMap,
  playingStyleCapSummaryText,
  parseTextAllowanceCapMap,
  stringifyTextAllowanceCapMap,
  parseAllowanceRangeValue,
} from '@/features/draft/allowance.js';

import { escapeHtml } from '@/features/draft/utils.js';
import { state } from '@/features/draft/state.js';
import { clubSuggestPanelHtml } from './clubSuggest.js';

const MAX_CAP = 23;

/** Categories rendered with the shared multi-select dropdown. */
const MULTI_SELECT_KINDS = {
  cardType: {
    options: CARD_TYPE_OPTIONS,
    normalize: normalizeCardTypeValue,
    summary: cardTypeSummaryText,
    openStateKey: "openAllowanceCardTypeKey",
    panelModifier: " allowance-multi-panel--single-column",
  },
  region: {
    options: REGION_OPTIONS,
    normalize: normalizeRegionValue,
    summary: regionSummaryText,
    openStateKey: "openAllowanceRegionKey",
    panelModifier: "",
  },
  playingStyle: {
    options: PLAYING_STYLE_OPTIONS,
    normalize: normalizePlayingStyleValue,
    summary: playingStyleSummaryText,
    openStateKey: "openAllowancePlayingStyleKey",
    panelModifier: "",
  },
};

/** Per-value cap panels for the same three categories. */
const CAP_KINDS = {
  cardType: {
    options: CARD_TYPE_OPTIONS,
    parse: parseCardTypeCapMap,
    summary: cardTypeCapSummaryText,
    openStateKey: "openAllowanceCardTypeCapKey",
    wrapModifier: "",
    emptyText: "No card types available",
  },
  region: {
    options: REGION_OPTIONS,
    parse: parseRegionCapMap,
    summary: regionCapSummaryText,
    openStateKey: "openAllowanceRegionCapKey",
    wrapModifier: " allowance-cap-wrap--region",
    emptyText: "No regions available",
  },
  playingStyle: {
    options: PLAYING_STYLE_OPTIONS,
    parse: parsePlayingStyleCapMap,
    summary: playingStyleCapSummaryText,
    openStateKey: "openAllowancePlayingStyleCapKey",
    wrapModifier: " allowance-cap-wrap--playing-style",
    emptyText: "No playing styles available",
  },
};

const disabledAttr = (canEdit) => (canEdit ? "" : "disabled");
const openClass = (isOpen) => (isOpen ? "is-open" : "");
const disabledClass = (canEdit) => (canEdit ? "" : "is-disabled");

/** A 1..23 card-count input, shared by every cap panel. */
function capNumberInput({ className, dataAttrs, value, canEdit }) {
  return `<input
                  class="${className}"
                  ${dataAttrs}
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="${MAX_CAP}"
                  step="1"
                  value="${escapeHtml(value || "")}"
                  placeholder="-"
                  ${disabledAttr(canEdit)}
                />`;
}

function multiSelectHtml(kind, { key, value, canEdit }) {
  const spec = MULTI_SELECT_KINDS[kind];
  const selected = spec.normalize(value);
  const selectedSet = new Set(selected);
  const isOpen = canEdit && state[spec.openStateKey] === key;

  const options = spec.options.map((option) => `
            <button
              type="button"
              class="allowance-multi-option ${selectedSet.has(option) ? "is-selected" : ""}"
              data-allowance-multi-option="${kind}"
              data-allowance-multi-value="${escapeHtml(option)}"
            >
              <span class="allowance-multi-check" aria-hidden="true"></span>
              <span>${escapeHtml(option)}</span>
            </button>
          `).join("");

  return `
      <div class="allowance-multi-dropdown ${disabledClass(canEdit)} ${openClass(isOpen)}" data-allowance-multi-dropdown="${kind}" data-allowance-multi-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-multi-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(selected.join(","))}"
        />
        <button
          type="button"
          class="allowance-multi-trigger"
          data-allowance-multi-trigger="${kind}"
          ${disabledAttr(canEdit)}
        >
          <span class="allowance-multi-summary">${escapeHtml(spec.summary(selected))}</span>
          <span class="allowance-multi-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-multi-panel${spec.panelModifier}" data-allowance-multi-panel="${kind}">
          ${options}
          ${spec.options.length === 0 ? '<div class="allowance-multi-empty">No options available</div>' : ''}
        </div>
      </div>
    `;
}

function capPanelHtml(kind, { key, value, cfg, canEdit }) {
  const spec = CAP_KINDS[kind];
  const selected = MULTI_SELECT_KINDS[kind].normalize(value);
  const capMap = spec.parse(cfg.allowanceCaps?.[kind], selected);
  const effective = selected.length ? selected : spec.options;
  const isOpen = canEdit && state[spec.openStateKey] === key;

  const rows = effective.length
    ? effective.map((item) => `
              <label class="allowance-cap-row">
                <span class="allowance-cap-item">${escapeHtml(item)}</span>
                ${capNumberInput({
                  className: "allowance-cap-input",
                  dataAttrs: `data-allowance-cap-input data-allowance-cap-key="${kind}" data-allowance-cap-value="${escapeHtml(item)}"`,
                  value: capMap[item],
                  canEdit,
                })}
              </label>
            `).join("")
    : `<div class="allowance-cap-empty">${spec.emptyText}</div>`;

  return `
      <div class="allowance-cap-wrap${spec.wrapModifier} ${disabledClass(canEdit)} ${openClass(isOpen)}" data-allowance-cap-wrap data-allowance-cap-key="${key}">
        <span class="allowance-cap-label">Max cards</span>
        <button
          type="button"
          class="allowance-cap-trigger"
          data-allowance-cap-trigger="${kind}"
          ${disabledAttr(canEdit)}
        >
          <span class="allowance-cap-summary">${escapeHtml(spec.summary(capMap, selected))}</span>
          <span class="allowance-cap-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-cap-panel" data-allowance-cap-panel>
          ${rows}
        </div>
      </div>
    `;
}

function positionSelectHtml({ key, value, canEdit }) {
  const selected = normalizePositionValue(value);
  const selectedSet = new Set(selected);
  const isOpen = canEdit && state.openAllowancePosKey === key;

  return `
      <div class="allowance-pos-dropdown ${disabledClass(canEdit)} ${openClass(isOpen)}" data-allowance-pos-dropdown data-allowance-pos-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-pos-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(selected.join(","))}"
        />
        <button
          type="button"
          class="allowance-pos-trigger"
          data-allowance-pos-trigger
          ${disabledAttr(canEdit)}
        >
          <span class="allowance-pos-summary">${escapeHtml(positionSummaryText(selected))}</span>
          <span class="allowance-pos-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-pos-panel" data-allowance-pos-panel>
          ${POSITION_OPTIONS.map((pos) => `
            <button
              type="button"
              class="allowance-pos-option ${selectedSet.has(pos) ? "is-selected" : ""}"
              data-allowance-pos-option="${pos}"
            >
              <span class="allowance-pos-check" aria-hidden="true"></span>
              <span>${pos}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
}

function positionCapHtml({ key, value, cfg, canEdit }) {
  const selected = normalizePositionValue(value);
  const effective = selected.length ? selected : POSITION_OPTIONS;
  const capMap = parsePositionCapMap(cfg.allowanceCaps?.position, effective);
  const isOpen = canEdit && state.openAllowancePosCapKey === key;

  const rows = effective.length
    ? effective.map((pos) => `
              <label class="allowance-pos-cap-row">
                <span class="allowance-pos-cap-pos">${pos}</span>
                ${capNumberInput({
                  className: "allowance-pos-cap-input",
                  dataAttrs: `data-allowance-pos-cap-input data-allowance-cap-key="position" data-allowance-pos="${pos}"`,
                  value: capMap[pos],
                  canEdit,
                })}
              </label>
            `).join("")
    : '<div class="allowance-pos-cap-empty">No positions available</div>';

  return `
      <div class="allowance-pos-cap-wrap ${disabledClass(canEdit)} ${openClass(isOpen)}" data-allowance-pos-cap-wrap data-allowance-pos-cap-key="${key}">
        <span class="allowance-cap-label">Max cards</span>
        <button
          type="button"
          class="allowance-pos-cap-trigger"
          data-allowance-pos-cap-trigger
          ${disabledAttr(canEdit)}
        >
          <span class="allowance-pos-cap-summary">${escapeHtml(positionCapSummaryText(capMap, selected))}</span>
          <span class="allowance-pos-cap-caret" aria-hidden="true"></span>
        </button>
        <div class="allowance-pos-cap-panel" data-allowance-pos-cap-panel>
          ${rows}
        </div>
      </div>
    `;
}

function footChecklistHtml({ key, value, canEdit }) {
  const selected = normalizeFootValue(value, { defaultAll: true });
  const selectedSet = new Set(selected);
  return `
      <div class="allowance-foot-list" data-allowance-foot-list data-allowance-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-foot-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(selected.join(","))}"
        />
        ${FOOT_OPTIONS.map((foot) => `
          <button
            type="button"
            class="allowance-foot-option ${selectedSet.has(foot) ? "is-selected" : ""}"
            data-allowance-foot-option="${foot}"
            ${disabledAttr(canEdit)}
          >
            <span class="allowance-foot-check" aria-hidden="true"></span>
            <span>${foot}</span>
          </button>
        `).join("")}
      </div>
    `;
}

function rangeInputHtml({ key, value, def, canEdit }) {
  const range = parseAllowanceRangeValue(value);
  const bound = (name, label, placeholder, boundValue) => `
        <label class="allowance-item-range-col">
          <span class="allowance-item-range-label">${label}</span>
          <input
            class="allowance-item-input allowance-item-range"
            data-allowance-key="${key}"
            data-allowance-range-bound="${name}"
            type="number"
            inputmode="numeric"
            step="1"
            placeholder="${escapeHtml(placeholder || "-")}"
            value="${escapeHtml(boundValue)}"
            ${disabledAttr(canEdit)}
          />
        </label>`;

  /* The heading answers "min what?" — this pair and the player-count pair beside
     it are both Min/Max boxes, and without a unit over each they read as the
     same question asked twice. */
  return `
      <div class="allowance-range-block">
        <span class="allowance-count-title">${escapeHtml(def.unit || def.label)}</span>
        <div class="allowance-item-range-grid">
          ${bound("min", "Min", def.minPlaceholder, range.min)}
          ${bound("max", "Max", def.maxPlaceholder, range.max)}
        </div>
      </div>
    `;
}

function regularInputHtml({ key, value, def, canEdit }) {
  return `
      <input
        class="allowance-item-input"
        data-allowance-key="${key}"
        type="${def.type}"
        placeholder="${escapeHtml(def.placeholder)}"
        value="${escapeHtml(value)}"
        ${disabledAttr(canEdit)}
      />
    `;
}

/** Club / league / nationality: a searchable list with a per-entry cap. */
function textListBuilderHtml({ key, value, cfg, def, canEdit }) {
  const selected = normalizeTextAllowanceListValue(value);
  const capMap = parseTextAllowanceCapMap(cfg.allowanceCaps?.[key], selected);
  const effective = selected.length ? selected : Object.keys(capMap);
  const capMapString = stringifyTextAllowanceCapMap(capMap, effective);
  const singular = String(def.label || key).toLowerCase();
  const searchActive = state.clubSearchKey === key;

  return `
      <div class="allowance-club-builder" data-allowance-club-builder data-allowance-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-club-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(effective.join(","))}"
        />
        <input
          type="hidden"
          class="allowance-club-cap-hidden"
          data-allowance-cap-key="${key}"
          value="${escapeHtml(capMapString)}"
        />
        <div class="allowance-club-add-row">
          <div class="allowance-club-search-wrap" data-allowance-club-search-wrap>
            <input
              class="allowance-item-input allowance-club-search"
              data-allowance-club-search="${key}"
              type="text"
              placeholder="Search ${escapeHtml(singular)} and add"
              value="${escapeHtml(searchActive ? (state.clubSearchQuery || "") : "")}"
              autocomplete="off"
              ${disabledAttr(canEdit)}
            />
            <div class="allowance-club-suggest-panel ${searchActive && state.clubSearchOpen ? "is-open" : ""}" data-allowance-club-suggest-panel="${key}">
              ${suggestionPanelInnerHtml(searchActive, singular)}
            </div>
          </div>
          <button
            type="button"
            class="allowance-club-add-btn"
            data-allowance-club-add="${key}"
            ${disabledAttr(canEdit)}
          >
            Add ${escapeHtml(singular)}
          </button>
          <button
            type="button"
            class="allowance-remove-btn allowance-club-remove-category"
            data-allowance-remove="${key}"
            ${disabledAttr(canEdit)}
          >
            Remove
          </button>
        </div>
        <div class="allowance-club-list" data-allowance-club-list="${key}">
          ${effective.length
            ? effective.map((item) => textListRowHtml(item, capMap[item], canEdit)).join("")
            : `<div class="allowance-club-empty">No ${escapeHtml(singular)} added yet.</div>`}
        </div>
      </div>
    `;
}

function suggestionPanelInnerHtml(searchActive, singular) {
  return searchActive ? clubSuggestPanelHtml(singular) : "";
}

function textListRowHtml(item, cap, canEdit) {
  return `
              <div class="allowance-club-row" data-allowance-club-item="${escapeHtml(item)}">
                <span class="allowance-club-name" title="${escapeHtml(item)}">${escapeHtml(item)}</span>
                <label class="allowance-club-cap-col">
                  <span class="allowance-club-cap-label">Max cards</span>
                  ${capNumberInput({
                    className: "allowance-club-cap-input",
                    dataAttrs: `data-allowance-club-cap="${escapeHtml(item)}"`,
                    value: cap,
                    canEdit,
                  })}
                </label>
                <button
                  type="button"
                  class="allowance-club-row-remove"
                  data-allowance-club-remove="${escapeHtml(item)}"
                  ${disabledAttr(canEdit)}
                >
                  Remove
                </button>
              </div>
            `;
}

/**
 * How many players of this category a squad may hold — the pair of counts that
 * the range categories and Foot were missing entirely.
 *
 * Both are blank by default and blank means "no rule": a minimum of 0 asks for
 * nothing and a maximum of 23 is the whole squad, which is why those two
 * numbers are the placeholders rather than pre-filled values. Filling either in
 * is the only way to get a constraint, and an empty field can never be one by
 * accident.
 */
function countPairHtml({ key, minValue, capValue, canEdit }) {
  const field = (cls, dataAttr, value, placeholder, label, title) => `
            <label class="allowance-count-col" title="${escapeHtml(title)}">
              <span class="allowance-cap-label">${label}</span>
              <input
                class="allowance-item-input ${cls}"
                ${dataAttr}="${key}"
                type="number"
                inputmode="numeric"
                min="0"
                max="${MAX_CAP}"
                step="1"
                placeholder="${placeholder}"
                value="${escapeHtml(value)}"
                ${disabledAttr(canEdit)}
              />
            </label>`;

  return `
          <div class="allowance-count-pair">
            <span class="allowance-count-title">Players</span>
            <div class="allowance-count-grid">
              ${field("allowance-item-min", "data-allowance-min-key", minValue, "0", "Min",
                      "Fewest cards of this category the squad must contain")}
              ${field("allowance-item-cap", "data-allowance-cap-key", capValue, String(MAX_CAP), "Max",
                      "Most cards of this category the squad may contain")}
            </div>
          </div>
          `;
}

/** Builds one row of the allowance list. */
function allowanceItemHtml(key, { cfg, canEdit }) {
  const def = ALLOWANCE_DEF_MAP.get(key);
  if (!def) return "";

  const value = cfg.allowance?.[key] ?? "";
  const ctx = { key, value, cfg, def, canEdit };

  const isPosition = key === "position";
  const isFoot = key === "foot";
  const isTextList = TEXT_ALLOWANCE_LIST_KEYS.has(key);
  const isMulti = Boolean(MULTI_SELECT_KINDS[key]);
  const isRange = def.type === "range";

  const mainHtml = isPosition ? positionSelectHtml(ctx)
    : isMulti ? multiSelectHtml(key, ctx)
    : isTextList ? textListBuilderHtml(ctx)
    : isRange ? rangeInputHtml(ctx)
    : isFoot ? footChecklistHtml(ctx)
    : regularInputHtml(ctx);

  const richCapHtml = isPosition ? positionCapHtml(ctx)
    : isMulti ? capPanelHtml(key, ctx)
    : null;

  /* Position and the multi-selects cap each value on its own; the text lists
     carry theirs inside the value builder. Everything else — the five ranges
     and Foot — takes one min/max pair, which is exactly the set that used to
     render no count control at all and be skipped by the pick-time check. */
  const showCountPair = ALLOWANCE_SIMPLE_COUNT_KEYS.has(key);
  const hasCapColumn = !isTextList && Boolean(richCapHtml || showCountPair);

  const capColumn = richCapHtml
    ?? (showCountPair
      ? countPairHtml({
          key,
          minValue: normalizeAllowanceCapValue(cfg.allowanceMins?.[key]),
          capValue: normalizeAllowanceCapValue(cfg.allowanceCaps?.[key]),
          canEdit,
        })
      : "");

  return `
      <div class="allowance-item" data-allowance-key="${key}">
        <label>${escapeHtml(def.label)}</label>
        <div class="allowance-item-row ${hasCapColumn ? "" : "allowance-item-row--no-cap"}">
          <div class="allowance-item-main">${mainHtml}</div>
          ${capColumn}
          ${isTextList ? "" : `<button type="button" class="allowance-remove-btn" data-allowance-remove="${key}" ${disabledAttr(canEdit)}>Remove</button>`}
        </div>
      </div>
    `;
}

/** Clears any open-dropdown state that the current permissions make unreachable. */
function resetOpenPanels(canEdit, enabledSet) {
  const clearCapKeys = () => {
    state.openAllowancePosCapKey = "";
    state.openAllowancePosScrollTop = 0;
    state.openAllowanceCardTypeCapKey = "";
    state.openAllowanceRegionCapKey = "";
    state.openAllowancePlayingStyleCapKey = "";
  };

  if (!canEdit) {
    state.openAllowancePosKey = "";
    clearCapKeys();
  } else if (state.openAllowancePosKey && !enabledSet.has(state.openAllowancePosKey)) {
    state.openAllowancePosKey = "";
    clearCapKeys();
  }
}

function renderCategoryPicker({ dropdown, trigger, label, panel, addBtn }, { enabledSet, canEdit }) {
  const selectedKey = dropdown.dataset.selectedKey || "";
  const available = ALLOWANCE_CATEGORY_DEFS
    .filter((d) => !enabledSet.has(d.key))
    .sort((a, b) => a.label.localeCompare(b.label));
  const nextSelected = available.some((d) => d.key === selectedKey) ? selectedKey : "";

  dropdown.dataset.selectedKey = nextSelected;
  addBtn.disabled = !canEdit || !nextSelected;
  trigger.disabled = !canEdit || !available.length;
  trigger.classList.toggle("is-placeholder", !nextSelected);
  trigger.classList.toggle("open", panel.classList.contains("is-open"));
  label.textContent =
    available.find((d) => d.key === nextSelected)?.label
    || (available.length ? "Choose a category" : "All categories added");

  panel.innerHTML = available.length
    ? available.map((d) => `
      <button type="button" class="allowance-category-option ${d.key === nextSelected ? "is-selected" : ""}" data-allowance-category-option="${d.key}" ${disabledAttr(canEdit)}>
        <span>${escapeHtml(d.label)}</span>
        <span class="allowance-category-check" aria-hidden="true">✓</span>
      </button>
    `).join("")
    : '<div class="allowance-category-option is-selected" role="presentation"><span>All categories added</span></div>';

  panel.classList.toggle("is-disabled", !canEdit);
}

export function renderAllowanceList({ isHost, cfg }) {
  const els = {
    dropdown: document.getElementById("allowanceCategoryDd"),
    trigger: document.getElementById("allowanceCategoryTrigger"),
    label: document.getElementById("allowanceCategoryLabel"),
    panel: document.getElementById("allowanceCategoryPanel"),
    addBtn: document.getElementById("addAllowanceBtn"),
    list: document.getElementById("allowanceList"),
    controls: document.getElementById("allowanceControls"),
  };
  if (Object.values(els).some((el) => !el)) return;

  const enabled = Array.isArray(cfg.allowanceEnabled) ? cfg.allowanceEnabled : [];
  const enabledSet = new Set(enabled);
  const canEdit = isHost && !cfg.allowAllPlayers;

  els.controls.classList.toggle("is-disabled", !canEdit);
  resetOpenPanels(canEdit, enabledSet);

  // Preserve the position panel's scroll offset across the innerHTML rebuild.
  const openPosKey = state.openAllowancePosKey;
  const posPanelSelector = `[data-allowance-pos-dropdown][data-allowance-pos-key="${openPosKey}"] .allowance-pos-panel`;
  const openPosScrollTop = openPosKey
    ? document.querySelector(posPanelSelector)?.scrollTop ?? state.openAllowancePosScrollTop
    : state.openAllowancePosScrollTop;
  if (openPosKey) state.openAllowancePosScrollTop = openPosScrollTop;

  if (!canEdit) {
    els.panel.classList.remove("is-open");
    els.trigger.classList.remove("open");
    els.trigger.setAttribute("aria-expanded", "false");
  }

  renderCategoryPicker(els, { enabledSet, canEdit });

  if (!enabled.length) {
    els.list.innerHTML = '<div class="allowance-empty">No categories added. All players are allowed.</div>';
    return;
  }

  /**
   * Never rebuild the rows out from under someone typing in them.
   *
   * This list is rebuilt from `innerHTML` on every render, and a render follows
   * every config echo — so about a second after a keystroke the host's field was
   * destroyed and recreated: focus went to `<body>`, and the forced blur fired
   * `change`, which clamps and swaps an inverted pair. Typing "35" into a max
   * with 30 in the min came back as 30, and the next character made it 305.
   *
   * A focused **button** is not typing — Remove has to be able to rebuild the
   * list it lives in — and a changed category set rebuilds regardless, so
   * adding and removing still work. The guest never holds focus here: their
   * inputs are disabled, so their view keeps updating live.
   */
  const active = document.activeElement;
  const isTypingInList = Boolean(
    active && els.list.contains(active) && active.tagName === "INPUT" && active.type !== "hidden",
  );
  const signature = `${enabled.join("|")}|${canEdit}`;

  if (isTypingInList && els.list.dataset.signature === signature) return;

  els.list.dataset.signature = signature;
  els.list.innerHTML = enabled.map((key) => allowanceItemHtml(key, { cfg, canEdit })).join("");

  if (openPosKey) {
    const openPanel = document.querySelector(posPanelSelector);
    if (openPanel) openPanel.scrollTop = openPosScrollTop;
  }
}
