import { describe, expect, it } from "vitest";

import { extractErrorMessage } from "@/lib/api";

describe("extractErrorMessage", () => {
  it("returns the detail string from an AppError body", () => {
    expect(
      extractErrorMessage({
        detail: "Repository not found",
        code: "not_found",
      }),
    ).toBe("Repository not found");
  });

  it("joins FastAPI 422 validation errors on their msg fields", () => {
    expect(
      extractErrorMessage({
        detail: [
          { msg: "field required", loc: ["body", "url"] },
          { msg: "value is not a valid url", loc: ["body", "url"] },
        ],
      }),
    ).toBe("field required; value is not a valid url");
  });

  it("falls through to message for native Errors", () => {
    expect(extractErrorMessage(new Error("connection refused"))).toBe(
      "connection refused",
    );
  });

  it("returns the generic fallback for unknown shapes", () => {
    const fallback = "Something went wrong. Please try again.";
    expect(extractErrorMessage(undefined)).toBe(fallback);
    expect(extractErrorMessage("boom")).toBe(fallback);
    expect(extractErrorMessage({ detail: [] })).toBe(fallback);
  });
});
