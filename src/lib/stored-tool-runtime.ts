/**
 * @system tool-executor
 * @status handwritten
 * @edit edit directly
 *
 * stored-tool-runtime.ts — describe what this file does.
 */
/**
 * Runtime for generated AI tool manifests in mcp-ai-chat-system.
 *
 * Lookups for stored/builtin tools/schemas by ID/name (from scala-ai-tool-generator).
 */

export interface GeneratedToolManifestEntry {
	toolId: string | null;
	displayName: string;
	toolName: string;
	category: string;
	description: string;
	inputSchema: Record<string, unknown> | null;
	mcpInputSchema: Record<string, unknown> | null;
	source: "builtin" | "stored";
	executorKey: string | null;
	orpcProcedure: string | null;
	service: string | null;
	endpoint: string | null;
}

export interface StoredToolManifestLookupEntry {
	displayName: string;
	toolName: string;
	category: string;
	description: string;
	inputSchema: Record<string, unknown> | null;
	mcpInputSchema: Record<string, unknown> | null;
	executorKey: string | null;
	orpcProcedure: string | null;
	service: string | null;
	endpoint: string | null;
}

export interface StoredToolManifestSchemaEntry {
	description: string;
	inputSchema: Record<string, unknown> | null;
	mcpInputSchema: Record<string, unknown> | null;
}

export function createStoredToolManifestRuntime<
	TEntry extends StoredToolManifestLookupEntry,
>(options: {
	storedToolsById: Record<string, TEntry>;
	storedToolIdsByName: Record<string, string>;
}) {
	function getStoredToolById(toolId: string): TEntry | undefined {
		return options.storedToolsById[
			toolId as keyof typeof options.storedToolsById
		];
	}

	function requireStoredToolById(toolId: string, toolName?: string): TEntry {
		const entry = getStoredToolById(toolId);
		if (!entry) {
			throw new Error(
				`Missing generated tool manifest entry for stored tool ${toolId}${toolName ? ` (${toolName})` : ""}`,
			);
		}
		return entry;
	}

	function getStoredToolIdByName(toolName: string): string | undefined {
		return options.storedToolIdsByName[
			toolName as keyof typeof options.storedToolIdsByName
		];
	}

	return {
		getStoredToolById,
		requireStoredToolById,
		getStoredToolIdByName,
	};
}

export function createStoredToolSchemaRuntime<
	TEntry extends StoredToolManifestSchemaEntry,
>(options: { toolSchemasById: Record<string, TEntry> }) {
	function getToolSchemaById(toolId: string): TEntry | undefined {
		return options.toolSchemasById[
			toolId as keyof typeof options.toolSchemasById
		];
	}

	function requireToolSchemaById(toolId: string, toolName?: string): TEntry {
		const entry = getToolSchemaById(toolId);
		if (!entry) {
			throw new Error(
				`Missing generated tool schema entry for stored tool ${toolId}${toolName ? ` (${toolName})` : ""}`,
			);
		}
		return entry;
	}

	return {
		getToolSchemaById,
		requireToolSchemaById,
	};
}

export function createGeneratedStoredToolRuntime<
	TLookupEntry extends StoredToolManifestLookupEntry,
	TSchemaEntry extends StoredToolManifestSchemaEntry,
>(options: {
	storedToolsById: Record<string, TLookupEntry>;
	storedToolIdsByName: Record<string, string>;
	toolSchemasById: Record<string, TSchemaEntry>;
}) {
	const manifestRuntime = createStoredToolManifestRuntime({
		storedToolsById: options.storedToolsById,
		storedToolIdsByName: options.storedToolIdsByName,
	});
	const schemaRuntime = createStoredToolSchemaRuntime({
		toolSchemasById: options.toolSchemasById,
	});

	return {
		getStoredToolById: manifestRuntime.getStoredToolById,
		requireStoredToolById: manifestRuntime.requireStoredToolById,
		getStoredToolIdByName: manifestRuntime.getStoredToolIdByName,
		getToolSchemaById: schemaRuntime.getToolSchemaById,
		requireToolSchemaById: schemaRuntime.requireToolSchemaById,
	};
}
