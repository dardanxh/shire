import { Link, useMatches } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import { useCrumbOverrideValue } from "@/lib/crumb";

/**
 * Breadcrumbs from route `staticData.crumb` (a translation key). Routes opt in
 * by setting `staticData: { crumb: "..." }`; matches without a crumb are
 * skipped, so the trail reads e.g. "Repositories → Repository". A detail page
 * can replace the leaf label with its entity's name via `useCrumbOverride`.
 */
export function Breadcrumbs() {
  const { t } = useTranslation();
  const matches = useMatches();
  const overrideLabel = useCrumbOverrideValue();
  const crumbs = matches.filter((m) => Boolean(m.staticData.crumb));

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-sm text-muted-foreground"
    >
      {crumbs.map((match, i) => {
        const last = i === crumbs.length - 1;
        const label =
          last && overrideLabel
            ? overrideLabel
            : t(match.staticData.crumb as string);
        return (
          <Fragment key={match.id}>
            {i > 0 ? <ChevronRightIcon className="size-3.5 shrink-0" /> : null}
            {last ? (
              <span className="font-medium text-foreground">{label}</span>
            ) : (
              <Link
                to={match.pathname}
                className="hover:text-foreground hover:underline"
              >
                {label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
