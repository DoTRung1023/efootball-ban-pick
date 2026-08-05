import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.join(here, "..", "..");
export const PUBLIC_DIR = path.join(ROOT_DIR, "public");
