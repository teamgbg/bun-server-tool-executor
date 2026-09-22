/**
 * @system mcp-infrastructure
 * @status handwritten
 * @edit edit directly
 *
 * Internal Railway service authentication for mcp-ai-chat-system tool
 * executors. Uses SCALA_DEV_KEY Bearer token or Basic Auth (for GOWA) to
 * authenticate requests to hub, messaging-service, and other internal
 * services. The auth-header resolver (resolveInternalAuth) and the service
 * registry (isInternalService, getInternalServiceUrl,
 * getInternalServiceEnvVars) are the auth + discovery pair for every
 * internal-service call.
 */

import { getScalaDevKey } from "#tool-executor/configure.ts";
import type {
	ExecutionContext,
	HttpExecutorConfig,
} from "#tool-executor/lib/types.ts";

export interface InternalAuthResult {
	headers: Record<string, string>;
	externalApiKey?: string;
}

/**
 * Resolve auth headers for internal Railway services.
 * Priority: resolvedToken > authType: "basic" > SCALA_DEV_KEY Bearer
 */
export function resolveInternalAuth(
	config: HttpExecutorConfig,
	_context: ExecutionContext,
	resolvedToken?: string,
	tokenRaw?: boolean,
): InternalAuthResult {
	const headers: Record<string, string> = {};
	let externalApiKey: string | undefined;

	// Priority: resolvedToken (from DB) > authType: "basic" > apiKeyEnvVar > internal auth
	if (resolvedToken) {
		// Token was fetched from tokenSource (DB)
		// tokenHeader allows overriding the header name (e.g. X-Api-Key instead of Authorization)
		const headerName = config.tokenHeader || "Authorization";
		headers[headerName] = tokenRaw ? resolvedToken : `Bearer ${resolvedToken}`;
	} else if (config.authType === "basic" && config.basicAuthUser) {
		// Basic Auth — GOWA_PASSWORD (the GOWA bridge credential; APP_BASIC_AUTH =
		// scala:<GOWA_PASSWORD>) is the password; SCALA_DEV_KEY is the fallback.
		const devKey = process.env.GOWA_PASSWORD ?? getScalaDevKey();
		if (!devKey) {
			throw new Error(
				`Missing GOWA_PASSWORD/SCALA_DEV_KEY environment variable. ` +
					`Cannot construct Basic Auth.`,
			);
		}
		const credentials = `${config.basicAuthUser}:${devKey}`;
		headers.Authorization = `Basic ${Buffer.from(credentials).toString("base64")}`;
	} else {
		// Default internal Railway service auth — SERVICE_API_KEY is the
		// dedicated credential (secret/shared-env); SCALA_DEV_KEY is used when
		// SERVICE_API_KEY is unset. Recipients (api-key-auth) accept either.
		const internalKey = process.env.SERVICE_API_KEY ?? getScalaDevKey();
		if (!internalKey) {
			throw new Error(
				`Missing SERVICE_API_KEY/SCALA_DEV_KEY environment variable. ` +
					`Cannot authenticate with internal service.`,
			);
		}
		headers.Authorization = `Bearer ${internalKey}`;
	}

	return { headers, externalApiKey };
}

const INTERNAL_SERVICE_ENV_VARS: Record<string, string> = {
	"oauth-gateway": "OAUTH_GATEWAY_URL",
	hub: "AUTH_URL",
	"api-worker": "API_WORKER_URL",
	"messaging-service": "MESSAGING_SERVICE_URL",
	"mcp-ai-chat-system": "MCP_SERVER_URL",
};

export function isInternalService(service: string): boolean {
	return service in INTERNAL_SERVICE_ENV_VARS;
}

export function getInternalServiceUrl(service: string): string {
	const envVar = INTERNAL_SERVICE_ENV_VARS[service];
	if (!envVar) {
		throw new Error(
			`Unknown internal service: ${service}. Available: ${Object.keys(INTERNAL_SERVICE_ENV_VARS).join(", ")}.`,
		);
	}
	const baseUrl = process.env[envVar];
	if (!baseUrl) {
		throw new Error(
			`${envVar} environment variable is required. ` +
				`Set it to the Railway private domain for ${service}.`,
		);
	}
	return baseUrl;
}

export function getInternalServiceEnvVars(): Record<string, string> {
	return INTERNAL_SERVICE_ENV_VARS;
}
