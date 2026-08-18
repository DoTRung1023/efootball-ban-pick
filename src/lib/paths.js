import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The repo root.
 *
 * Exported because a second consumer appeared: the scraper's resume file lives
 * here, and it used to derive the location itself with
 * `new URL("../.scrape-state.json", import.meta.url).pathname` — which pointed
 * at the wrong directory *and* kept the URL's percent-encoding, so on any
 * checkout whose path contains a space it wrote to a directory that does not
 * exist. Deriving the root once, correctly, is the point of this module.
 *
 * `fileURLToPath` is the only correct way to turn a file URL into a path;
 * `.pathname` is not.
 */
export const ROOT_DIR = path.join(here, "..", "..");

export const PUBLIC_DIR = path.join(ROOT_DIR, "public");
