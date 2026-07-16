import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CheckboxList } from "@/components/shared/CheckboxList";
import { Input } from "@/components/ui/input";
import { useRepositoriesQuery } from "@/features/repositories/api";

/**
 * The roadmap scope picker: search over the analyzed repositories feeding the
 * shared CheckboxList (the HobitMultiSelect shape). Controlled by an id Set.
 */
export function RepoMultiSelect({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (repositoryId: string) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const { data: page, isPending } = useRepositoriesQuery({
    page: 1,
    page_size: 100,
  });

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (page?.items ?? [])
      .filter((repo) => repo.status === "ready")
      .filter(
        (repo) =>
          term === "" ||
          `${repo.owner}/${repo.name}`.toLowerCase().includes(term),
      )
      .map((repo) => ({
        value: repo.id,
        label: `${repo.owner}/${repo.name}`,
        hint: repo.provider,
      }));
  }, [page, search]);

  return (
    <div className="space-y-2">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("roadmaps.new.repo_search_placeholder")}
        aria-label={t("roadmaps.new.repo_search_placeholder")}
      />
      <CheckboxList
        items={items}
        selected={selected}
        onToggle={onToggle}
        emptyLabel={
          isPending
            ? t("common.states.loading")
            : t("roadmaps.new.no_repositories")
        }
      />
    </div>
  );
}
