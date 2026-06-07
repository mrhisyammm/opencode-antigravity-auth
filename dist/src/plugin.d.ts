import { type HeaderStyle } from "./constants.js";
import { type ModelFamily } from "./plugin/accounts.js";
import { type AntigravityConfig } from "./plugin/config/index.js";
import type { PluginClient, PluginContext, PluginResult } from "./plugin/types.js";
type VerificationProbeResult = {
    status: "ok" | "blocked" | "error";
    message: string;
    verifyUrl?: string;
};
declare function verifyAccountAccess(account: {
    refreshToken: string;
    email?: string;
    projectId?: string;
    managedProjectId?: string;
}, client: PluginClient, providerId: string): Promise<VerificationProbeResult>;
declare function createSoftQuotaBlockedResponse(input: {
    accountCount: number;
    family: ModelFamily;
    threshold: number;
    waitMs: number | null;
    requestedModel?: string;
}): Response;
/**
 * Creates an Antigravity OAuth plugin for a specific provider ID.
 */
export declare const createAntigravityPlugin: (providerId: string) => ({ client, directory }: PluginContext) => Promise<PluginResult>;
export declare const AntigravityCLIOAuthPlugin: ({ client, directory }: PluginContext) => Promise<PluginResult>;
export declare const GoogleOAuthPlugin: ({ client, directory }: PluginContext) => Promise<PluginResult>;
declare function resolveQuotaFallbackHeaderStyle(input: {
    family: ModelFamily;
    headerStyle: HeaderStyle;
    alternateStyle: HeaderStyle | null;
}): HeaderStyle | null;
type HeaderRoutingDecision = {
    cliFirst: boolean;
    preferredHeaderStyle: HeaderStyle;
    explicitQuota: boolean;
    allowQuotaFallback: boolean;
};
declare function resolveHeaderRoutingDecision(urlString: string, family: ModelFamily, config: AntigravityConfig): HeaderRoutingDecision;
declare function getHeaderStyleFromUrl(urlString: string, family: ModelFamily, cliFirst?: boolean): HeaderStyle;
export declare const __testExports: {
    getHeaderStyleFromUrl: typeof getHeaderStyleFromUrl;
    createSoftQuotaBlockedResponse: typeof createSoftQuotaBlockedResponse;
    verifyAccountAccess: typeof verifyAccountAccess;
    resolveHeaderRoutingDecision: typeof resolveHeaderRoutingDecision;
    resolveQuotaFallbackHeaderStyle: typeof resolveQuotaFallbackHeaderStyle;
};
export {};
//# sourceMappingURL=plugin.d.ts.map