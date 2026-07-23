import { describe, expect, test } from "vitest";
import { QuickPickModel } from "./quickPick";
import type { QuickPickItem } from "./types";

const items: QuickPickItem[] = [
  { id: "core.file.open", label: "Open File…" },
  { id: "core.file.save", label: "Save" },
  { id: "core.app.quit", label: "Quit" },
];

describe("QuickPickModel (design §5 pure selection model)", () => {
  test("empty query keeps all items in input order, selection at 0", () => {
    const m = new QuickPickModel(items);
    expect(m.results.map((r) => r.item.id)).toEqual([
      "core.file.open",
      "core.file.save",
      "core.app.quit",
    ]);
    expect(m.selectedIndex).toBe(0);
    expect(m.selected()?.id).toBe("core.file.open");
  });

  test("setQuery filters to matches and resets selection to 0", () => {
    const m = new QuickPickModel(items);
    m.moveDown();
    m.setQuery("quit");
    expect(m.results.map((r) => r.item.id)).toEqual(["core.app.quit"]);
    expect(m.selectedIndex).toBe(0);
  });

  test("results carry highlight positions", () => {
    const m = new QuickPickModel(items);
    m.setQuery("sa");
    const save = m.results.find((r) => r.item.id === "core.file.save");
    expect(save?.positions).toEqual([0, 1]);
  });

  test("moveDown / moveUp wrap around", () => {
    const m = new QuickPickModel(items); // 3 results
    m.moveUp();
    expect(m.selectedIndex).toBe(2); // wraps to last
    m.moveDown();
    expect(m.selectedIndex).toBe(0); // wraps to first
  });

  test("movement and selected() are safe on an empty result set", () => {
    const m = new QuickPickModel(items);
    m.setQuery("zzzz");
    expect(m.results).toHaveLength(0);
    m.moveDown();
    expect(m.selectedIndex).toBe(0);
    expect(m.selected()).toBeUndefined();
  });
});
