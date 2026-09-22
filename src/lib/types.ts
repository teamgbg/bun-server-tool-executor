/**
 * @system mcp-infrastructure
 * @status handwritten
 * @edit edit directly
 *
 * Core type definitions for the tool executor: discriminated ExecutorConfig
 * (OrpcExecutorConfig | HttpExecutorConfig | SdkExecutorConfig),
 * EnrichConfig for post-query joins, and ExecutionContext carrying
 * user/org/admin state into each tool call.
 */

// --- Shared fields (common to all executor types) ---

interface ExecutorConfigShared {
	[key: string]: unknown;
	// Static args to inject into every request body (lowest priority).
	injectArgs?: Record<string, unknown>;

	// Org integration gate — check that the org has this integration enabled
	// before executing. Uses the boolean field pattern: e.g. "a_leads" checks
	// organisation_integrations.a_leads_enabled = true
	orgIntegrationGate?: string;
}

/**
 * Minimal dynamic-model Prisma client surface for helpers that resolve a model
 * by NAME (`prisma[modelName]`) — PrismaClient's models aren't string-indexable,
 * so dynamic-by-name callers (enrichment findMany, response count) use this shape
 * instead of `any`. Covers only the methods tool-executor reaches dynamically.
 */
export type DynamicPrismaClient = Record<
	string,
	{
		findMany?: (args: {
			where?: unknown;
			select?: unknown;
			take?: number;
		}) => Promise<Record<string, unknown>[]>;
		findFirst?: (args: { where?: unknown; select?: unknown }) => Promise<Record<string, unknown> | null>;
		count?: (args: { where?: unknown }) => Promise<number>;
	}
>;

// --- ORPC executor config ---

export interface OrpcExecutorConfig extends ExecutorConfigShared {
	executor_key: "orpc";

	// Auth and scope filtering.
	scopeType?: "org" | "user" | "public";
	orgField?: string;
	userField?: string;

	// When true, the executor forwards args as-is without CRUD reshaping.
	// Auto-detected for non-CRUD method names; set explicitly for edge cases.
	passthrough?: boolean;

	// List defaults
	defaultLimit?: number;
	defaultOrderBy?: Record<string, "asc" | "desc">;
	includeCount?: boolean;

	// Filter transforms: AI-friendly params → Prisma where
	filterTransforms?: Record<
		string,
		{
			field: string;
			operator: "eq" | "gte" | "lte" | "gt" | "lt" | "contains" | "in";
			dayOffset?: number;
		}
	>;

	// Flat filter extraction
	flatFilterFields?: string[];

	/**
	 * Database-owned row boundary applied to every generated operation. The
	 * generator uses this when one Prisma model contains a protected subtype
	 * (for example credential rows beside ordinary registry rows). It keeps the
	 * tool generated while making the protected slice unreachable, instead of
	 * requiring a bespoke handler for the whole model.
	 */
	whereConstraint?: Record<string, unknown>;

	/** Field values that generated create/update inputs may never write. */
	forbiddenFieldValues?: Record<string, unknown[]>;

	// Direct field match — maps input param names to DB column names.
	directMatchFields?: Record<string, string>;

	// Auto-inject fields per operation
	autoInject?: {
		create?: Record<string, unknown>;
		update?: Record<string, unknown>;
		findMany?: Record<string, unknown>;
	};

	// Field names to auto-populate on create/update operations.
	auditFields?: {
		created_by?: string;
		updated_by?: string;
	};

	// Input transform for update operations
	autoTransformUpdate?: boolean;

	// Primary key field name (default: 'id')
	identifierField?: string;
	/** Prisma primary/unique identity fields; multiple fields form one composite key. */
	identifierFields?: string[];
	// Alias the tool-generator emits (`orpc-args.ts`: "Tool generator uses
	// 'idField', executor uses 'identifierField'"). Typed so consumers don't
	// reach it via `as any`; resolved as `identifierField || idField || "id"`.
	idField?: string;

	// Skip org field injection on create
	skipOrgInjectOnCreate?: boolean;

	// Admin override via targetUserId
	adminOverride?: boolean;

	// Multi-field search — generates OR clause with case-insensitive contains.
	searchFields?: string[];
	searchCaseSensitive?: boolean;

	// Default select fields when no select is provided
	defaultSelect?: Record<string, boolean>;

	// Action-to-procedure mapping for consolidated tools.
	procedureMap?: Record<string, string>;

	// Per-model config overrides for grouped tools.
	modelConfigs?: Record<string, Partial<OrpcExecutorConfig>>;

	// Alternative action mapping with rich config.
	actionMap?: Record<string, string | { procedure: string }>;

	// Post-query enrichment
	enrich?: EnrichConfig[];
}

// --- HTTP executor config ---

export interface HttpExecutorConfig extends ExecutorConfigShared {
	executor_key: "http";

	// Request timeout in ms
	timeout?: number;
	requiresContext?: boolean;

	// External API base URL
	baseUrl?: string;

	// API key resolution
	apiKeyEnvVar?: string;
	apiKeyHeader?: string;
	apiKeyRaw?: boolean;
	apiKeyBodyField?: string;

	// Basic Auth
	authType?: "basic";
	basicAuthUser?: string;

	// Map tool arg names to custom HTTP headers
	headerMap?: Record<string, string>;

	// OAuth token source
	tokenSource?:
		| "ghl_integrations"
		| "zoho_assist_integrations"
		| "wise_settings"
		| "organisation_integrations.instantly"
		| "organisation_integrations.a_leads"
		| `oauth_connections:${string}`
		| `user_profiles:${string}`;
	tokenHeader?: string;
	tokenDomainField?: string;

	// Lowercase specified fields before sending
	lowercaseFields?: string[];

	// Wrap request body in a key
	bodyWrapper?: string;

	// Action-based endpoint routing
	endpointMap?: Record<string, { endpoint: string; method: string }>;
}

// --- SDK executor config ---

export interface SdkExecutorConfig extends ExecutorConfigShared {
	executor_key: "sdk";
	// SDK-specific fields can be added here as needed.
}

export interface EnrichConfig {
	sourceField: string;
	model: string;
	matchField: string;
	select: string[];
	as: Record<string, string>;
}

export interface ToolDefinition {
	id: string;
	name: string;
	description?: string | null;
	executor_key: string | null;
	service: string | null;
	endpoint: string | null;
	http_method: string | null;
	orpc_procedure: string | null;
	input_schema?: Record<string, unknown> | null;
	executor_config?: Record<string, unknown> | null;
	/**
	 * Whether this tool appears in `tools/list`. Absent means LISTED, so this is
	 * purely additive and no existing tool changes behaviour.
	 *
	 * Governs the CATALOGUE PROJECTION ONLY, never dispatch: an unlisted tool is
	 * still registered and still executes, reachable through the gateway
	 * meta-tools. Unlisting must not be able to make a tool un-callable — that
	 * failure already shipped in reverse (64 tools that listed and returned
	 * "Unknown tool" on every call).
	 */
	listed?: boolean;
	/**
	 * The capability tier a caller must hold to execute this tool
	 * (ai_agents.capability_tier, migration 748). Absent means the
	 * org-scoped default — never a bypass. Enforced at the direct-dispatch
	 * boundary (mcp-tool-runtime build-handler) and the federation boundary
	 * (mcp-client-pool checkToolExecutable) from one comparison core.
	 */
	capabilityTier?: CapabilityTier;
}

export type { ExecutionContext } from "@teamscala/os/contracts/mcp";

/** Local canonical view of the caller's capability tier — the real type lives
 *  in @teamscala/mcp-multi-session and cannot be imported here (tier crossing
 *  per vertical-dependency-only). The union is one vocabulary fact; keep the
 *  two definitions in sync by the shared noun, never by an import. */
export type CapabilityTier = "contact" | "org" | "platform";

export interface RequestContext {
	userId?: string;
	organisationId?: string;
	viewingAsOrganisationId?: string;
	serviceSource?: string;
	agentId?: string;
	isAdmin?: boolean;
}
