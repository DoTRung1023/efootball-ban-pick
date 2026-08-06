/**
 * Ingestion feature — scrapes the pesdb.net player catalog into MySQL.
 *
 * Both entry points are run as scripts (npm run scrape / scrape:missing),
 * not imported, so this barrel only re-exports what scrape.js exposes.
 */
export * from "./scrape.js";
