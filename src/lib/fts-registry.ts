/**
 * @system tool-executor
 * @status handwritten
 * @edit edit directly
 *
 * Postgres full-text-search registry: discovers which tables are searchable
 * (a `search_content_tsv` tsvector column with a GIN index, maintained by
 * triggers / generated columns) by querying information_schema, with a
 * 10-minute in-memory cache to avoid repeated DB hits during tool execution.
 * Tracks per-table whether an `organisation_id` column exists so the search
 * lane can apply tenant scoping only where the column is real.
 */

import { getLogger } from "../configure.ts";
import { loadToolExecutorCacheControls } from "./cache-controls.ts";
import { queryRows } from "@teamscala/db/query-rows";

const logger = getLogger();

export interface SearchableModel {
	hasOrgColumn: boolean;
}

let searchableModels: Map<string, SearchableModel> | null = null;
let nextRefreshAt = 0;

/**
 * Get the map of full-text-searchable table names (tables with a
 * search_content_tsv column). Lazy-loads on first call, refreshes every
 * 10 minutes. Fails open to the previous cache (or empty) — search then
 * degrades to direct/ILIKE matching, never blocks tool execution.
 */
export async function getSearchableModels(): Promise<
	Map<string, SearchableModel>
> {
	const now = Date.now();
	if (searchableModels && now < nextRefreshAt) {
		return searchableModels;
	}

	try {
		const { ftsRefreshIntervalMs } = await loadToolExecutorCacheControls();
		// Schema-introspection query: routes through the one-db-surface raw
		// primitive (consumption-has-an-owner: schema catalog queries are
		// out of CRUD scope, and the one-db-surface is the single sanctioned
		// raw shape per the platform).
		const results = await queryRows<{ table_name: string; has_org: boolean }>`
      SELECT c.table_name,
             EXISTS (
               SELECT 1 FROM information_schema.columns o
               WHERE o.table_schema = 'public'
                 AND o.table_name = c.table_name
                 AND o.column_name = 'organisation_id'
             ) AS has_org
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name = 'search_content_tsv'
    `;
		searchableModels = new Map(
			results.map((r) => [r.table_name, { hasOrgColumn: r.has_org }]),
		);
		nextRefreshAt = now + ftsRefreshIntervalMs;
		logger.info(
			`[FTS Registry] ${searchableModels.size} full-text-searchable tables: ${[...searchableModels.keys()].join(", ")}`,
		);
		return searchableModels;
	} catch (err) {
		logger.warn(`[FTS Registry] Failed to load searchable tables: ${err}`);
		// Return existing cache or empty map — never block tool execution
		return searchableModels || new Map();
	}
}

/**
 * Full-text-search metadata for a model, or null when the table has no
 * search_content_tsv column (caller falls back to direct/ILIKE matching).
 */
export async function getFullTextSearchInfo(
	modelName: string,
): Promise<SearchableModel | null> {
	const models = await getSearchableModels();
	return models.get(modelName) ?? null;
}

/**
 * Force refresh the cache (e.g. after adding a search_content_tsv column).
 */
export function invalidateFtsRegistry(): void {
	searchableModels = null;
	nextRefreshAt = 0;
	logger.info("[FTS Registry] Cache invalidated");
}
