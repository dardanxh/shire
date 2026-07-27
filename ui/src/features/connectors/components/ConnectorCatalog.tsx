import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CardColumnsSelect,
  useCardColumns,
} from "@/components/shared/CardColumns";

import { Badge } from "@/components/ui/badge";
import { CONNECTION_PROVIDERS, type ConnectionProvider } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ConnectionFormDialog } from "./ConnectionFormDialog";
import { ConnectorLogo } from "./ConnectorLogo";

/** A single connector card. The whole card is the click target (opens the
 * connect dialog), so it's a real `<button>` for keyboard + a11y. */
function ConnectorCard({
  provider,
  count,
  onClick,
}: {
  provider: ConnectionProvider;
  count: number;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col gap-4 rounded-xl bg-card p-5 text-left ring-1 ring-foreground/10 transition-all",
        "outline-none hover:ring-ring/40 focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      <div className="flex items-center justify-between">
        <ConnectorLogo provider={provider} className="size-8" />
        <Badge variant="secondary">
          {t("connectors.catalog.count", { count })}
        </Badge>
      </div>
      <div>
        <p className="font-medium">{t(`connectors.provider.${provider}`)}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t(`connectors.catalog.blurb.${provider}`)}
        </p>
      </div>
      <span className="flex items-center gap-1 text-sm font-medium text-primary">
        {t("connectors.catalog.connect")}
        <ChevronRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

export function ConnectorCatalog({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const { t } = useTranslation();
  const [openProvider, setOpenProvider] = useState<ConnectionProvider | null>(
    null,
  );
  const [gridClass, columns, setColumns] = useCardColumns();

  return (
    <>
      <div className="flex justify-end">
        <CardColumnsSelect
          columns={columns}
          onChange={setColumns}
          label={t("common.cards.per_row")}
          autoLabel={t("common.cards.auto")}
        />
      </div>
      <div className={gridClass}>
        {CONNECTION_PROVIDERS.map((provider) => (
          <ConnectorCard
            key={provider}
            provider={provider}
            count={counts[provider] ?? 0}
            onClick={() => setOpenProvider(provider)}
          />
        ))}
      </div>

      {openProvider ? (
        <ConnectionFormDialog
          provider={openProvider}
          open
          onOpenChange={(o) => {
            if (!o) setOpenProvider(null);
          }}
        />
      ) : null}
    </>
  );
}
