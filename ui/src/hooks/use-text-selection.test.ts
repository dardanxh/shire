import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { readHighlightableSelection } from "@/hooks/use-text-selection";

// jsdom implements Range but not its layout measurement, and the reader uses the rect to
// position the toolbar. Any non-empty rect is enough for these assertions.
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () =>
    ({ top: 100, bottom: 120, left: 40, width: 200, height: 20 }) as DOMRect;
});

/** Select the text of `node` the way a drag does, so the reader sees a real Range. */
function select(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

describe("readHighlightableSelection", () => {
  it("reads a selection inside a highlightable block", () => {
    const body = mount(
      '<div data-highlightable="true"><p id="prose">the archive schema is created</p></div>',
    );
    const prose = body.querySelector("#prose");
    if (!prose) throw new Error("fixture missing");
    select(prose);

    expect(readHighlightableSelection()?.text).toBe(
      "the archive schema is created",
    );
  });

  it("ignores a selection outside any highlightable block", () => {
    const body = mount('<p id="chrome">a page heading</p>');
    const chrome = body.querySelector("#chrome");
    if (!chrome) throw new Error("fixture missing");
    select(chrome);

    expect(readHighlightableSelection()).toBeNull();
  });

  it("ignores a selection that spans out of the block", () => {
    // Dragging from prose into the surrounding chrome would otherwise capture page furniture.
    const body = mount(
      '<div id="wrap"><div data-highlightable="true"><p>kept prose</p></div><p>a footer</p></div>',
    );
    const wrap = body.querySelector("#wrap");
    if (!wrap) throw new Error("fixture missing");
    select(wrap);

    expect(readHighlightableSelection()).toBeNull();
  });

  it("ignores a collapsed selection and a stray one-character selection", () => {
    const body = mount('<div data-highlightable="true"><p id="p">ab</p></div>');
    const p = body.querySelector("#p");
    if (!p) throw new Error("fixture missing");

    expect(readHighlightableSelection()).toBeNull(); // nothing selected yet
    select(p);
    expect(readHighlightableSelection()).toBeNull(); // below the minimum length
  });
});
