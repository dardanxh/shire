import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Sparkline } from "@/components/shared/Sparkline";

function polyline(container: HTMLElement): SVGPolylineElement {
  const line = container.querySelector("polyline");
  if (!line) throw new Error("no polyline rendered");
  return line as SVGPolylineElement;
}

describe("Sparkline", () => {
  it("renders an em-dash instead of an empty chart", () => {
    const { container } = render(<Sparkline values={[]} />);

    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("plots one point per value", () => {
    const { container } = render(<Sparkline values={[0, 4, 2, 9]} />);

    expect(polyline(container).getAttribute("points")?.split(" ")).toHaveLength(
      4,
    );
  });

  it("handles a single value without dividing by zero", () => {
    const { container } = render(<Sparkline values={[3]} />);

    const points = polyline(container).getAttribute("points") ?? "";
    expect(points).not.toContain("NaN");
    expect(points.split(" ")).toHaveLength(1);
  });

  it("marks a single value with a dot, since a 1-point polyline draws nothing", () => {
    const { container } = render(<Sparkline values={[3]} />);

    const dot = container.querySelector("circle");
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute("cx")).not.toContain("NaN");
    expect(dot?.getAttribute("cy")).not.toContain("NaN");
  });

  it("draws no dot once there is a line to see", () => {
    const { container } = render(<Sparkline values={[1, 2]} />);

    expect(container.querySelector("circle")).toBeNull();
  });

  it("stays flat for an all-zero series rather than producing NaN", () => {
    const { container } = render(<Sparkline values={[0, 0, 0]} />);

    expect(polyline(container).getAttribute("points")).not.toContain("NaN");
  });

  it("is decorative without a title and labelled with one", () => {
    const { container: bare } = render(<Sparkline values={[1, 2]} />);
    expect(bare.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    const { container: titled } = render(
      <Sparkline values={[1, 2]} title="12 commits in the last 30 days" />,
    );
    const svg = titled.querySelector("svg");
    expect(svg).not.toHaveAttribute("aria-hidden");
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "12 commits in the last 30 days");
  });
});
