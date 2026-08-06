import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@/lib/utils";

/**
 * Single-value slider on `@base-ui/react/slider`, styled to match the other primitives here.
 *
 * Hand-written rather than pulled from the registry: `npx shadcn add slider` reports success in the
 * `base-nova` style but writes no file (the same class of stub the project's UI conventions warn
 * about for `form`). Primitives are owned code, so this is the normal state of affairs.
 */
function Slider({ className, ...props }: SliderPrimitive.Root.Props) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn("w-full", className)}
      {...props}
    >
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="flex w-full touch-none items-center py-2 select-none"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="h-1.5 w-full rounded-full bg-input"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-indicator"
            className="rounded-full bg-primary"
          />
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            className={cn(
              "size-4 rounded-full border border-primary bg-background shadow transition-shadow",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              "data-disabled:cursor-not-allowed data-disabled:opacity-50",
            )}
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
