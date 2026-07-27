import { Link } from "@tanstack/react-router";
import { CalendarClockIcon, FolderGit2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTimeAgo } from "@/lib/format";
import { useHobitAssignmentsQuery } from "../api";

/** The repositories this hobit is assigned to, each with its run schedule. */
export function HobitAssignmentsCard({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { data: assignments, isPending } = useHobitAssignmentsQuery(slug);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderGit2Icon className="size-4 text-muted-foreground" />
          {t("hobits.view.assignments_title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : !assignments || assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("hobits.view.assignments_empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {assignments.map((a) => (
              <li
                key={a.repository_id}
                className="flex flex-wrap items-center gap-2 py-2"
              >
                <Link
                  to="/repositories/$id"
                  params={{ id: a.repository_id }}
                  search={{ tab: "overview" }}
                  className="font-medium text-sm hover:underline"
                >
                  {a.repository_slug}
                </Link>
                <Badge
                  variant={a.cadence === "manual" ? "outline" : "secondary"}
                  className="gap-1 text-xs"
                >
                  {a.cadence !== "manual" ? (
                    <CalendarClockIcon className="size-3" />
                  ) : null}
                  {t(`repositories.hobits.cadence.${a.cadence}`, {
                    defaultValue: a.cadence,
                  })}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {a.last_checked_at
                    ? t("hobits.view.assignments_checked", {
                        when: formatTimeAgo(a.last_checked_at),
                      })
                    : t("hobits.view.assignments_never_checked")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
