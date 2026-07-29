import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CollapsibleBlock } from "@/components/shared/CollapsibleBlock";

describe("CollapsibleBlock", () => {
  it("shows the body when defaultOpen and hides it after a toggle click", () => {
    render(
      <CollapsibleBlock title="Prompt" content="run the thing" defaultOpen />,
    );
    const toggle = screen.getByRole("button", { name: /Prompt/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("run the thing")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("run the thing")).not.toBeInTheDocument();
  });

  it("starts collapsed when defaultOpen is false", () => {
    render(
      <CollapsibleBlock
        title="Result"
        content="all good"
        defaultOpen={false}
      />,
    );
    expect(screen.queryByText("all good")).not.toBeInTheDocument();
  });

  it("renders the empty label when content is null", () => {
    render(
      <CollapsibleBlock
        title="Result"
        content={null}
        emptyLabel="Nothing yet"
        defaultOpen
      />,
    );
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
  });
});
