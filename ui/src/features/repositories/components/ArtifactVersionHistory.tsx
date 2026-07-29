import { HistoryIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ArtifactVersionOut } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useArtifactVersionsQuery } from "../api";

/**
 * Version walk-through for a Claude repo artifact (architecture diagram kind, codebase
 * overview, tech stack). Renders nothing until at least two versions exist — the current
 * content is already on screen; this is purely the history behind it.
 */
export function ArtifactVersionHistory({
  repoId,
  artifact,
  kind = null,
  renderContent,
}: {
  repoId: string;
  artifact: "architecture" | "codebase-overview" | "tech-stack";
  kind?: string | null;
  renderContent: (version: ArtifactVersionOut) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const { data: versions } = useArtifactVersionsQuery(repoId, artifact, kind);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!versions || versions.length < 2) return null;

  const selected = versions.find((version) => version.id === selectedId);
  const items = [
    { value: null, label: t("repositories.view.versions.hide") },
    ...versions.map((version, index) => ({
      value: version.id,
      label: `${formatDateTime(version.created_at)} · ${version.commit_sha.slice(0, 8) || "?"}${
        index === 0 ? ` · ${t("repositories.view.versions.current")}` : ""
      }`,
    })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <HistoryIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {t("repositories.view.versions.label", { count: versions.length })}
        </span>
        <Select
          items={items}
          value={selectedId}
          onValueChange={(value) => setSelectedId(value)}
        >
          <SelectTrigger className="h-7 min-w-56 bg-background text-xs">
            <SelectValue
              placeholder={t("repositories.view.versions.placeholder")}
            />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.label} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selected ? (
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {t("repositories.view.versions.viewing", {
                when: formatDateTime(selected.created_at),
              })}
            </Badge>
            {selected.branch ? (
              <Badge variant="secondary" className="text-[10px]">
                {selected.branch}
              </Badge>
            ) : null}
          </div>
          {renderContent(selected)}
        </div>
      ) : null}
    </div>
  );
}
