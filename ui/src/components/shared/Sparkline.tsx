import { cn } from "@/lib/utils";

/**
 * Tiny hand-rolled SVG trend line — cheap enough for hundreds of table rows.
 *
 * Pass `title` to give the line an accessible name and a hover hint; without one it stays
 * decorative (`aria-hidden`), which is right when a nearby number already carries the value.
 */
export function Sparkline({
  values,
  className,
  title,
}: {
  values: number[];
  className?: string;
  title?: string;
}) {
  if (values.length === 0) {
    return (
      <span className="text-xs text-muted-foreground" title={title}>
        —
      </span>
    );
  }
  const width = 96;
  const height = 28;
  const pad = 2;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const points = values
    .map((value, index) => {
      const x = pad + index * step;
      const y = height - pad - (value / max) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("text-primary", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : "true"}
    >
      {title ? <title>{title}</title> : null}
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* A one-point series has nothing to join, and SVG draws a single-coordinate polyline as
          nothing at all — which reads as "broken chart" rather than "one data point". Mark it. */}
      {values.length === 1 ? (
        <circle
          cx={points.split(",")[0]}
          cy={points.split(",")[1]}
          r="1.75"
          fill="currentColor"
        />
      ) : null}
    </svg>
  );
}
