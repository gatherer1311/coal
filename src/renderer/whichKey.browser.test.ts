import { describe, expect, test } from "vitest";
import { WhichKey } from "./whichKey";

describe("WhichKey (design §8 continuation panel)", () => {
  test("show renders the pending sequence and each continuation; hide closes", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const wk = new WhichKey(host);

    wk.show("Ctrl-x", [
      { chord: "Ctrl-s", title: "Save" },
      { chord: "Ctrl-f", title: "Open File…" },
    ]);
    expect(wk.isOpen()).toBe(true);
    expect(host.querySelectorAll(".coal-whichkey-row")).toHaveLength(2);
    expect(host.querySelector(".coal-whichkey-chord")?.textContent).toBe("Ctrl-s");

    wk.hide();
    expect(wk.isOpen()).toBe(false);
    host.remove();
  });
});
