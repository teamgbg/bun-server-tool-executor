/**
 * @system tool-executor
 * @status handwritten
 * @edit edit directly
 *
 * Target enumeration for the many-row mutations (updateMany/deleteMany) —
 * the readback half of `a-mutating-verb-reads-back-what-it-claims`. A bulk
 * verb that reports only `{count: N}` reports a QUANTITY, not its targets:
 * the 2026-08-16 incident was discovered two hours late because the only
 * trace of the 6,890-row rewrite was a success result with a number in it.
 * The executor enumerates the matched key fields BEFORE the statement runs
 * (deleteMany must capture them while the rows still exist) and merges the
 * enumerated identities into the result, capped for the response budget —
 * a count plus the first N identities, never a bare count.
 */

import type { PrismaClient } from "@teamscala/db/client";
import type { DynamicPrismaClient } from "#tool-executor/lib/types.ts";

/** Matches the MAX_TAKE response cap on the read path (orpc-args). */
const ENUMERATION_CAP = 200;

export interface BulkTargetEnumeration {
	/** Enumerated target identities (key-field values), capped at 200 rows. */
	affected: Array<Record<string, unknown>>;
	/** True when more rows matched than are enumerated — read `count` for the total. */
	affected_truncated: boolean;
}

export async function enumerateBulkTargets(
	prisma: PrismaClient,
	modelName: string,
	where: Record<string, unknown>,
	keyFields: string[],
): Promise<BulkTargetEnumeration> {
	const model = (prisma as unknown as DynamicPrismaClient)[modelName];
	if (!model?.findMany) {
		// No delegate (or DMMF-unknown model) — the mutation itself will fail
		// loud at the router boundary; an enumeration crash must not pre-empt
		// it with a different, less actionable error.
		return { affected: [], affected_truncated: false };
	}
	const select = Object.fromEntries(keyFields.map((field) => [field, true]));
	const rows = (await model.findMany({
		where,
		select,
		take: ENUMERATION_CAP + 1,
	})) as Array<Record<string, unknown>>;
	return {
		affected: rows.slice(0, ENUMERATION_CAP),
		affected_truncated: rows.length > ENUMERATION_CAP,
	};
}
