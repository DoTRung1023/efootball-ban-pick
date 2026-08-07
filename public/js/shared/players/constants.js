/* ============================================================
   Constants shared by the player lists

   `PAGE_SIZE` is both the catalog's API page size (`?limit=`) and the squad
   grid's render batch — the two are kept equal on purpose so "load more"
   behaves the same in either list.
   ============================================================ */

export const PAGE_SIZE = 50;
