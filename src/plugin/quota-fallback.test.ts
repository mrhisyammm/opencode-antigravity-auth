import { beforeAll, describe, expect, it, vi } from "vitest";
import type { HeaderStyle, ModelFamily } from "./accounts";

type ResolveQuotaFallbackHeaderStyle = (input: {
  family: ModelFamily;
  headerStyle: HeaderStyle;
  alternateStyle: HeaderStyle | null;
}) => HeaderStyle | null;

type GetHeaderStyleFromUrl = (
  urlString: string,
  family: ModelFamily,
  cliFirst?: boolean,
) => HeaderStyle;

type ResolveHeaderRoutingDecision = (
  urlString: string,
  family: ModelFamily,
  config: unknown,
) => {
  cliFirst: boolean;
  preferredHeaderStyle: HeaderStyle;
  explicitQuota: boolean;
  allowQuotaFallback: boolean;
};

type CreateSoftQuotaBlockedResponse = (input: {
  accountCount: number;
  family: ModelFamily;
  threshold: number;
  waitMs: number | null;
  requestedModel?: string;
}) => Response;

let resolveQuotaFallbackHeaderStyle: ResolveQuotaFallbackHeaderStyle | undefined;
let getHeaderStyleFromUrl: GetHeaderStyleFromUrl | undefined;
let resolveHeaderRoutingDecision: ResolveHeaderRoutingDecision | undefined;
let createSoftQuotaBlockedResponse: CreateSoftQuotaBlockedResponse | undefined;

beforeAll(async () => {
  vi.mock("@opencode-ai/plugin", () => ({
    tool: vi.fn(),
  }));

  const { __testExports } = await import("../plugin");
  resolveQuotaFallbackHeaderStyle = (__testExports as {
    resolveQuotaFallbackHeaderStyle?: ResolveQuotaFallbackHeaderStyle;
  }).resolveQuotaFallbackHeaderStyle;
  getHeaderStyleFromUrl = (__testExports as {
    getHeaderStyleFromUrl?: GetHeaderStyleFromUrl;
  }).getHeaderStyleFromUrl;
  resolveHeaderRoutingDecision = (__testExports as {
    resolveHeaderRoutingDecision?: ResolveHeaderRoutingDecision;
  }).resolveHeaderRoutingDecision;
  createSoftQuotaBlockedResponse = (__testExports as {
    createSoftQuotaBlockedResponse?: CreateSoftQuotaBlockedResponse;
  }).createSoftQuotaBlockedResponse;
});

describe("quota fallback direction", () => {
  it("falls back from gemini-cli to antigravity when alternate quota is available", () => {
    const result = resolveQuotaFallbackHeaderStyle?.({
      family: "gemini",
      headerStyle: "gemini-cli",
      alternateStyle: "antigravity",
    });

    expect(result).toBe("antigravity");
  });

  it("falls back from antigravity to gemini-cli when alternate quota is available", () => {
    const result = resolveQuotaFallbackHeaderStyle?.({
      family: "gemini",
      headerStyle: "antigravity",
      alternateStyle: "gemini-cli",
    });

    expect(result).toBe("gemini-cli");
  });

  it("returns null when no alternate quota is available", () => {
    const result = resolveQuotaFallbackHeaderStyle?.({
      family: "gemini",
      headerStyle: "antigravity",
      alternateStyle: null,
    });

    expect(result).toBeNull();
  });
});

describe("header style resolution", () => {
  it("uses gemini-cli for unsuffixed Gemini models when cli_first is enabled", () => {
    const headerStyle = getHeaderStyleFromUrl?.(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:streamGenerateContent",
      "gemini",
      true,
    );

    expect(headerStyle).toBe("gemini-cli");
  });

  it("keeps antigravity for unsuffixed Gemini models when cli_first is disabled", () => {
    const headerStyle = getHeaderStyleFromUrl?.(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:streamGenerateContent",
      "gemini",
      false,
    );

    expect(headerStyle).toBe("antigravity");
  });

  it("keeps antigravity for explicit antigravity prefix when cli_first is enabled", () => {
    const headerStyle = getHeaderStyleFromUrl?.(
      "https://generativelanguage.googleapis.com/v1beta/models/antigravity-gemini-3-flash:streamGenerateContent",
      "gemini",
      true,
    );

    expect(headerStyle).toBe("antigravity");
  });

  it("keeps antigravity for Claude when cli_first is enabled", () => {
    const headerStyle = getHeaderStyleFromUrl?.(
      "https://generativelanguage.googleapis.com/v1beta/models/claude-opus-4-6-thinking:streamGenerateContent",
      "claude",
      true,
    );

    expect(headerStyle).toBe("antigravity");
  });
});

describe("header routing decision", () => {
  it("defaults to antigravity-first for unsuffixed Gemini when cli_first is disabled", () => {
    const decision = resolveHeaderRoutingDecision?.(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:streamGenerateContent",
      "gemini",
      {
        cli_first: false,
      },
    );

    expect(decision).toMatchObject({
      cliFirst: false,
      preferredHeaderStyle: "antigravity",
      explicitQuota: false,
      allowQuotaFallback: true,
    });
  });

  it("uses gemini-cli-first for unsuffixed Gemini when cli_first is enabled", () => {
    const decision = resolveHeaderRoutingDecision?.(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:streamGenerateContent",
      "gemini",
      {
        cli_first: true,
      },
    );

    expect(decision).toMatchObject({
      cliFirst: true,
      preferredHeaderStyle: "gemini-cli",
      explicitQuota: false,
      allowQuotaFallback: true,
    });
  });

  it("keeps explicit antigravity prefix as primary route while fallback remains available", () => {
    const decision = resolveHeaderRoutingDecision?.(
      "https://generativelanguage.googleapis.com/v1beta/models/antigravity-gemini-3-flash:streamGenerateContent",
      "gemini",
      {
        cli_first: true,
      },
    );

    expect(decision).toMatchObject({
      cliFirst: true,
      preferredHeaderStyle: "antigravity",
      explicitQuota: true,
      allowQuotaFallback: true,
    });
  });

  it("ignores legacy quota_fallback when deciding Gemini fallback availability", () => {
    const decision = resolveHeaderRoutingDecision?.(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:streamGenerateContent",
      "gemini",
      {
        cli_first: false,
        quota_fallback: false,
      },
    );

    expect(decision).toMatchObject({
      cliFirst: false,
      preferredHeaderStyle: "antigravity",
      explicitQuota: false,
      allowQuotaFallback: true,
    });
  });
});

describe("quota blocked responses", () => {
  it("returns a synthetic stream instead of throwing when API-key fallback is disabled", async () => {
    const response = createSoftQuotaBlockedResponse?.({
      accountCount: 2,
      family: "gemini",
      threshold: 90,
      waitMs: null,
      requestedModel: "antigravity-gemini-3-pro",
    });

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toContain("text/event-stream");

    const body = await response!.text();
    expect(body).toContain("Quota protection: All 2 account(s) are over 90% usage for gemini.");
    expect(body).toContain("Quota resets in unknown.");
    expect(body).toContain("api_key_fallback");
    expect(body).toContain("antigravity-gemini-3-pro");
  });
});
