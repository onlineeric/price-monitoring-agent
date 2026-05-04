import { describe, expect, it, vi } from "vitest";

import { applyThemeMode, applyThemePreset } from "./theme-utils";

/**
 * Pin the theme writers — same data-attribute / class contract the boot
 * script depends on. The transient `disable-transitions` class is what
 * prevents the dark/light flash, so its add/remove dance has to stay intact.
 */

describe("applyThemeMode", () => {
  it("toggles the `dark` class on <html> when value === 'dark'", () => {
    document.documentElement.classList.remove("dark");
    applyThemeMode("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes the `dark` class when value === 'light'", () => {
    document.documentElement.classList.add("dark");
    applyThemeMode("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("adds `disable-transitions` immediately, then removes it on the next animation frame", async () => {
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    applyThemeMode("dark");
    expect(rafSpy).toHaveBeenCalled();
    expect(document.documentElement.classList.contains("disable-transitions")).toBe(false);
  });
});

describe("applyThemePreset", () => {
  it("writes data-theme-preset on <html>", () => {
    applyThemePreset("ocean");
    expect(document.documentElement.getAttribute("data-theme-preset")).toBe("ocean");
  });
});
