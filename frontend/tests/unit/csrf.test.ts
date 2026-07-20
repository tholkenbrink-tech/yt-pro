import { describe, expect, it, beforeEach } from "vitest";
import { getCsrfToken } from "@/lib/csrf";

function setCookie(value: string) {
  document.cookie = value;
}

function clearCookies() {
  document.cookie.split(";").forEach((c) => {
    const name = c.split("=")[0].trim();
    if (name) {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    }
  });
}

describe("getCsrfToken", () => {
  beforeEach(() => {
    clearCookies();
  });

  it("returns null when no csrf_token cookie is present", () => {
    expect(getCsrfToken()).toBeNull();
  });

  it("reads the csrf_token cookie value", () => {
    setCookie("csrf_token=abc123");
    expect(getCsrfToken()).toBe("abc123");
  });

  it("decodes URI-encoded cookie values", () => {
    setCookie(`csrf_token=${encodeURIComponent("a/b+c")}`);
    expect(getCsrfToken()).toBe("a/b+c");
  });

  it("finds csrf_token among multiple cookies", () => {
    setCookie("other=1");
    setCookie("csrf_token=xyz789");
    setCookie("another=2");
    expect(getCsrfToken()).toBe("xyz789");
  });
});
