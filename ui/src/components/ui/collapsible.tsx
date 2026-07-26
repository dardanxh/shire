import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

/**
 * shadcn-style Collapsible on `@base-ui/react` (base-nova). Owned code — edit
 * here for app-wide collapse behavior. Trigger/Panel are thin pass-throughs;
 * consumers style via `data-panel-open` on the trigger and the panel's classes.
 */

function Collapsible(props: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger(props: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
  );
}

function CollapsiblePanel(props: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel data-slot="collapsible-panel" {...props} />
  );
}

export { Collapsible, CollapsiblePanel, CollapsibleTrigger };
