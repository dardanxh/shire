import { useMemo, useState } from "react";

import { CheckboxList } from "@/components/shared/CheckboxList";
import { Input } from "@/components/ui/input";
import { useRepositoriesQuery } from "@/features/repositories/api";

/**
 * A repository scope picker: search over the analyzed repositories feeding the shared
 * CheckboxList. Controlled by an id Set. Labels come in as props — shared components
 * don't own i18n keys.
 */
export function RepoMultiSelect({
  selected,
  onToggle,
  searchPlaceholder,
  emptyLabel,
  loadingLabel,
}: {
  selected: Set<string>;
  onToggle: (repositoryId: string) => void;
  searchPlaceholder: string;
  emptyLabel: string;
  loadingLabel: string;
}) {
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
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
      />
      <CheckboxList
        items={items}
        selected={selected}
        onToggle={onToggle}
        emptyLabel={isPending ? loadingLabel : emptyLabel}
      />
    </div>
  );
}
