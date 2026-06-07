import type { ProviderModel } from "../types.js";
export type ModelThinkingLevel = "minimal" | "low" | "medium" | "high";
export interface ModelThinkingConfig {
    thinkingBudget: number;
}
export interface ModelVariant {
    thinkingLevel?: ModelThinkingLevel;
    thinkingConfig?: ModelThinkingConfig;
}
export interface ModelLimit {
    context: number;
    output: number;
}
export type ModelModality = "text" | "image" | "pdf";
export interface ModelModalities {
    input: ModelModality[];
    output: ModelModality[];
}
export interface OpencodeModelDefinition extends ProviderModel {
    name: string;
    limit: ModelLimit;
    modalities: ModelModalities;
    variants?: Record<string, ModelVariant>;
}
export type OpencodeModelDefinitions = Record<string, OpencodeModelDefinition>;
export interface GeminiApiModel {
    name?: string;
    baseModelId?: string;
    displayName?: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    supportedGenerationMethods?: string[];
}
export interface AntigravityAvailableModel {
    displayName?: string;
    modelName?: string;
}
export type AntigravityAvailableModels = Record<string, AntigravityAvailableModel>;
export declare const OPENCODE_MODEL_DEFINITIONS: OpencodeModelDefinitions;
export declare function modelsFromGeminiApi(models: GeminiApiModel[]): OpencodeModelDefinitions;
export declare function modelsFromAntigravityAvailableModels(models: AntigravityAvailableModels): OpencodeModelDefinitions;
export declare function mergeModelDefinitions(...definitions: Record<string, ProviderModel>[]): Record<string, ProviderModel>;
//# sourceMappingURL=models.d.ts.map