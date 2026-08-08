/* ============================================================
   Dropdown panels — the sort/filter menus in the home toolbars

   A panel and its trigger button share the `open` class; `toggleDdPanel`
   additionally closes the sibling panel so only one is ever open.
   ============================================================ */

function openDdPanel(panelId, btnId) {
  const panel = document.getElementById(panelId);
  const btn   = document.getElementById(btnId);
  panel?.classList.add("open");
  btn?.classList.add("open");
  btn?.setAttribute("aria-expanded", "true");
}

export function closeDdPanel(panelId, btnId) {
  const panel = document.getElementById(panelId);
  const btn   = document.getElementById(btnId);
  panel?.classList.remove("open");
  btn?.classList.remove("open");
  btn?.setAttribute("aria-expanded", "false");
}

export function toggleDdPanel(panelId, btnId, otherPanelId, otherBtnId) {
  const panel = document.getElementById(panelId);
  if (panel?.classList.contains("open")) {
    closeDdPanel(panelId, btnId);
  } else {
    closeDdPanel(otherPanelId, otherBtnId);
    openDdPanel(panelId, btnId);
  }
}
