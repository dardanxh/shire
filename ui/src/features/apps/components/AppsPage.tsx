import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APPS } from "../catalog";

/** Launcher grid: one card per standalone app, click to open. */
export function AppsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">
          {t("apps.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("apps.subtitle")}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {APPS.map((app) => {
          const Icon = app.icon;
          return (
            <Link
              key={app.id}
              to={app.to}
              search={app.search}
              className="group rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Card className="h-full transition-shadow group-hover:ring-foreground/25">
                <CardHeader>
                  <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
                    <Icon className="size-5" />
                  </div>
                  <CardTitle>{t(app.nameKey)}</CardTitle>
                  <CardDescription>{t(app.descriptionKey)}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
