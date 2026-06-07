import type { PluginClient } from "./types.js";
import type { AccountMetadataV3 } from "./storage.js";
export type QuotaGroup = "claude" | "gemini-pro" | "gemini-flash" | "gemini-3.5-flash";
export interface QuotaGroupSummary {
    remainingFraction?: number;
    resetTime?: string;
    modelCount: number;
}
export interface QuotaSummary {
    groups: Partial<Record<QuotaGroup, QuotaGroupSummary>>;
    modelCount: number;
    error?: string;
}
export interface GeminiCliQuotaModel {
    modelId: string;
    remainingFraction: number;
    resetTime?: string;
}
export interface GeminiCliQuotaSummary {
    models: GeminiCliQuotaModel[];
    error?: string;
}
export type AccountQuotaStatus = "ok" | "disabled" | "error";
export interface AccountQuotaResult {
    index: number;
    email?: string;
    status: AccountQuotaStatus;
    error?: string;
    disabled?: boolean;
    quota?: QuotaSummary;
    geminiCliQuota?: GeminiCliQuotaSummary;
    updatedAccount?: AccountMetadataV3;
}
export interface FetchAvailableModelsResponse {
    models?: Record<string, FetchAvailableModelEntry>;
}
export interface FetchAvailableModelEntry {
    quotaInfo?: {
        remainingFraction?: number;
        resetTime?: string;
    };
    displayName?: string;
    modelName?: string;
}
declare function aggregateQuota(models?: Record<string, FetchAvailableModelEntry>): QuotaSummary;
export declare function fetchAvailableModels(accessToken: string, projectId: string): Promise<FetchAvailableModelsResponse>;
export declare function checkAccountsQuota(accounts: AccountMetadataV3[], client: PluginClient, providerId?: string): Promise<AccountQuotaResult[]>;
export declare const __testExports: {
    aggregateQuota: typeof aggregateQuota;
};
export {};
//# sourceMappingURL=quota.d.ts.map