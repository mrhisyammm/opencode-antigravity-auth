import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PluginClient } from "./plugin/types.js";

vi.mock("@opencode-ai/plugin", () => ({
  tool: Object.assign(
    (definition: unknown) => definition,
    {
      schema: {
        string: () => ({ describe: () => ({}) }),
        boolean: () => ({ optional: () => ({ default: () => ({ describe: () => ({}) }) }) }),
        array: () => ({ optional: () => ({ describe: () => ({}) }) }),
      },
    },
  ),
}));

// Mock storage so disk reads/writes are isolated from real config files.
// Per-test we override `loadAccounts` to simulate "OAuth accounts on disk".
vi.mock("./plugin/storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("./plugin/storage")>();
  return {
    ...original,
    loadAccounts: vi.fn(async () => null),
    saveAccounts: vi.fn(async () => undefined),
    saveAccountsReplace: vi.fn(async () => undefined),
    clearAccounts: vi.fn(async () => undefined),
  };
});

const { createAntigravityPlugin } = await import("./plugin");
const storageModule = await import("./plugin/storage");

const client = {
  tui: { showToast: vi.fn(async () => undefined) },
  app: { log: vi.fn(async () => undefined) },
} as unknown as PluginClient;

describe("createAntigravityPlugin provider models", () => {
  it("returns runtime-shaped discovered models with static fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("generativelanguage.googleapis.com/v1beta/models")) {
        return new Response(JSON.stringify({
          models: [
            {
              name: "models/gemini-driver",
              displayName: "Gemini Driver",
              inputTokenLimit: 123,
              outputTokenLimit: 45,
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }));
      }
      return new Response("1.2.3");
    }));

    try {
      const plugin = await createAntigravityPlugin("google")({
        client,
        directory: process.cwd(),
      });

      const models = await plugin.provider?.models?.(
        {
          id: "google",
          api: "https://generativelanguage.googleapis.com/v1beta",
          npm: "@ai-sdk/google",
          models: {},
        },
        { auth: { type: "api", key: "secret" } },
      );

      expect(models?.["gemini-driver"]).toMatchObject({
        id: "gemini-driver",
        providerID: "google",
        api: {
          id: "gemini-driver",
          url: "https://generativelanguage.googleapis.com/v1beta",
          npm: "@ai-sdk/google",
        },
        limit: { context: 123, output: 45 },
        status: "active",
      });
      expect(models?.["gemini-driver"]?.capabilities).toMatchObject({
        toolcall: true,
        input: { text: true, image: true, pdf: true },
        output: { text: true },
      });
      expect(models?.["antigravity-gemini-3-pro"]).toMatchObject({
        id: "antigravity-gemini-3-pro",
        providerID: "google",
        api: { id: "antigravity-gemini-3-pro" },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not expose API-key auth secret as loader apiKey", async () => {
    const plugin = await createAntigravityPlugin("google")({
      client,
      directory: process.cwd(),
    });

    const loader = await plugin.auth.loader(
      async () => ({ type: "api", key: "secret" }),
      {},
    );

    expect(loader).toMatchObject({ apiKey: "" });
  });
});

describe("createAntigravityPlugin auth.loader disk OAuth promotion", () => {
  beforeEach(() => {
    vi.mocked(storageModule.loadAccounts).mockReset();
  });

  it("routes through the OAuth path when OpenCode reports API-key auth but OAuth accounts exist on disk", async () => {
    // Simulate ~/.config/opencode/antigravity-accounts.json holding a usable OAuth account.
    vi.mocked(storageModule.loadAccounts).mockResolvedValue({
      version: 4,
      accounts: [
        {
          email: "test@example.com",
          refreshToken: "fake-refresh-token",
          projectId: "fake-project",
          addedAt: 0,
          lastUsed: 0,
          enabled: true,
        },
      ],
      activeIndex: 0,
    });

    // Mock global fetch:
    //   - version check / model discovery → safe defaults
    //   - oauth2.googleapis.com (token refresh) → invalid_grant so the OAuth
    //     loop exits fast (account removed, no infinite retry)
    //   - anything else → 500 (won't be reached on the happy assertion path)
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(
          JSON.stringify({ error: "invalid_grant", error_description: "test-stop" }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ models: [] }));
      }
      return new Response("1.2.3");
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const plugin = await createAntigravityPlugin("google")({
        client,
        directory: process.cwd(),
      });

      const loader = await plugin.auth.loader(
        async () => ({ type: "api", key: "secret" }),
        {
          id: "google",
          api: "https://generativelanguage.googleapis.com/v1beta",
          npm: "@ai-sdk/google",
          models: {},
        },
      );

      // Both branches return apiKey: "" — this only confirms loader was constructed.
      expect(loader).toMatchObject({ apiKey: "" });
      expect(loader).toHaveProperty("fetch");

      // Before the fix: this URL took the API-key-only branch and returned a
      // synthetic 404 with the "API-key path forwarded" guidance (no fetch made).
      // After the fix: disk OAuth is promoted, the OAuth path is taken, and the
      // first thing it does is refresh the access token against oauth2.googleapis.com.
      let responseBody = "";
      try {
        const response = await (loader as { fetch: typeof fetch }).fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/antigravity-gemini-3.1-pro:generateContent",
          { method: "POST", body: "{}" },
        );
        responseBody = await response.text();
      } catch {
        // OAuth path may throw after the invalid_grant exhausts the only account.
        // That's the expected failure mode for this test setup.
      }

      // Hard proof we took the OAuth path: a token-refresh request was issued.
      const tokenRefreshCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("oauth2.googleapis.com"),
      );
      expect(tokenRefreshCalls.length).toBeGreaterThan(0);

      // Negative assertion: we did NOT short-circuit through the API-key-only
      // synthetic 404. That synthetic message is unique to the api-key path.
      expect(responseBody).not.toContain("API-key path forwarded the request");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps API-key-only behavior when disk has no OAuth accounts", async () => {
    // No accounts on disk — must NOT promote, must short-circuit Antigravity-only
    // models with the synthetic 404 guidance.
    vi.mocked(storageModule.loadAccounts).mockResolvedValue(null);

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ models: [] }));
      }
      return new Response("1.2.3");
    }));

    try {
      const plugin = await createAntigravityPlugin("google")({
        client,
        directory: process.cwd(),
      });

      const loader = await plugin.auth.loader(
        async () => ({ type: "api", key: "secret" }),
        {
          id: "google",
          api: "https://generativelanguage.googleapis.com/v1beta",
          npm: "@ai-sdk/google",
          models: {},
        },
      );

      const response = await (loader as { fetch: typeof fetch }).fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/antigravity-claude-sonnet-4-6:generateContent",
        { method: "POST", body: "{}" },
      );
      const body = await response.text();
      expect(response.status).toBe(404);
      expect(body).toContain("API-key path forwarded the request");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does NOT call client.auth.set when promoted-from-disk OAuth hits invalid_grant", async () => {
    // Disk holds an OAuth account; OpenCode hands us api-key auth. After my fix,
    // when the (only) promoted OAuth account fails with invalid_grant, the plugin
    // must NOT call client.auth.set — OpenCode is in api-key mode for this provider
    // and clearing OAuth credentials would corrupt that state.
    vi.mocked(storageModule.loadAccounts).mockResolvedValue({
      version: 4,
      accounts: [
        {
          email: "test@example.com",
          refreshToken: "fake-refresh-token",
          projectId: "fake-project",
          addedAt: 0,
          lastUsed: 0,
          enabled: true,
        },
      ],
      activeIndex: 0,
    });

    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      // Force token refresh to fail with invalid_grant so the cleanup path runs.
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(
          JSON.stringify({ error: "invalid_grant", error_description: "test-stop" }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ models: [] }));
      }
      return new Response("1.2.3");
    });
    vi.stubGlobal("fetch", fetchMock);

    // Local client with auth.set as a spy so we can assert it was NOT called.
    const authSetSpy = vi.fn(async () => undefined);
    const localClient = {
      tui: { showToast: vi.fn(async () => undefined) },
      app: { log: vi.fn(async () => undefined) },
      auth: { set: authSetSpy },
    } as unknown as PluginClient;

    try {
      const plugin = await createAntigravityPlugin("google")({
        client: localClient,
        directory: process.cwd(),
      });

      const loader = await plugin.auth.loader(
        async () => ({ type: "api", key: "secret" }),
        {
          id: "google",
          api: "https://generativelanguage.googleapis.com/v1beta",
          npm: "@ai-sdk/google",
          models: {},
        },
      );

      // Drive the OAuth fetch handler through the invalid_grant cleanup path.
      // It will throw "All Antigravity accounts have invalid refresh tokens...".
      try {
        await (loader as { fetch: typeof fetch }).fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/antigravity-gemini-3.1-pro:generateContent",
          { method: "POST", body: "{}" },
        );
      } catch {
        // Expected.
      }

      // First, prove the invalid_grant cleanup path was actually exercised — the
      // OAuth fetch handler must have attempted a token refresh against Google.
      const tokenRefreshCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("oauth2.googleapis.com"),
      );
      expect(tokenRefreshCalls.length).toBeGreaterThan(0);

      // CRITICAL: client.auth.set must NOT have been called — doing so would
      // wipe OpenCode's api-key auth for the google provider.
      expect(authSetSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
