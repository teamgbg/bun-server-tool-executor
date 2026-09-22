/**
 * @system tool-executor
 * @status handwritten
 * @edit edit directly
 *
 * The canonical generated-tool contract: the base shape every generated
 * tool shares across producer packages (sdk/openapi/orpc generators) and
 * the consumer that serves them. Single-homed here after five hand-copies
 * drifted across three packages (casing and requiredness diverged, and the
 * curation step grew scar tissue to absorb both input casings).
 */
export interface GeneratedToolBase {
	name: string;
	description: string;
	executor_config: Record<string, unknown>;
	executor_key: string;
	service: string;
}
