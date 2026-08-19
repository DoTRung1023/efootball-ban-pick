/**
 * The lobby's allowance editor: the category picker plus one row per enabled
 * category.
 *
 * Four row shapes, one per `def.shape` (see `ALLOWANCE_CATEGORY_DEFS`), and
 * three of them are the same row: `fixed`, `list` and `search` all render a
 * value list where every entry carries its own Min and Max, and differ only in
 * what puts entries into it. `range` is the odd one — a numeric span with a
 * single Min/Max pair for the whole category.
 *
 * The generated class names and data- attributes are load-bearing:
 * `css/features/draft/lobby.css` styles them and initLobby delegates events
 * off them.
 */

import {
  ALLOWANCE_CATEGORY_DEFS,
  ALLOWANCE_DEF_MAP,
  ALLOWANCE_FIXED_LIST_KEYS,
  ALLOWANCE_SEARCH_KEYS,
  ALLOWANCE_VALUE_LIST_KEYS,
  FIXED_PICKS_PER_SIDE,
} from '@/features/draft/constants.js';

import {
  normalizeAllowanceCapValue,
  normalizeAllowanceListValue,
  parseAllowanceCountMap,
  parseAllowanceRangeValue,
} from '@/features/draft/allowance.js';

import { escapeHtml } from '@/features/draft/utils.js';
import { state } from '@/features/draft/state.js';
import { allowancePickerPanelHtml, allowanceValueNoun } from './valuePicker.js';

const disabledAttr = (canEdit) => (canEdit ? "" : "disabled");
const disabledClass = (canEdit) => (canEdit ? "" : "is-disabled");

/**
 * One Min or Max box.
 *
 * Both are blank by default and blank means "no rule": a minimum of 0 asks for
 * nothing and a maximum of 23 is the whole squad, which is why those two
 * numbers are the *placeholders* rather than pre-filled values. Filling one in
 * is the only way to get a constraint, so an empty field can never be one by
 * accident.
 */
function countField({ label, cls, dataAttrs, value, placeholder, title, canEdit }) {
  return `
            <label class="allowance-count-col" title="${escapeHtml(title)}">
              <span class="allowance-cap-label">${label}</span>
              <input
                class="${cls}"
                ${dataAttrs}
                type="number"
                inputmode="numeric"
                min="0"
                max="${FIXED_PICKS_PER_SIDE}"
                step="1"
                placeholder="${placeholder}"
                value="${escapeHtml(value || "")}"
                ${disabledAttr(canEdit)}
              />
            </label>`;
}

/** The Min/Max pair a whole `range` category takes. */
function rangeCountPairHtml({ key, minValue, capValue, canEdit }) {
  return `
          <div class="allowance-count-pair">
            <span class="allowance-count-title">Players</span>
            <div class="allowance-count-grid">
              ${countField({
                label: "Min", cls: "allowance-item-input allowance-item-min",
                dataAttrs: `data-allowance-min-key="${key}"`, value: minValue, placeholder: "0",
                title: "Fewest cards of this category the squad must contain", canEdit,
              })}
              ${countField({
                label: "Max", cls: "allowance-item-input allowance-item-cap",
                dataAttrs: `data-allowance-cap-key="${key}"`, value: capValue,
                placeholder: String(FIXED_PICKS_PER_SIDE),
                title: "Most cards of this category the squad may contain", canEdit,
              })}
            </div>
          </div>
          `;
}

function rangeInputHtml({ key, value, def, canEdit }) {
  const range = parseAllowanceRangeValue(value);
  const bound = (name, label, boundValue) => `
        <label class="allowance-item-range-col">
          <span class="allowance-item-range-label">${label}</span>
          <input
            class="allowance-item-input allowance-item-range"
            data-allowance-key="${key}"
            data-allowance-range-bound="${name}"
            type="number"
            inputmode="numeric"
            step="1"
            placeholder="-"
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
          ${bound("min", "Min", range.min)}
          ${bound("max", "Max", range.max)}
        </div>
      </div>
    `;
}

/** One selected value: its name, its own Min/Max, and (unless fixed) Remove. */
function valueRowHtml({ key, value, min, cap, removable, canEdit }) {
  return `
              <div class="allowance-value-row" data-allowance-value-item="${escapeHtml(value)}">
                <span class="allowance-value-name" title="${escapeHtml(value)}">${escapeHtml(value)}</span>
                <div class="allowance-value-counts">
                  ${countField({
                    label: "Min", cls: "allowance-value-count allowance-value-min",
                    dataAttrs: `data-allowance-value-min="${escapeHtml(value)}"`, value: min,
                    placeholder: "0", title: `Fewest ${escapeHtml(value)} cards the squad must contain`, canEdit,
                  })}
                  ${countField({
                    label: "Max", cls: "allowance-value-count allowance-value-max",
                    dataAttrs: `data-allowance-value-max="${escapeHtml(value)}"`, value: cap,
                    placeholder: String(FIXED_PICKS_PER_SIDE),
                    title: `Most ${escapeHtml(value)} cards the squad may contain`, canEdit,
                  })}
                </div>
                ${removable ? `<button
                  type="button"
                  class="allowance-value-remove"
                  data-allowance-value-remove="${escapeHtml(value)}"
                  ${disabledAttr(canEdit)}
                >Remove</button>` : ""}
              </div>
            `;
}

/**
 * The add row: one box that is a filter for a `list` category and a search for
 * a `search` one.
 *
 * Only `search` keeps an explicit Add button, and only because its values are
 * free text — club and nationality match on a substring, so "Barcelona" is a
 * deliberate half of "FC Barcelona" and no suggestion list can offer it. A
 * `list` category's values must come from its list, where clicking one *is* the
 * add and a button would be a second click for nothing.
 */
function valuePickerHtml({ key, canEdit }) {
  const noun = allowanceValueNoun(key);
  const isSearch = ALLOWANCE_SEARCH_KEYS.has(key);
  const isActive = state.allowancePickerKey === key;

  return `
        <div class="allowance-add-row ${isSearch ? "" : "allowance-add-row--no-button"}">
          <div class="allowance-picker-wrap" data-allowance-picker-wrap>
            <input
              class="allowance-item-input allowance-picker-search"
              data-allowance-picker-search="${key}"
              type="text"
              placeholder="${isSearch ? `Search ${escapeHtml(noun)} and add` : `Filter ${escapeHtml(noun)}`}"
              value="${escapeHtml(isActive ? (state.allowancePickerQuery || "") : "")}"
              autocomplete="off"
              ${disabledAttr(canEdit)}
            />
            <div class="allowance-picker-panel ${isActive && state.allowancePickerOpen ? "is-open" : ""}" data-allowance-picker-panel="${key}">
              ${isActive && state.allowancePickerOpen ? allowancePickerPanelHtml(key) : ""}
            </div>
          </div>
          ${isSearch ? `<button
            type="button"
            class="allowance-add-btn"
            data-allowance-value-add="${key}"
            ${disabledAttr(canEdit)}
          >Add ${escapeHtml(noun)}</button>` : ""}
        </div>`;
}

/** Every per-value category's body: a picker (unless fixed) over a value list. */
function valueListHtml({ key, value, cfg, def, canEdit }) {
  const values = normalizeAllowanceListValue(key, value);
  const caps = parseAllowanceCountMap(cfg.allowanceCaps?.[key], values);
  const mins = parseAllowanceCountMap(cfg.allowanceMins?.[key], values);
  const isFixed = ALLOWANCE_FIXED_LIST_KEYS.has(key);

  return `
      <div class="allowance-value-builder" data-allowance-value-builder data-allowance-key="${key}">
        <input
          type="hidden"
          class="allowance-item-input allowance-value-hidden"
          data-allowance-key="${key}"
          value="${escapeHtml(values.join(","))}"
        />
        ${isFixed ? "" : valuePickerHtml({ key, canEdit })}
        <div class="allowance-value-list">
          ${isFixed ? `<span class="allowance-count-title">${escapeHtml(def.unit || def.label)}</span>` : ""}
          ${values.length
            ? values.map((item) => valueRowHtml({
                key, value: item, min: mins[item], cap: caps[item],
                removable: !isFixed, canEdit,
              })).join("")
            : `<div class="allowance-value-empty">No ${escapeHtml(allowanceValueNoun(key))} added yet — every ${escapeHtml(allowanceValueNoun(key))} is allowed.</div>`}
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
  const isRange = def.shape === "range";

  /* A per-value category spans the whole row: its counts are inside its value
     list, so there is no right-hand column to put beside it. */
  const mainHtml = isRange ? rangeInputHtml(ctx) : valueListHtml(ctx);
  const capColumn = isRange
    ? rangeCountPairHtml({
        key,
        minValue: normalizeAllowanceCapValue(cfg.allowanceMins?.[key]),
        capValue: normalizeAllowanceCapValue(cfg.allowanceCaps?.[key]),
        canEdit,
      })
    : "";

  return `
      <div class="allowance-item" data-allowance-key="${key}">
        <div class="allowance-item-head">
          <label>${escapeHtml(def.label)}</label>
          <button type="button" class="allowance-remove-btn" data-allowance-remove="${key}" ${disabledAttr(canEdit)}>Remove</button>
        </div>
        <div class="allowance-item-row ${isRange ? "" : "allowance-item-row--full"}">
          <div class="allowance-item-main">${mainHtml}</div>
          ${capColumn}
        </div>
      </div>
    `;
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

  /* A picker the current permissions or the current category set make
     unreachable would otherwise stay "open" forever in state. */
  if (!canEdit || (state.allowancePickerKey && !enabledSet.has(state.allowancePickerKey))) {
    state.allowancePickerOpen = false;
  }

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
   *
   * The signature carries each category's value list as well as the category
   * set: adding a club while the search box has focus has to draw the new row.
   */
  const active = document.activeElement;
  const isTypingInList = Boolean(
    active && els.list.contains(active) && active.tagName === "INPUT" && active.type !== "hidden",
  );
  const signature = enabled
    .map((key) => (ALLOWANCE_VALUE_LIST_KEYS.has(key) ? `${key}=${cfg.allowance?.[key] || ""}` : key))
    .join("|") + `|${canEdit}`;

  if (isTypingInList && els.list.dataset.signature === signature) return;

  els.list.dataset.signature = signature;
  els.list.innerHTML = enabled.map((key) => allowanceItemHtml(key, { cfg, canEdit })).join("");
}
