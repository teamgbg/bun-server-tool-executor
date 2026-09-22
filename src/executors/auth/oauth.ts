/**
 * @system mcp-infrastructure
 * @status handwritten
 * @edit edit directly
 *
 * Resolves OAuth tokens from database tables for mcp-ai-chat-system tool executors. Handles
 * GoHighLevel (ghl_integrations), Zoho Assist (zoho_assist_integrations), and generic
 * oauth_connections for providers like Gmail and HubSpot.
 */

import { getServerClient } from "#tool-executor/configure.ts";
import type {
	ExecutionContext,
	HttpExecutorConfig,
} from "#tool-executor/lib/types.ts";

export interface OAuthAuthResult {
	headers: Record<string, string>;
	modifiedArgs?: Record<string, unknown>;
	modifiedBaseUrl?: string;
}

/**
 * Resolve OAuth tokens from database tables.
 * Handles: ghl_integrations, zoho_assist_integrations, oauth_connections:*
 */
export async function resolveOAuthAuth(
	tokenSource: string,
	config: HttpExecutorConfig,
	context: ExecutionContext,
	args: Record<string, unknown>,
): Promise<OAuthAuthResult | null> {
	if (!context.organisationId) {
		return null;
	}

	const client = getServerClient();
	const headers: Record<string, string> = {};
	let modifiedArgs: Record<string, unknown> | undefined;
	let modifiedBaseUrl: string | undefined;

	if (tokenSource === "ghl_integrations") {
		// GHL OAuth token — stored in ghl_integrations, auto-refreshed via oauth-gateway
		// The v8 adapter does not infer a row type from `fields`, so the result
		// arrives as `{}`. Naming the projection restores the contract here.
		const integration = (await client.ghl_integrations.findFirst({
			where: { organisation_id: context.organisationId },
			fields: ["access_token", "ghl_location_id"],
		})) as { access_token: string | null; ghl_location_id: string | null } | null;
		if (!integration) {
			throw new Error(
				`GoHighLevel integration not found for this organisation. ` +
					`Connect GHL in settings before using this tool.`,
			);
		}
		const headerName = config.tokenHeader || "Authorization";
		headers[headerName] = `Bearer ${integration.access_token}`;
		// Inject locationId into args if not present and we have it
		if (integration.ghl_location_id && !args.locationId) {
			modifiedArgs = { ...args, locationId: integration.ghl_location_id };
		}
	} else if (tokenSource === "zoho_assist_integrations") {
		// Zoho Assist OAuth token
		const integration = (await client.zoho_assist_integrations.findFirst({
			where: { organisation_id: context.organisationId },
			fields: ["access_token", "zoho_domain"],
		})) as { access_token: string | null; zoho_domain: string | null } | null;
		if (!integration) {
			throw new Error(
				`Zoho Assist integration not found for this organisation. ` +
					`Connect Zoho Assist in settings before using this tool.`,
			);
		}
		const headerName = config.tokenHeader || "Authorization";
		headers[headerName] = `Bearer ${integration.access_token}`;
		// Replace {domain} in baseUrl if present
		if (config.baseUrl && integration.zoho_domain) {
			modifiedBaseUrl = config.baseUrl.replace(
				"{domain}",
				integration.zoho_domain,
			);
		}
	} else if (tokenSource.startsWith("oauth_connections:")) {
		// Generic OAuth connection — fetch from oauth_connections table
		const provider = tokenSource.split(":")[1];
		const connection = (await client.oauth_connections.findFirst({
			where: {
				organisation_id: context.organisationId,
				provider,
				is_active: true,
			},
			fields: ["access_token"],
			orderBy: { connected_at: "desc" },
		})) as { access_token: string | null } | null;
		if (!connection?.access_token) {
			throw new Error(
				`${provider} connection not found for this organisation. ` +
					`Connect ${provider} in settings before using this tool.`,
			);
		}
		const headerName = config.tokenHeader || "Authorization";
		headers[headerName] = `Bearer ${connection.access_token}`;
	} else {
		// Not an OAuth token source
		return null;
	}

	return { headers, modifiedArgs, modifiedBaseUrl };
}

/**
 * Check if a tokenSource is an OAuth pattern.
 */
export function isOAuthTokenSource(tokenSource: string): boolean {
	return (
		tokenSource === "ghl_integrations" ||
		tokenSource === "zoho_assist_integrations" ||
		tokenSource.startsWith("oauth_connections:")
	);
}
