import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "@/lib/utils";

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-6", className)}
      {...props}
    />
  );
}

function TabsList({ className, children, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // Wraps onto extra rows on narrow screens rather than scrolling horizontally.
        "relative flex flex-wrap items-center gap-x-1 border-b border-border",
        className,
      )}
      {...props}
    >
      {children}
      {/* Row-aware underline: positioned from the active tab's own top/height so it stays
          under that tab even when the list wraps onto multiple rows. */}
      <TabsPrimitive.Indicator
        data-slot="tabs-indicator"
        className="absolute left-0 top-0 h-0.5 w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)] translate-y-[calc(var(--active-tab-top)+var(--active-tab-height)-2px)] rounded-full bg-primary transition-all duration-200 ease-out"
      />
    </TabsPrimitive.List>
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[selected]:text-foreground [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
