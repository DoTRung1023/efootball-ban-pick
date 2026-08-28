/* ============================================================
   Two-click confirmation, for every button on this console that
   cannot be taken back

   Three tabs had a private copy of this — `armConfirm` on USERS, `armClose` on
   ROOMS, `armClearLogs` on OVERVIEW — with three independent timers and six
   separate places that put a button back. They were the same function.

   **Which buttons confirm is a fact about the markup, not about the handler.**
   Every destructive button already named the label to disarm back to, and no
   other button did: `revokeBtn` carries it, `grantBtn` does not. So the
   attribute *is* the marker, and `confirms()` is the whole test. That is what
   collapsed the USERS click handler from three near-identical arm-then-act
   blocks into one table — a "does this one need arming" predicate is not needed
   when the button says so itself.

   **One armed button at a time, process-wide.** The three separate timers meant
   CLOSE could sit armed on ROOMS while DELETE sat armed on USERS, because the
   tabs are hidden rather than destroyed. Arming anything now disarms whatever
   was armed, which is both simpler and what a person would expect.

   There is deliberately no `data-armed` attribute any more. `armed` below is the
   one source of truth; `.is-armed` remains, because it is the class the CSS
   paints red.
   ============================================================ */

const DEFAULT_CONFIRM_MS = 4000;

/** The one button currently awaiting its second click, and its timeout. */
let armed = null;
let timer = null;

/**
 * Whether this button asks for a second click.
 *
 * True exactly when it names the label to go back to — which every irreversible
 * button in this console does, and nothing else does.
 */
export const confirms = (btn) => btn.dataset.confirmLabel !== undefined;

export const isArmed = (btn) => armed === btn;

/** Forgets the armed button without touching it — for the moment it fires, when
    the action is about to write its own label ("DELETING…") over the top. */
function release() {
  clearTimeout(timer);
  timer = null;
  armed = null;
}

/** Puts a button back to its resting label, whether or not it is armed. Also the
    timeout handler, and what a failed action calls: a button left reading
    CONFIRM? would fire on a single click. */
export function reset(btn = armed) {
  if (!btn) return;
  if (armed === btn) release();
  btn.classList.remove("is-armed");
  btn.textContent = btn.dataset.confirmLabel;
  btn.disabled = false;
}

/**
 * Arms a button: one more click does the thing.
 *
 * `label` is the armed text, which is not always "CONFIRM?" — CLEAR HISTORY
 * spends it saying what the second click will cost. `ms` is how long it stays
 * armed, so a slower-to-read label can be given longer.
 */
export function arm(btn, { label = "CONFIRM?", ms = DEFAULT_CONFIRM_MS } = {}) {
  reset();
  armed = btn;
  btn.classList.add("is-armed");
  btn.textContent = label;
  timer = setTimeout(() => reset(btn), ms);
}

/**
 * One delegated click listener for a table whose rows are replaced wholesale.
 *
 * `bindings` is `[selector, handler]` pairs, tried in order; the first whose
 * selector the click is inside wins. A binding does not say whether it needs
 * confirming — the button does, via `confirms`.
 *
 * `before` runs on any match, which is where a tab clears its last notice.
 */
export function onConfirmedClick(root, bindings, { before } = {}) {
  root.addEventListener("click", (ev) => {
    for (const [selector, run] of bindings) {
      const btn = ev.target.closest(selector);
      if (!btn) continue;
      before?.();
      if (confirms(btn) && !isArmed(btn)) {
        arm(btn);
        return;
      }
      release();
      run(btn);
      return;
    }
  });
}
