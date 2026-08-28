import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

const isNativePlatform = vi.fn(() => false);
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }));

import { SHELL_INIT_SCRIPT, applyShell, detectShell } from "@/lib/shell";

/** jsdom has no display-mode support, so stand in for matchMedia. */
function mockDisplayMode(mode: string | null) {
  window.matchMedia = ((query: string) =>
    ({
      matches: mode !== null && query.includes(mode),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

describe("detectShell", () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(false);
    mockDisplayMode(null);
    delete (window.navigator as Navigator & { standalone?: boolean }).standalone;
    delete document.documentElement.dataset.shell;
  });

  afterEach(() => {
    delete document.documentElement.dataset.shell;
  });

  it("treats an ordinary browser tab as 'browser'", () => {
    expect(detectShell()).toBe("browser");
  });

  it("treats an installed PWA as 'app' via display-mode", () => {
    mockDisplayMode("standalone");
    expect(detectShell()).toBe("app");
  });

  it("treats iOS home-screen mode as 'app' via navigator.standalone", () => {
    (window.navigator as Navigator & { standalone?: boolean }).standalone = true;
    expect(detectShell()).toBe("app");
  });

  // The Capacitor shell is a plain WKWebView: it reports display-mode
  // "browser", so without this check the native app would lose the
  // home-indicator padding the browser fix deliberately drops.
  it("treats the Capacitor shell as 'app' even though display-mode says browser", () => {
    isNativePlatform.mockReturnValue(true);
    expect(detectShell()).toBe("app");
  });

  it("writes the flag onto <html> for the CSS to key off", () => {
    applyShell("app");
    expect(document.documentElement.dataset.shell).toBe("app");
    applyShell("browser");
    expect(document.documentElement.dataset.shell).toBe("browser");
  });
});

describe("SHELL_INIT_SCRIPT", () => {
  beforeEach(() => {
    delete document.documentElement.dataset.shell;
  });

  it("sets the flag before hydration without touching the Capacitor import", () => {
    mockDisplayMode(null);
    // eslint-disable-next-line no-eval
    eval(SHELL_INIT_SCRIPT);
    expect(document.documentElement.dataset.shell).toBe("browser");
  });

  it("reads the Capacitor bridge off the global when it is already there", () => {
    mockDisplayMode(null);
    (window as unknown as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    // eslint-disable-next-line no-eval
    eval(SHELL_INIT_SCRIPT);
    expect(document.documentElement.dataset.shell).toBe("app");
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  });
});
