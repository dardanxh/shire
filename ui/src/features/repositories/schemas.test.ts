import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import { makeIngestSchema } from "@/features/repositories/schemas";

// Identity `t` so assertions can target the i18n keys the schema was built with.
const t = ((key: string) => key) as TFunction;
const schema = makeIngestSchema(t);

describe("makeIngestSchema", () => {
  it("accepts a valid URL, trims whitespace, and keeps connectionId optional", () => {
    const result = schema.parse({ url: "  https://github.com/acme/repo  " });
    expect(result.url).toBe("https://github.com/acme/repo");
    expect(result.connectionId).toBeUndefined();
  });

  it("rejects an empty URL with the required message", () => {
    const result = schema.safeParse({ url: "   " });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain(
      "repositories.ingest.url.required",
    );
  });

  it("rejects a non-URL value with the invalid message", () => {
    const result = schema.safeParse({ url: "not a url" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain(
      "repositories.ingest.url.invalid",
    );
  });
});
