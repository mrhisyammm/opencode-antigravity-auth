import type { AntigravityConfig } from "./config/index.js";
import type { GeminiApiModel } from "./config/models.js";
import type { ApiKeyAuthDetails } from "./types.js";
export interface AgySdkCredential {
    label: string;
    apiKey: string;
    projectId?: string;
}
export interface GeminiApiModelsResponse {
    models?: GeminiApiModel[];
    nextPageToken?: string;
}
interface PreparedAgySdkGeminiRequest {
    request: RequestInfo;
    init: RequestInit;
    model?: string;
}
export declare function resetAgySdkCredentialStateForTests(): void;
export declare function getAgySdkCredentials(config: AntigravityConfig, auth?: ApiKeyAuthDetails | null): AgySdkCredential[];
export declare function selectAgySdkCredential(credentials: AgySdkCredential[]): AgySdkCredential | null;
export declare function markAgySdkCredentialRateLimited(credential: AgySdkCredential, retryAfterMs: number): void;
export declare function isApiKeyAuth(auth: unknown): auth is ApiKeyAuthDetails;
/**
 * Returns true when the request can be routed to the public Gemini API
 * (`generativelanguage.googleapis.com`) via the api-key path — either natively
 * or via translation in `prepareAgySdkGeminiRequest`.
 *
 * Antigravity-only models with no public-API equivalent (Claude ids, unmapped
 * antigravity- prefixed non-Gemini ids) are excluded: the caller should stay on
 * the OAuth Antigravity path or short-circuit with a synthetic error.
 */
export declare function isAgySdkSupportedRequest(urlString: string): boolean;
/**
 * Returns true when the URL targets `generativelanguage.googleapis.com` with an
 * Antigravity-only model that CANNOT be served by the public Gemini API even
 * with translation — Claude ids and unmapped antigravity- prefixed non-Gemini ids.
 *
 * Translatable Antigravity-only Gemini ids (e.g. `antigravity-gemini-3.1-pro`,
 * bare `gemini-3.1-pro`) and Antigravity-prefixed public-API natives (e.g.
 * `antigravity-gemini-3.5-flash` → `gemini-3.5-flash`) return false here —
 * `prepareAgySdkGeminiRequest` rewrites them to the public-API equivalent.
 *
 * Use this in API-key-only auth paths to short-circuit with a helpful synthetic
 * error (via `createAntigravityOnlyModelErrorResponse`) instead of forwarding to
 * the public Gemini API where it would 404.
 */
export declare function isAntigravityOnlyGenerativeLanguageRequest(urlString: string): boolean;
/**
 * Extracts the requested model id from a `generativelanguage.googleapis.com`
 * URL (e.g. `.../v1beta/models/gemini-3.1-pro:generateContent` -> `gemini-3.1-pro`).
 * Returns `undefined` when the URL is malformed or doesn't match the model path.
 */
export declare function extractRequestedGeminiModel(urlString: string): string | undefined;
/**
 * Classifies models that the Antigravity Code Assist backend serves but the public
 * Gemini API (v1beta on `generativelanguage.googleapis.com`) does not.
 *
 * Anything with the `antigravity-` prefix or any Claude model is OAuth-only by
 * construction. For Gemini ids we use an explicit denylist (see
 * `ANTIGRAVITY_ONLY_BARE_GEMINI_IDS`).
 */
export declare function isLikelyAntigravityOnlyModel(model: string): boolean;
/**
 * When the public Gemini API returns 404 NOT_FOUND for a model, rewrite the
 * response body with actionable guidance. Without this, users see a bare
 * "models/X is not found for API version v1beta" from Google and have no
 * indication that the plugin routed their request through the API-key path
 * because (a) opencode is in API-key mode for the google provider, or
 * (b) all OAuth accounts were rate-limited and `api_key_fallback` kicked in.
 *
 * The rewritten body preserves the JSON error envelope so `@ai-sdk/google` still
 * surfaces it as a normal `AI_APICallError` — only the human-facing message changes.
 */
export declare function enhanceAgySdkErrorResponse(response: Response, requestedModel: string | undefined): Promise<Response>;
/**
 * Synthesizes the same 404 guidance produced by `enhanceAgySdkErrorResponse`,
 * but pre-flight — before any request is sent to the public Gemini API.
 *
 * Use this in API-key-only auth paths when the requested model is identified by
 * `isLikelyAntigravityOnlyModel`: the round trip would deterministically 404,
 * so we short-circuit with the same Gemini-shaped error envelope. The shape
 * matches `enhanceAgySdkErrorResponse` so `@ai-sdk/google` raises a normal
 * `AI_APICallError` carrying the actionable message.
 */
export declare function createAntigravityOnlyModelErrorResponse(requestedModel: string): Response;
export declare function prepareAgySdkGeminiRequest(input: RequestInfo, init: RequestInit | undefined, credential: AgySdkCredential): Promise<PreparedAgySdkGeminiRequest>;
export declare function fetchWithAgySdkCredential(input: RequestInfo, init: RequestInit | undefined, credential: AgySdkCredential, fallbackRetryAfterMs: number): Promise<Response>;
export declare function fetchGeminiApiModels(credential: AgySdkCredential): Promise<GeminiApiModel[]>;
export {};
//# sourceMappingURL=api-key.d.ts.map