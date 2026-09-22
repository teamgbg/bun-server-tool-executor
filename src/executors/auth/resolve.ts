/**
 * @system mcp-infrastructure
 * @status handwritten
 * @edit edit directly
 *
 * Orchestrates auth resolution for HTTP tool execution in mcp-ai-chat-system. Prioritizes
 * OAuth tokens over API keys over internal auth, resolves service base URLs from environment
 * variables or config, and injects context headers (X-User-Id, X-Organisation-Id).
 */

import type {
	ExecutionContext,
	HttpExecutorConfig,
} from "#tool-executor/lib/types.ts";
import { resolveApiKeyAuth } from "./api-key";
import {
	getInternalServiceEnvVars,
	getInternalServiceUrl,
	isInternalService,
	resolveInternalAuth,
} from "./internal";
import { isOAuthTokenSource, resolveOAuthAuth } from "./oauth";

export interface AuthResult {
	headers: Record<string, string>;
	args?: Record<string, unknown>;
	externalApiKey?: string;
	baseUrl?: string;
}

/**
 * Resolve authentication headers and modified args based on executor config.
 *
 * Strategy order:
 * 1. OAuth token sources (ghl_integrations, zoho_assist_integrations, oauth_connections:*)
 * 2. API key sources (apiKeyEnvVar, wise_settings, organisation_integrations.instantly, user_profiles:*)
 * 3. Internal auth fallback (SCALA_DEV_KEY Bearer or Basic Auth)
 */
export async function resolveAuth(
	config: HttpExecutorConfig,
	context: ExecutionContext,
	args: Record<string, unknown>,
	_service: string,
): Promise<AuthResult> {
	let headers: Record<string, string> = {};
	let modifiedArgs: Record<string, unknown> | undefined;
	let externalApiKey: string | undefined;
	let baseUrl: string | undefined;

	// Try OAuth token sources first
	if (config.tokenSource && isOAuthTokenSource(config.tokenSource)) {
		const oauthResult = await resolveOAuthAuth(
			config.tokenSource,
			config,
			context,
			args,
		);
		if (oauthResult) {
			headers = { ...headers, ...oauthResult.headers };
			if (oauthResult.modifiedArgs) {
				modifiedArgs = oauthResult.modifiedArgs;
			}
			if (oauthResult.modifiedBaseUrl) {
				baseUrl = oauthResult.modifiedBaseUrl;
			}
			return { headers, args: modifiedArgs, externalApiKey, baseUrl };
		}
	}

	// Try API key sources
	const apiKeyResult = await resolveApiKeyAuth(
		config,
		context,
		modifiedArgs || args,
	);
	if (apiKeyResult) {
		headers = { ...headers, ...apiKeyResult.headers };
		if (apiKeyResult.modifiedArgs) {
			modifiedArgs = apiKeyResult.modifiedArgs;
		}
		externalApiKey = apiKeyResult.externalApiKey;
		return { headers, args: modifiedArgs, externalApiKey, baseUrl };
	}

	// Fall back to internal auth (SCALA_DEV_KEY or Basic Auth)
	// For internal services, we always use internal auth
	// For external services without apiKeyEnvVar, we also fall back to internal auth pattern
	const internalResult = resolveInternalAuth(config, context);
	headers = { ...headers, ...internalResult.headers };
	externalApiKey = internalResult.externalApiKey;

	return { headers, args: modifiedArgs, externalApiKey, baseUrl };
}

/**
 * Resolve base URL for a service.
 * - Internal services: from env vars (Railway private URLs)
 * - External services: from config.baseUrl
 */
export function resolveBaseUrl(
	service: string,
	config: HttpExecutorConfig,
): string {
	if (isInternalService(service)) {
		return getInternalServiceUrl(service);
	}

	if (config.baseUrl) {
		return config.baseUrl;
	}

	throw new Error(
		`Tool has service "${service}" but no baseUrl in executor_config. ` +
			`Add baseUrl to the tool's executor_config in the ai_tools table.`,
	);
}

/**
 * Check if a service is internal (Railway).
 */
export { getInternalServiceEnvVars, isInternalService };
