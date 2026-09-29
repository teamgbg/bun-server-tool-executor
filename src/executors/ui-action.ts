/**
 * @system tool-executor
 * @status handwritten — none derivable: this file IS a verb of the executor
 *   catalog, and the catalog's registration surface is dispatch/dispatch.ts
 *   (no generator owns it, no supplier offers a UI-action payload
 *   projection); the row contract it reads (executor_config on a
 *   tool_definition row) is operator data no transform can emit.
 * @edit edit directly
 *
 * UI-action executor — a row-declared UI surface: resolve the target row
 * through the row's own ORPC procedure, authorize it against the agent that
 * called, and return a payload template interpolated from the resolved row.
 *
 * WHY A FAMILY, NOT A BLOB. The chat surfaces this replaces were hand-written
 * builders closing over lists handed in at build time. Only the row-resolve
 * surfaces ride this family — show_form, show_assessment, and anything that
 * resolves one row by id. The rest of internal-tool-builders.ts is NOT a
 * ui-action shape and must not be deleted by a reader of this comment:
 * read_page returns a DOM snapshot threaded from the request body (no row),
 * browser_action passes the AI's descriptor through unchanged (no row),
 * highlight targets by selector/text with a parent-chain walk (no id arg),
 * show_website echoes a page id with no resolvable page model on the host.
 * Verified 2026-09-29 against app-gpt-bun's schema: it has forms + assessments
 * + assessment_responses, NO documents model, NO page model — do not assume a
 * resolve procedure exists until you have read the host's generated router.
 * ExecutionContext is identity-only (scala-os contracts/mcp.ts), so no
 * executor can receive those lists — and that is the point: the build-time
 * hand-in is the thing being deleted. Scope is re-DERIVED here from
 * context.agentId against the agent row's own *_ids, exactly the resolution
 * agent-context.ts performs, so the row carries the fact and this file
 * carries none of it.
 *
 * PER-SLUG BEHAVIOUR IS ROW DATA. The action verb, the procedure, the id arg,
 * the id field and the payload template all live in executor_config. Adding a
 * seventh surface is a registry row, not a case label here: a switch on
 * action names would put a hand-maintained enumeration in code of exactly the
 * kind this executor deletes from the caller.
 *
 * FAILS CLOSED, NEVER DEGRADES. An id the agent does not hold, a missing
 * agentId, a missing config field: each answers "not found" (or a message
 * naming the row field) rather than resolving the row anyway. A UI action that
 * renders another agent's document is worse than one that does not render.
 */

import { getLogger } from "../configure.ts";
import type { ExecutionContext, OrpcExecutorConfig, ToolDefinition, UiActionExecutorConfig } from "../lib/types";
import { executeOrpcProcedure } from "./orpc.ts";

const logger = getLogger();

/** The agent lookup used when a row declares scope "agent" without naming one. */
const DEFAULT_AGENT_PROCEDURE = "ai_agents.findFirst";

/**
 * Interpolate `{resolve.<field>}` / `{organisationId}` / `{userId}` /
 * `{agentId}` into a declared payload. A placeholder with no value renders as
 * the empty string rather than leaking the literal token to a client, and a
 * non-string payload value passes through unchanged.
 */
function interpolate(
	value: unknown,
	resolved: Record<string, unknown>,
	context: ExecutionContext,
): unknown {
	if (typeof value === "string") {
		let out = value;
		for (const [field, cell] of Object.entries(resolved)) {
			out = out.replaceAll(`{resolve.${field}}`, cell == null ? "" : String(cell));
		}
		out = out
			.replaceAll("{organisationId}", context.organisationId ?? "")
			.replaceAll("{userId}", context.userId ?? "")
			.replaceAll("{agentId}", context.agentId ?? "");
		return out;
	}
	if (Array.isArray(value)) return value.map((entry) => interpolate(entry, resolved, context));
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			out[key] = interpolate(entry, resolved, context);
		}
		return out;
	}
	return value;
}

/**
 * The ids the calling agent is allowed to reach, read from its own row.
 * A null return means MEMBERSHIP COULD NOT BE ESTABLISHED, and the caller
 * treats that exactly like an id the agent does not hold.
 */
async function agentAllowedIds(
	tool: ToolDefinition,
	config: UiActionExecutorConfig,
	context: ExecutionContext,
): Promise<string[] | null> {
	if (!context.agentId) return null;
	const procedure = config.resolve.agentProcedure ?? DEFAULT_AGENT_PROCEDURE;
	const idsField = config.resolve.agentIdsField;
	if (!idsField) {
		throw new Error(
			`Tool ${tool.name}: ui-action resolve with scope "agent" must declare agentIdsField — the agent row's field holding the allowed ids. Without it membership cannot be proven, and an unprovable scope is not a permissive one.`,
		);
	}
	const agentRow = (await executeOrpcProcedure(
		procedure,
		{ id: context.agentId },
		context,
		config as unknown as OrpcExecutorConfig,
	)) as Record<string, unknown> | null;
	const raw = agentRow?.[idsField];
	if (!Array.isArray(raw)) return null;
	return raw.map((entry) => String(entry));
}

export async function executeUiActionTool(
	tool: ToolDefinition,
	args: Record<string, unknown>,
	context: ExecutionContext,
): Promise<unknown> {
	const config = tool.executor_config as UiActionExecutorConfig | null | undefined;

	if (!config || typeof config !== "object") {
		throw new Error(
			`Tool ${tool.name} declares executor_key "ui-action" but carries no executor_config — the action, the resolve and the payload are the row's declaration, never a code default.`,
		);
	}
	if (!config.action) {
		throw new Error(
			`Tool ${tool.name}: ui-action executor_config must declare "action" — the UI verb the client renders.`,
		);
	}
	const { procedure, idArg, idField } = config.resolve ?? {};
	if (!procedure || !idArg || !idField) {
		throw new Error(
			`Tool ${tool.name}: ui-action resolve must declare procedure, idArg and idField ("model.method", the arg carrying the id, the row field it matches).`,
		);
	}

	const targetId = args[idArg];
	if (typeof targetId !== "string" || targetId.length === 0) {
		throw new Error(`Tool ${tool.name}: missing required arg "${idArg}".`);
	}

	const notFound = { success: false, error: `${config.action}: not found` };

	// AGENT SCOPE, BEFORE the entity read: a caller must not learn whether a
	// row exists by asking for one its agent does not hold.
	let allowedIds: string[] | null = null;
	if (config.resolve.scope === "agent") {
		allowedIds = await agentAllowedIds(tool, config, context);
		if (!allowedIds || !allowedIds.includes(targetId)) {
			logger.info("[ui-action] refused: the calling agent does not hold the target", {
				tool: tool.name,
				agentId: context.agentId ?? null,
				idArg,
			});
			return notFound;
		}
	}

	const result = await executeOrpcProcedure(
		procedure,
		{ [idField]: targetId },
		context,
		config as unknown as OrpcExecutorConfig,
	);
	const rows = (Array.isArray(result) ? result : result ? [result] : []) as Record<
		string,
		unknown
	>[];
	const resolved = rows.find((row) => row?.[idField] === targetId);
	if (!resolved) return notFound;
	if (config.resolve.scope === "org" && !context.organisationId) {
		logger.info("[ui-action] refused: org scope with no organisation in the context", {
			tool: tool.name,
		});
		return notFound;
	}

	return interpolate(config.payload, resolved, context);
}
