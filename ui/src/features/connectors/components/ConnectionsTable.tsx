import type { ColumnDef } from "@tanstack/react-table";
import { Loader2Icon, PlugIcon, PlugZapIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type ConnectionOut,
  type ConnectionProvider,
  extractErrorMessage,
} from "@/lib/api";
import { useTestConnectionByIdMutation } from "../api";
import { ConnectionFormDialog } from "./ConnectionFormDialog";
import { ConnectorLogo } from "./ConnectorLogo";
import { DeleteConnectionDialog } from "./DeleteConnectionDialog";

/** Per-row "Test" button — tests the connection's stored credentials. */
function TestConnectionButton({ connection }: { connection: ConnectionOut }) {
  const { t } = useTranslation();
  const { mutate: testConnection, isPending } = useTestConnectionByIdMutation();

  const handleTest = () => {
    testConnection(connection.id, {
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

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleTest}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <PlugZapIcon className="size-3.5" />
      )}
      {t("connectors.connections.test")}
    </Button>
  );
}

export function ConnectionsTable({
  connections,
  isPending,
  isError,
  error,
}: {
  connections: ConnectionOut[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<ConnectionOut | null>(null);

  const columns = useMemo<ColumnDef<ConnectionOut>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("connectors.connections.col_name"),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "provider",
        header: t("connectors.connections.col_provider"),
        cell: ({ row }) => (
          <span className="flex items-center gap-2 text-muted-foreground">
            <ConnectorLogo
              provider={row.original.provider as ConnectionProvider}
              className="size-4"
            />
            {t(`connectors.provider.${row.original.provider}`)}
          </span>
        ),
      },
      {
        accessorKey: "auth_method",
        header: t("connectors.connections.col_auth"),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {t(`connectors.auth_method.${row.original.auth_method}`)}
          </span>
        ),
      },
      {
        accessorKey: "secret_hint",
        header: t("connectors.connections.col_secret"),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.secret_hint}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        meta: { isAction: true, className: "w-px" },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            <TestConnectionButton connection={row.original} />
            <DeleteConnectionDialog
              id={row.original.id}
              name={row.original.name}
              trigger={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("connectors.delete.confirm")}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              }
            />
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <>
      <Card className="overflow-hidden p-0">
        <DataTable
          columns={columns}
          data={connections}
          isPending={isPending}
          isError={isError}
          errorMessage={t("common.states.api_unreachable", {
            message: error ? extractErrorMessage(error) : "",
          })}
          onRowClick={(connection) => setEditing(connection)}
          emptyState={
            <div className="flex flex-col items-center gap-2 p-12 text-center">
              <PlugIcon className="size-8 text-muted-foreground" />
              <p className="font-medium">
                {t("connectors.connections.empty_title")}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("connectors.connections.empty_body")}
              </p>
            </div>
          }
        />
      </Card>

      {editing ? (
        <ConnectionFormDialog
          provider={editing.provider as ConnectionProvider}
          connection={editing}
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}
