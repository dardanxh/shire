import { z } from "zod";

/**
 * Zod-validated view of `import.meta.env`. Access env ONLY through this module
 * so a missing/invalid var throws at boot instead of silently at runtime.
 *
 * In dev the app talks to the backend through the Vite proxy (`/api` → :8000),
 * so no API URL is required. The generated OpenAPI paths already include the
 * `/api/v1` prefix, so the client base URL is empty by default (same-origin,
 * proxied). `VITE_API_BASE_URL` lets a deployed build point at an absolute
 * origin.
 */
const envSchema = z.object({
  VITE_API_BASE_URL: z.string().default(""),
});

export const env = envSchema.parse(import.meta.env);
