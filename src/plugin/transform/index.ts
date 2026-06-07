/**
 * Transform Module Index
 * 
 * Re-exports transform functions and types for request transformation.
 */

// Types
export type {
  ModelFamily,
  ThinkingTier,
  TransformContext,
  TransformResult,
  TransformDebugInfo,
  RequestPayload,
  ThinkingConfig,
  ResolvedModel,
  GoogleSearchConfig,
} from "./types.js";

// Model resolution
export {
  mapAntigravityModelToPublicApi,
  resolveModelWithTier,
  resolveModelWithVariant,
  resolveModelForHeaderStyle,
  resolveAntigravityGemini35FlashBackendModel,
  getModelFamily,
  MODEL_ALIASES,
  THINKING_TIER_BUDGETS,
  GEMINI_3_THINKING_LEVELS,
} from "./model-resolver.js";
export type { VariantConfig } from "./model-resolver.js";

// Claude transforms
export {
  isClaudeModel,
  isClaudeThinkingModel,
  configureClaudeToolConfig,
  buildClaudeThinkingConfig,
  ensureClaudeMaxOutputTokens,
  appendClaudeThinkingHint,
  normalizeClaudeTools,
  applyClaudeTransforms,
  CLAUDE_THINKING_MAX_OUTPUT_TOKENS,
  CLAUDE_INTERLEAVED_THINKING_HINT,
} from "./claude.js";
export type { ClaudeTransformOptions, ClaudeTransformResult } from "./claude.js";

// Gemini transforms
export {
  isGeminiModel,
  isGemini3Model,
  isGemini25Model,
  isImageGenerationModel,
  buildGemini3ThinkingConfig,
  buildGemini25ThinkingConfig,
  buildImageGenerationConfig,
  normalizeGeminiTools,
  applyGeminiTransforms,
} from "./gemini.js";
export type { GeminiTransformOptions, GeminiTransformResult, ImageConfig } from "./gemini.js";

// Cross-model sanitization
export {
  sanitizeCrossModelPayload,
  sanitizeCrossModelPayloadInPlace,
  getModelFamily as getCrossModelFamily,
  stripGeminiThinkingMetadata,
  stripClaudeThinkingFields,
} from "./cross-model-sanitizer.js";
export type { SanitizerOptions } from "./cross-model-sanitizer.js";
