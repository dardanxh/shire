import { KeyRoundIcon, WalletIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { TreasuryOverviewOut } from "@/lib/api";

/** "default_claude_max_20x" → "20x"; anything else renders raw. */
function tierLabel(tier: string | null | undefined): string | null {
  if (!tier) return null;
  const match = tier.match(/_(\d+x)$/);
  return match ? match[1] : tier;
}

/**
 * Which subscription this machine's Claude runs on — read from Claude's own local config.
 * When the deployment can't see it (Docker without the claude-data overlay), the card
 * becomes the hint that explains how to grant access.
 */
export function SubscriptionCard({
  overview,
}: {
  overview: TreasuryOverviewOut;
}) {
  const { t } = useTranslation();
  const subscription = overview.subscription;

  if (!overview.claude_data.available || !subscription) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3">
          <KeyRoundIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {t("treasury.subscription.unavailable_title")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("treasury.subscription.unavailable_body")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const tier = tierLabel(subscription.rate_limit_tier);
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3">
        <WalletIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">
          {t(`treasury.subscription.plan.${subscription.organization_type}`, {
            defaultValue: subscription.organization_type ?? "?",
          })}
        </span>
        {tier ? <Badge variant="secondary">{tier}</Badge> : null}
        {subscription.billing_type ? (
          <Badge variant="outline" className="text-xs">
            {t(`treasury.subscription.billing.${subscription.billing_type}`, {
              defaultValue: subscription.billing_type,
            })}
          </Badge>
        ) : null}
        {subscription.email ? (
          <span className="text-xs text-muted-foreground">
            {subscription.email}
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}
