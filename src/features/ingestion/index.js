/**
 * Ingestion's public surface — deliberately one function.
 *
 * This folder had no barrel, and the note in CLAUDE.md gave the reason: both
 * scripts are npm-script entry points that nothing imports, so a barrel would
 * have had no consumer. That stopped being true when the console started
 * reading a column only the scraper knew how to add — `server.js` now heals the
 * table at boot, and this is the one thing it needs. The scripts themselves are
 * still not imported by anything.
 */

export { ensureScrapeLogSchema } from "./schema.js";
