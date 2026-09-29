/**
 * @system tool-executor
 * @status handwritten — none derivable: the projection is a serve-time concern
 *   of the ui-action row contract (executor_config.describe), and no generator
 *   emits a row description; the vocabulary it reads is declared in lib/types.
 * @edit edit directly
 *
 * Render a ui-action row's description for a tool list, appending the ids the
 * calling agent can actually reach.
 *
 * SERVE-TIME, NOT CALL-TIME. A description is served before any tool runs, so
 * this is deliberately a separate file from executors/ui-action.ts: rendering a
 * description at call time would be state computed by whichever call ran last.
 * The CALLER is the loader that assembles a turn's tool list (in
 * bun-adapters-chat-completion, agent-tool-selection), which already resolved
 * each agent's rows with a Prisma findMany over the agent row's *_ids for its
 * own scope decision and hands those rows in here. Re-querying would be a
 * second fetch of rows the caller holds, and the executor is host-bound so it
 * could not resolve a non-host surface anyway.
 *
 * DISCOVERY, NOT AUTHORIZATION. A row this list omits is simply not listed;
 * scope is re-derived at call time regardless of what any description showed.
 */

import type { UiActionDescribeConfig } from "../lib/types";

export function renderUiActionDescription(
	baseDescription: string,
	describe: UiActionDescribeConfig | undefined,
	rows: Array<Record<string, unknown>>,
): string {
	if (!describe) return baseDescription;
	if (rows.length === 0) return baseDescription;
	const list = rows
		.map((row) => `- "${String(row[describe.labelField] ?? "")}" (id: ${String(row.id)})`)
		.join("\n");
	return `${baseDescription} ${describe.heading}\n${list}`;
}
