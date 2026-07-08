import type { TFunction } from "i18next";
import { z } from "zod";

import { CONNECTION_AUTH_METHODS, CONNECTION_PROVIDERS } from "@/lib/api";

/**
 * Connection form schema. Built from `t` so validation copy is translated. No
 * `.default()` (RHF holds defaults). `requireSecret` is true on create and
 * false on edit — an edit with a blank secret keeps the stored one.
 *
 * Field names are the form's own (camelCase); the submit handler maps them to
 * the API's snake_case request shape.
 */
export function makeConnectionSchema(t: TFunction, requireSecret: boolean) {
  return z
    .object({
      name: z.string().trim().min(1, t("connectors.form.name.required")),
      provider: z.enum(CONNECTION_PROVIDERS),
      authMethod: z.enum(CONNECTION_AUTH_METHODS),
      username: z.string().trim().optional(),
      secret: z.string().optional(),
      baseUrl: z.string().trim().optional(),
    })
    .refine((v) => v.authMethod !== "basic" || !!v.username?.trim(), {
      path: ["username"],
      message: t("connectors.form.username.required"),
    })
    .refine((v) => !requireSecret || !!v.secret?.trim(), {
      path: ["secret"],
      message: t("connectors.form.secret.required"),
    });
}

export type ConnectionFormValues = z.infer<
  ReturnType<typeof makeConnectionSchema>
>;
