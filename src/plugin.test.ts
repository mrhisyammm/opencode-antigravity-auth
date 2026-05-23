import { describe, expect, it, vi } from "vitest";

import type { PluginClient } from "./plugin/types";

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

const { createAntigravityPlugin } = await import("./plugin");

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
