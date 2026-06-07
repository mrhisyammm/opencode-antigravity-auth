const DEFAULT_MODALITIES = {
    input: ["text", "image", "pdf"],
    output: ["text"],
};
export const OPENCODE_MODEL_DEFINITIONS = {
    "antigravity-gemini-3-pro": {
        name: "Gemini 3 Pro (Antigravity)",
        limit: { context: 1048576, output: 65535 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            low: { thinkingLevel: "low" },
            high: { thinkingLevel: "high" },
        },
    },
    "antigravity-gemini-3.1-pro": {
        name: "Gemini 3.1 Pro (Antigravity)",
        limit: { context: 1048576, output: 65535 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            low: { thinkingLevel: "low" },
            high: { thinkingLevel: "high" },
        },
    },
    "antigravity-gemini-3-flash": {
        name: "Gemini 3 Flash (Antigravity)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            minimal: { thinkingLevel: "minimal" },
            low: { thinkingLevel: "low" },
            medium: { thinkingLevel: "medium" },
            high: { thinkingLevel: "high" },
        },
    },
    "antigravity-gemini-3.5-flash": {
        name: "Gemini 3.5 Flash (Antigravity)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            minimal: { thinkingLevel: "minimal" },
            low: { thinkingLevel: "low" },
            medium: { thinkingLevel: "medium" },
            high: { thinkingLevel: "high" },
        },
    },
    "antigravity-claude-sonnet-4-6": {
        name: "Claude Sonnet 4.6 (Antigravity)",
        limit: { context: 200000, output: 64000 },
        modalities: DEFAULT_MODALITIES,
    },
    "antigravity-claude-opus-4-6-thinking": {
        name: "Claude Opus 4.6 Thinking (Antigravity)",
        limit: { context: 200000, output: 64000 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            low: { thinkingConfig: { thinkingBudget: 8192 } },
            max: { thinkingConfig: { thinkingBudget: 32768 } },
        },
    },
    "gemini-2.5-flash": {
        name: "Gemini 2.5 Flash (Gemini CLI)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
    },
    "gemini-2.5-pro": {
        name: "Gemini 2.5 Pro (Gemini CLI)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
    },
    "gemini-3-flash-preview": {
        name: "Gemini 3 Flash Preview (Gemini CLI)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
    },
    "gemini-3.5-flash": {
        name: "Gemini 3.5 Flash (Gemini CLI)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
    },
    "gemini-3-pro-preview": {
        name: "Gemini 3 Pro Preview (Gemini CLI)",
        limit: { context: 1048576, output: 65535 },
        modalities: DEFAULT_MODALITIES,
    },
    "gemini-3.1-pro": {
        name: "Gemini 3.1 Pro (Gemini CLI)",
        limit: { context: 1048576, output: 65535 },
        modalities: DEFAULT_MODALITIES,
    },
    "gemini-3.1-pro-preview": {
        name: "Gemini 3.1 Pro Preview (Gemini CLI)",
        limit: { context: 1048576, output: 65535 },
        modalities: DEFAULT_MODALITIES,
    },
    "gemini-3.1-pro-preview-customtools": {
        name: "Gemini 3.1 Pro Preview Custom Tools (Gemini CLI)",
        limit: { context: 1048576, output: 65535 },
        modalities: DEFAULT_MODALITIES,
    },
};
function modelIdFromGeminiName(name) {
    if (!name)
        return null;
    const id = name.replace(/^models\//, "").trim();
    return id || null;
}
function supportsGeminiGeneration(model) {
    const methods = model.supportedGenerationMethods ?? [];
    return methods.includes("generateContent") || methods.includes("streamGenerateContent");
}
function titleFromModelId(modelId) {
    return modelId
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}
function defaultLimitForModel(modelId) {
    if (modelId.includes("claude")) {
        return { context: 200000, output: 64000 };
    }
    return { context: 1048576, output: 65536 };
}
function mergeWithStaticDefinition(modelId, discovered) {
    const existing = OPENCODE_MODEL_DEFINITIONS[modelId];
    if (!existing)
        return discovered;
    return {
        ...existing,
        ...discovered,
        limit: discovered.limit ?? existing.limit,
        modalities: discovered.modalities ?? existing.modalities,
        variants: existing.variants,
    };
}
function antigravityModelIdFromEntry(sourceId, entry) {
    const rawId = (entry.modelName || sourceId).trim();
    if (!rawId)
        return null;
    const modelId = rawId.replace(/^models\//, "");
    return modelId.startsWith("antigravity-") ? modelId : `antigravity-${modelId}`;
}
export function modelsFromGeminiApi(models) {
    const definitions = {};
    for (const model of models) {
        if (!supportsGeminiGeneration(model))
            continue;
        const modelId = modelIdFromGeminiName(model.name) || model.baseModelId;
        if (!modelId)
            continue;
        const discovered = {
            name: model.displayName ? `${model.displayName} (Gemini API)` : `${titleFromModelId(modelId)} (Gemini API)`,
            limit: {
                context: model.inputTokenLimit ?? defaultLimitForModel(modelId).context,
                output: model.outputTokenLimit ?? defaultLimitForModel(modelId).output,
            },
            modalities: DEFAULT_MODALITIES,
        };
        definitions[modelId] = mergeWithStaticDefinition(modelId, discovered);
    }
    return definitions;
}
export function modelsFromAntigravityAvailableModels(models) {
    const definitions = {};
    for (const [sourceId, entry] of Object.entries(models)) {
        const modelId = antigravityModelIdFromEntry(sourceId, entry);
        if (!modelId)
            continue;
        // Check if the model has a tier/thinking suffix
        const tierMatch = modelId.match(/-(minimal|low|medium|high|max)$/);
        let baseModelId = modelId;
        let variantName = undefined;
        if (tierMatch) {
            baseModelId = modelId.slice(0, -tierMatch[0].length);
            variantName = tierMatch[1];
        }
        // Initialize or merge into the base model definition
        if (!definitions[baseModelId]) {
            const displayName = entry.displayName ?? titleFromModelId(baseModelId);
            const baseName = displayName.replace(/[- ](minimal|low|medium|high|max)$/i, "").trim();
            const discovered = {
                name: `${baseName} (Antigravity)`,
                limit: defaultLimitForModel(baseModelId),
                modalities: DEFAULT_MODALITIES,
            };
            definitions[baseModelId] = mergeWithStaticDefinition(baseModelId, discovered);
        }
        // If it had a variant, add it to the variants record
        const targetDef = definitions[baseModelId];
        if (variantName && targetDef) {
            if (!targetDef.variants) {
                targetDef.variants = {};
            }
            if (baseModelId.includes("claude")) {
                // Map variant names to reasonable thinking budget numbers for Claude
                const budget = variantName === "low" ? 8192 : 32768;
                targetDef.variants[variantName] = {
                    thinkingConfig: { thinkingBudget: budget }
                };
            }
            else {
                targetDef.variants[variantName] = {
                    thinkingLevel: variantName
                };
            }
        }
    }
    return definitions;
}
export function mergeModelDefinitions(...definitions) {
    return Object.assign({}, ...definitions);
}
//# sourceMappingURL=models.js.map