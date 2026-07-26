import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";

// The offline-mode fixes throughout the app (startup gate, Mediathek
// fallback, login error message) all depend on being able to tell "the
// server said no" (ApiError, we got a real HTTP response) apart from "we
// never reached the server at all" (a raw fetch rejection - offline, DNS
// failure, timeout). Getting this classification wrong anywhere means an
// offline user gets redirected to /login, or a session-expired online user
// gets silently shown a stale offline view instead of being sent to log in.
describe("api request error classification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws ApiError (not a raw error) when the server responds with a non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "not authenticated" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(api.session()).rejects.toBeInstanceOf(ApiError);
    try {
      await api.session();
      throw new Error("expected api.session() to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(401);
    }
  });

  it("does NOT throw an ApiError when fetch itself fails (offline/network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );

    try {
      await api.session();
      throw new Error("expected api.session() to reject");
    } catch (err) {
      expect(err).not.toBeInstanceOf(ApiError);
    }
  });
});
