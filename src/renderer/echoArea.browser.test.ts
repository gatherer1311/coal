import { describe, expect, test } from "vitest";
import { EchoArea } from "./echoArea";

describe("EchoArea (design §8 transient message surface)", () => {
  test("message shows text; clear hides it", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const echo = new EchoArea(host);

    echo.message("Ctrl-x z is not bound");
    expect(host.querySelector(".coal-echo.open")?.textContent).toBe("Ctrl-x z is not bound");
    expect(echo.text).toBe("Ctrl-x z is not bound");

    echo.clear();
    expect(host.querySelector(".coal-echo.open")).toBeNull();
    host.remove();
  });
});
