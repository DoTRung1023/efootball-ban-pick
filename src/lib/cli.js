import { pathToFileURL } from "node:url";

/**
 * True when this module is the file Node was launched with.
 *
 * Both scrapers are libraries *and* entry points — `scrapeMissing.js` imports
 * helpers out of `scrape.js`, and the ingestion barrel re-exports them. Without
 * this guard, importing either one would start a scrape as a side effect.
 *
 * Call as `isMainModule(import.meta.url)`.
 */
export function isMainModule(metaUrl) {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return pathToFileURL(argv1).href === metaUrl;
  } catch {
    return false;
  }
}
