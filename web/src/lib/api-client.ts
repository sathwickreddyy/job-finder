import createClient from "openapi-fetch";
import type { paths } from "./api-types";

// Relative base URL — the Vite dev server proxies /api → :47131,
// and in prod nginx does the same. Never hardcode the host.
export const api = createClient<paths>({ baseUrl: "" });

export type Schemas = paths;
