/**
 * @system mcp-infrastructure
 * @status handwritten
 * @edit edit directly
 *
 * Resolves API key authentication from environment variables and database for external service
 * tool executors in mcp-ai-chat-system. Supports wise_settings, instantly, a_leads integrations,
 * and user-level API keys stored in user_profiles.
 */

import { getServerClient } from "#tool-executor/configure.ts";
import type {
	ExecutionContext,
	HttpExecutorConfig,
} from "#tool-executor/lib/types.ts";

export interface ApiKeyAuthResult {
	headers: Record<string, string>;
	modifiedArgs?: Record<string, unknown>;
	externalApiKey?: string;
}

/**
 * Resolve API key authentication from env vars or database.
 * Handles: apiKeyEnvVar, user_profiles:*, wise_settings, organisation_integrations.instantly, organisation_integrations.a_leads
 */
export async function resolveApiKeyAuth(
	config: HttpExecutorConfig,
	context: ExecutionContext,
	args: Record<string, unknown>,
): Promise<ApiKeyAuthResult | null> {
	const headers: Record<string, string> = {};
	let modifiedArgs: Record<string, unknown> | undefined;
	let externalApiKey: string | undefined;

	// First check for apiKeyEnvVar (external API auth from env)
	if (config.apiKeyEnvVar) {
		const apiKey = process.env[config.apiKeyEnvVar];
		if (!apiKey) {
			throw new Error(
				`Missing API key: environment variable ${config.apiKeyEnvVar} is not set.`,
			);
		}
		externalApiKey = apiKey;
		const headerName = config.apiKeyHeader || "Authorization";
		headers[headerName] = config.apiKeyRaw ? apiKey : `Bearer ${apiKey}`;
		return { headers, modifiedArgs, externalApiKey };
	}

	// Then check for tokenSource database patterns
	if (!config.tokenSource || !context.organisationId) {
		return null;
	}

	const client = getServerClient();

	if (config.tokenSource === "wise_settings") {
		// Wise API key (not OAuth)
		const settings = (await client.wise_settings.findFirst({
			where: { organisation_id: context.organisationId },
			fields: ["api_key", "profile_id"],
		})) as { api_key?: string; profile_id?: string } | null;
		if (!settings?.api_key) {
			throw new Error(
				`Wise integration not configured for this organisation. ` +
					`Add Wise API key in settings before using this tool.`,
			);
		}
		externalApiKey = settings.api_key;
		const headerName = config.tokenHeader || "Authorization";
		headers[headerName] = settings.api_key; // Wise uses raw API key
		// Inject profileId into args if needed and not present
		if (settings.profile_id && !args.profileId) {
			modifiedArgs = { ...args, profileId: settings.profile_id };
		}
		return { headers, modifiedArgs, externalApiKey };
	}

	if (config.tokenSource === "organisation_integrations.instantly") {
		// Instantly API key — stored in organisation_integrations
		// The v8 adapter does not infer a row type from `fields`, so the result
		// arrives as `{}` and every read off it fails. Naming the projection
		// here restores the contract at the one place that knows it.
		const integration = (await client.organisation_integrations.findFirst({
			where: { organisation_id: context.organisationId },
			fields: ["instantly_api_key"],
		})) as { instantly_api_key: string | null } | null;
		if (!integration?.instantly_api_key) {
			throw new Error(
				`Instantly integration not configured for this organisation. ` +
					`Add Instantly API key in organisation settings before using this tool.`,
			);
		}
		// organisation_integrations api keys are decrypted transparently by the
		// service-runtime field-encryption extension on read — use the value directly.
		externalApiKey = integration.instantly_api_key;
		const headerName = config.tokenHeader || "Authorization";
		headers[headerName] = integration.instantly_api_key; // Instantly uses raw API key
		return { headers, modifiedArgs, externalApiKey };
	}

	if (config.tokenSource === "organisation_integrations.a_leads") {
		// A-Leads API key — stored in organisation_integrations
		const integration = (await client.organisation_integrations.findFirst({
			where: { organisation_id: context.organisationId },
			fields: ["a_leads_api_key"],
		})) as { a_leads_api_key: string | null } | null;
		if (!integration?.a_leads_api_key) {
			throw new Error(
				`A-Leads integration not configured for this organisation. ` +
					`Add A-Leads API key in organisation settings before using this tool.`,
			);
		}
		externalApiKey = integration.a_leads_api_key;
		headers["x-api-key"] = integration.a_leads_api_key;
		return { headers, modifiedArgs, externalApiKey };
	}

	if (config.tokenSource.startsWith("user_profiles:")) {
		// User-level API key — stored in user_profiles (e.g. fathom_api_key)
		const field = config.tokenSource.split(":")[1];
		if (!field) {
			throw new Error(
				`Invalid tokenSource format: ${config.tokenSource}. Expected "user_profiles:<field>".`,
			);
		}
		if (!context.userId) {
			throw new Error(
				`User context required. ` +
					`Cannot look up user API key without X-User-Id.`,
			);
		}
		// `field` is chosen at runtime from the tokenSource, so the projection
		// cannot be named statically — a string-keyed record is the honest
		// shape, and the presence check below is what actually guards it.
		const profile = (await client.user_profiles.findFirst({
			where: { user_id: context.userId },
			fields: [field],
		})) as Record<string, string | null> | null;
		if (!profile?.[field]) {
			throw new Error(
				`API key not found in your profile. ` +
					`Configure it in Connection settings before using this tool.`,
			);
		}
		externalApiKey = profile[field];
		const headerName = config.tokenHeader || "Authorization";
		headers[headerName] = profile[field]; // Raw API key
		return { headers, modifiedArgs, externalApiKey };
	}

	// Not an API key pattern
	return null;
}

/**
 * Check if a tokenSource is an API key pattern (non-OAuth).
 */
export function isApiKeyTokenSource(tokenSource: string): boolean {
	return (
		tokenSource === "wise_settings" ||
		tokenSource === "organisation_integrations.instantly" ||
		tokenSource === "organisation_integrations.a_leads" ||
		tokenSource.startsWith("user_profiles:")
	);
}
