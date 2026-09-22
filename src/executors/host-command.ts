/**
 * @system tool-executor
 * @status handwritten
 * @edit edit directly
 *
 * host_command executor — the NATIVE dispatch path. A tool whose executor_key
 * is 'host_command' executes where the code is: the coding commands
 * (workspace_file, codemod, scala_tools_exec) run in-process against the
 * workspace this engine holds (coding-local.ts), per
 * coding-layer-runs-in-the-engine-not-through-mcp.
 *
 * The @teamscala/host-command-bus row-queue path is RETIRED (the Rust bus
 * consumer is deleted; the queue has no claimant, so a written row hangs to
 * timeout with no handler — the exact "offered beyond the capability" failure
 * offered-is-derived prohibits). Any non-coding command is REFUSED as data —
 * { ok: false, error } naming the retirement and the native verbs — never
 * enqueued, never thrown: a refusal is an outcome the caller reads, and
 * throwing would dress a retired capability as a dispatch error.
 *
 * executor_config: { command: string, default_args?: Record<string, unknown> }
 *   - command: the native command name (e.g. "workspace_file"). Required;
 *     errors loudly if absent.
 *   - default_args: merged under the caller's args (caller wins), so `search`
 *     still arrives as pattern_search without the caller knowing the
 *     handler's required fields.
 */

import {
	getLogger,
} from "../configure.ts";
import type { ExecutionContext, ToolDefinition } from "../lib/types";
import { executeCodingLocally, isCodingCommand } from "./coding-local.ts";

const logger = getLogger();

/** The refusal every non-coding command receives: the bus is retired. */
export function busRetiredRefusal(command: string): { ok: false; error: string } {
	return {
		ok: false,
		error:
			`host_command "${command}" cannot run: the host command bus is retired ` +
			"(the Rust consumer is deleted; there is no queue claimant). Execute " +
			"through the native verbs instead — the coding commands " +
			"(workspace_file, codemod, scala_tools_exec) run in-process here, and " +
			"host operations route through scala-tools verbs (scala_tools_exec), " +
			"never a host_commands row.",
	};
}

/**
 * Execute a host_command tool natively: coding commands in-process, anything
 * else refused with the retirement named.
 *
 * The dispatch contract is `(tool, args, context)`. The optional `injectedExec`
 * is a dependency-injection seam for the co-located test (which stubs the local
 * execution so no real filesystem work happens) — production dispatch never
 * passes it.
 */
export async function executeHostCommand(
	tool: ToolDefinition,
	args: Record<string, unknown>,
	_context: ExecutionContext,
	injectedExec?: (command: string, merged: Record<string, unknown>) => Promise<unknown>,
): Promise<unknown> {
	const config = (tool.executor_config ?? {}) as {
		command?: string;
		default_args?: Record<string, unknown>;
	};
	const command = config.command;
	if (!command || typeof command !== "string") {
		throw new Error(
			`host_command tool "${tool.name}" is missing executor_config.command ` +
				`(the native command name, e.g. "workspace_file"). Add it to the mcp_tool row.`,
		);
	}

	// Merge executor_config.default_args into the caller's args, with caller
	// args winning over defaults. This is how `search` (which routes through
	// the `codemod` handler) supplies `{ op: "pattern_search" }` without the
	// caller needing to know the handler's required fields. Without this
	// merge, a schema-valid search call (pattern + scope + maxResults) reaches
	// the codemod handler with no `op` and fails — the misrouting defect that
	// made search unusable.
	const mergedArgs = { ...(config.default_args ?? {}), ...args };

	// THE CODING LAYER EXECUTES HERE, IN THE ENGINE, WHERE THE CODE IS
	// (operator ruling 2026-09-17; coding-layer-runs-in-the-engine-not-through-
	// mcp). workspace_file, codemod and scala_tools_exec never leave this
	// process: the engine of the lane that holds the repositories runs them
	// in-process and any other process is refused with the lane named.
	if (isCodingCommand(command)) {
		logger.info(`[host-command] executing coding command in-process: ${command}`, { tool: tool.name });
		if (injectedExec) return injectedExec(command, mergedArgs);
		return executeCodingLocally(command, mergedArgs);
	}

	// The bus is retired — writes go through the native verbs, not the queue.
	// Returned AS DATA ({ ok:false, error }), never thrown: a refusal is an
	// outcome the caller reads.
	logger.info(`[host-command] refusing retired bus command: ${command}`, { tool: tool.name });
	return busRetiredRefusal(command);
}
