import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { ToolStatusOut } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  categoryStyle,
  integrationIcon,
  languageStyle,
} from "./integrations/registry";

/**
 * Onboarding tool selector: search or filter by category, read each tool's purpose, and toggle
 * which ones run on the repo. Richer than a bare checkbox list — mirrors the Integrations catalog
 * so the choice is informed rather than a wall of names.
 */
export function ToolPicker({
  tools,
  selected,
  onToggle,
  emptyLabel,
}: {
  tools: ToolStatusOut[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  emptyLabel?: string;
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  if (tools.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">{emptyLabel ?? "—"}</p>
    );
  }

  const categories = [...new Set(tools.map((tool) => tool.category))];
  const q = query.trim().toLowerCase();
  const visible = tools.filter(
    (tool) =>
      (!category || tool.category === category) &&
      (!q ||
        tool.id.toLowerCase().includes(q) ||
        tool.name.toLowerCase().includes(q) ||
        tool.purpose.toLowerCase().includes(q)),
  );

  return (
    <div className="space-y-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("repositories.wizard.tools_search")}
        className="h-8"
      />
      <div className="flex flex-wrap gap-1.5">
        <FilterChip
          label={t("repositories.wizard.tools_all")}
          active={category === null}
          onClick={() => setCategory(null)}
        />
        {categories.map((c) => (
          <FilterChip
            key={c}
            label={c}
            active={category === c}
            className={cn("capitalize", category === c && categoryStyle(c))}
            onClick={() => setCategory(c)}
          />
        ))}
      </div>
      <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {visible.map((tool) => {
          const Icon = integrationIcon(tool.id);
          return (
            <label
              key={tool.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/50",
                !tool.available && "opacity-60",
              )}
            >
              <input
                type="checkbox"
                checked={selected.has(tool.id)}
                disabled={!tool.available}
                onChange={() => onToggle(tool.id)}
                className="mt-0.5 size-4 shrink-0 rounded border border-input accent-primary"
              />
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{tool.id}</span>
                  <Badge
                    variant="outline"
                    className={cn("capitalize", categoryStyle(tool.category))}
                  >
                    {tool.category}
                  </Badge>
                  {tool.language && tool.language !== "general" ? (
                    <Badge
                      variant="outline"
                      className={cn("capitalize", languageStyle(tool.language))}
                    >
                      {tool.language}
                    </Badge>
                  ) : null}
                  {!tool.available ? (
                    <span className="text-xs text-muted-foreground">
                      {t("repositories.wizard.tool_missing")}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {tool.purpose}
                </p>
              </div>
            </label>
          );
        })}
        {visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {t("repositories.wizard.tools_none_match")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  className,
  onClick,
}: {
  label: string;
  active: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
        active
          ? "border-foreground/10 bg-muted text-foreground"
          : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        className,
      )}
    >
      {label}
    </button>
  );
}
