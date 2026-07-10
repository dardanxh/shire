import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Loader2Icon, PlugZapIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  FormFooter,
  SelectField,
  TextField,
} from "@/components/shared/form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { SelectItem } from "@/components/ui/select";
import {
  CONNECTION_AUTH_METHODS,
  type ConnectionAuthMethod,
  type ConnectionOut,
  type ConnectionProvider,
} from "@/lib/api";
import {
  type ConnectionInput,
  useCreateConnectionMutation,
  useTestConnectionMutation,
  useUpdateConnectionMutation,
} from "../api";
import { type ConnectionFormValues, makeConnectionSchema } from "../schemas";
import { ConnectorLogo } from "./ConnectorLogo";

/** Map the camelCase form values to the API's snake_case request body. */
function toConnectionInput(values: ConnectionFormValues): ConnectionInput {
  return {
    name: values.name,
    provider: values.provider,
    auth_method: values.authMethod,
    username: values.username?.trim() ? values.username.trim() : null,
    secret: values.secret?.trim() ? values.secret.trim() : null,
    base_url: values.baseUrl?.trim() ? values.baseUrl.trim() : null,
  };
}

/**
 * Create/edit a connection in a dialog. Opened from a connector card (create,
 * `provider` preset) or a connections-table row (edit, `connection` supplied).
 * The provider is fixed by context — it's shown in the title, not editable.
 */
export function ConnectionFormDialog({
  provider,
  connection,
  open,
  onOpenChange,
}: {
  provider: ConnectionProvider;
  connection?: ConnectionOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const isEdit = Boolean(connection);
  const activeProvider =
    (connection?.provider as ConnectionProvider | undefined) ?? provider;
  // A local connection points at on-disk repos — no auth fields, no live test.
  const isLocal = activeProvider === "local";

  const { mutate: createConnection, isPending: isCreating } =
    useCreateConnectionMutation();
  const { mutate: updateConnection, isPending: isUpdating } =
    useUpdateConnectionMutation(connection?.id ?? "");
  const { mutate: testConnection, isPending: isTesting } =
    useTestConnectionMutation();
  const isPending = isCreating || isUpdating;

  const form = useForm<ConnectionFormValues>({
    resolver: standardSchemaResolver(makeConnectionSchema(t, !isEdit)),
    defaultValues: connection
      ? {
          name: connection.name,
          provider: activeProvider,
          authMethod: connection.auth_method as ConnectionAuthMethod,
          username: connection.username ?? "",
          secret: "",
          baseUrl: connection.base_url ?? "",
        }
      : {
          name: "",
          provider: activeProvider,
          authMethod: "token",
          username: "",
          secret: "",
          baseUrl: "",
        },
  });

  const authMethod = form.watch("authMethod");

  const handleTest = () => {
    const values = form.getValues();
    if (!values.secret?.trim()) {
      toast.error(t("connectors.form.test.needs_secret"));
      return;
    }
    testConnection(toConnectionInput(values), {
      onSuccess: (result) => {
        if (result.ok) {
          toast.success(
            t("connectors.form.test.ok", {
              account:
                result.account ?? t("connectors.form.test.account_unknown"),
            }),
          );
        } else {
          toast.error(t("connectors.form.test.failed"), {
            description: result.message,
          });
        }
      },
    });
  };

  const handleSubmit = (values: ConnectionFormValues) => {
    if (connection) {
      updateConnection(
        {
          name: values.name,
          username: values.username?.trim() ? values.username.trim() : null,
          secret: values.secret?.trim() ? values.secret.trim() : null,
          base_url: values.baseUrl?.trim() ? values.baseUrl.trim() : null,
        },
        {
          onSuccess: (updated) => {
            toast.success(
              t("connectors.dialog.toast_saved", { name: updated.name }),
            );
            onOpenChange(false);
          },
        },
      );
      return;
    }
    createConnection(toConnectionInput(values), {
      onSuccess: (created) => {
        toast.success(
          t("connectors.dialog.toast_created", { name: created.name }),
        );
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (isPending) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ConnectorLogo provider={activeProvider} className="size-5" />
                {isEdit
                  ? t("connectors.dialog.edit_title", {
                      name: connection?.name,
                    })
                  : t("connectors.dialog.new_title", {
                      provider: t(`connectors.provider.${activeProvider}`),
                    })}
              </DialogTitle>
              <DialogDescription>
                {t("connectors.dialog.description")}
              </DialogDescription>
            </DialogHeader>

            <TextField<ConnectionFormValues>
              name="name"
              label={t("connectors.form.name.label")}
              placeholder={t("connectors.form.name.placeholder")}
              autoFocus
              disabled={isPending}
            />

            {isLocal ? (
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                {t("connectors.form.local_note")}
              </p>
            ) : (
              <>
                <SelectField<ConnectionFormValues>
                  name="authMethod"
                  label={t("connectors.form.auth_method.label")}
                  disabled={isPending || isEdit}
                >
                  {CONNECTION_AUTH_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`connectors.auth_method.${m}`)}
                    </SelectItem>
                  ))}
                </SelectField>

                {authMethod === "basic" ? (
                  <>
                    <TextField<ConnectionFormValues>
                      name="username"
                      label={t("connectors.form.username.label")}
                      autoComplete="off"
                      disabled={isPending}
                    />
                    <TextField<ConnectionFormValues>
                      name="secret"
                      type="password"
                      label={t("connectors.form.password.label")}
                      placeholder={
                        isEdit ? t("connectors.form.secret.keep") : undefined
                      }
                      autoComplete="new-password"
                      disabled={isPending}
                    />
                  </>
                ) : (
                  <TextField<ConnectionFormValues>
                    name="secret"
                    type="password"
                    label={t("connectors.form.token.label")}
                    description={t("connectors.form.token.description")}
                    placeholder={
                      isEdit ? t("connectors.form.secret.keep") : undefined
                    }
                    autoComplete="off"
                    disabled={isPending}
                  />
                )}

                {activeProvider !== "github" ? (
                  <TextField<ConnectionFormValues>
                    name="baseUrl"
                    label={t("connectors.form.base_url.label")}
                    description={t("connectors.form.base_url.description")}
                    placeholder={t("connectors.form.base_url.placeholder")}
                    disabled={isPending}
                  />
                ) : null}
              </>
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              {isLocal ? (
                <span />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTest}
                  disabled={isTesting || isPending}
                >
                  {isTesting ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <PlugZapIcon className="size-4" />
                  )}
                  {t("connectors.form.test.button")}
                </Button>
              )}

              <FormFooter
                submitLabel={
                  isEdit
                    ? t("connectors.dialog.save")
                    : t("connectors.dialog.create")
                }
                cancelLabel={t("common.actions.cancel")}
                onCancel={() => onOpenChange(false)}
                isPending={isPending}
              />
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
