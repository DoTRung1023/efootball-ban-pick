/* ============================================================
   Shared callbacks — break circular deps between squad ↔ catalog ↔ plans.
   Each module sets the stubs it owns; other modules call through cb.
   ============================================================ */

export const cb = {
  // Set by squad.js
  getSquadPlayers:      () => [],
  addToSquadState:      (_playerData) => {},
  removeFromSquadState: (_squadId) => {},
  renderSquad:          () => {},

  // Set by catalog.js
  openPlayerPopup:    (_player, _addBtn) => {},
  openAddPlayerModal: () => {},
  onPlayersDeleted:   () => {},

  // Set by rooms.js
  refreshRoomsStats: () => {},
};
