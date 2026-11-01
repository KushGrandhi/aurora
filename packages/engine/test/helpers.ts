import { fileURLToPath } from "node:url";
import path from "node:path";
export const fx = (name: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", name);
