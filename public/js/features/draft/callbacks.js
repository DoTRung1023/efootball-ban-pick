/**
 * Mutable callback registry.
 *
 * Sub-modules that need to call "upward" (into a module that already imports
 * them) go through `cb` instead of a direct import, which keeps the module
 * graph acyclic. room.js installs the real implementations on boot; until then
 * every entry is a harmless no-op.
 */

export const cb = {
  /** Re-render the active draft board. Called on every presence poll. */
  renderDraftUi: () => {},
  /** Re-render the lobby view. */
  renderLobby: () => {},
  /** Repaint the floating chat dock. Runs in every phase, off the same poll. */
  renderRoomChat: () => {},
  /** Enter the draft if the room snapshot says it has started. */
  tryEnterDraftFromRoomSnapshot: () => false,
  /** Both sides pressed FINISH MATCH: swap Start Match into its post stage. */
  enterPostMatch: () => {},
  /** The other side accepted a rematch: the room is back in the lobby. */
  onRematchAccepted: () => {},
  /** Show the "room closed" countdown screen. */
  showRoomClosed: (_msg) => {},
  /** Host START action (guest ready toggle for the guest). */
  startDraftFromLobby: () => {},
  /** Refresh the ban/pick/start stage indicator. */
  updateStageTabs: () => {},
  /** Timer expiry: post any staged bans without confirming the side. */
  confirmStagedBans: async () => {},
  /** Mark this side's squad final, or take it back. */
  autoFillAndConfirmPicks: async (_confirmed) => {},
};
