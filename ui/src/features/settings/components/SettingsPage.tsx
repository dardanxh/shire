import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  LayersIcon,
  type LucideIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LIST_SEARCH } from "@/features/archetypes";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { value: string; icon: LucideIcon }[] = [
  { value: "system", icon: MonitorIcon },
  { value: "light", icon: SunIcon },
  { value: "dark", icon: MoonIcon },
];

/** App settings. Holds only the theme choice for now; future sections stack below. */
export function SettingsPage() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const current = theme ?? "system";

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-2">
          <p className="text-sm font-medium">{t("common.settings.theme")}</p>
          <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
            {THEME_OPTIONS.map(({ value, icon: Icon }) => {
              const selected = current === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "relative flex flex-col items-center gap-2 rounded-lg border bg-card px-3 py-5 text-sm transition-colors",
                    selected
                      ? "border-primary bg-accent/50"
                      : "border-border hover:border-muted-foreground/40 hover:bg-muted/60",
                  )}
                >
                  <Icon className="size-5 text-muted-foreground" />
                  <span className="font-medium">
                    {t(`common.theme.${value}`)}
                  </span>
                  {selected ? (
                    <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-green-600">
                      <CheckIcon className="size-3 text-white" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Link to="/settings/archetypes" search={LIST_SEARCH} className="block">
        <Card className="transition-colors hover:bg-muted/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayersIcon className="size-4 text-muted-foreground" />
              {t("common.settings.archetypes_title")}
            </CardTitle>
            <CardDescription>
              {t("common.settings.archetypes_description")}
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>
    </div>
  );
}
