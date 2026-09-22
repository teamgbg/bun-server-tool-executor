/**
 * @system tool-executor
 * @status handwritten
 * @edit edit directly
 *
 * system-caller.ts — the single predicate identifying the platform SYSTEM
 * caller: an internal platform action (e.g. the whatsapp-liveness monitor)
 * that authenticates via the loopback bearer and presents the "system"
 * sentinel user id. There are TWO org-scope layers in ORPC tool dispatch —
 * validateAuth (lib/auth.ts, gates org/user presence) and injectScopeFilter
 * (lib/scope.ts, stamps organisation_id onto the WHERE during arg prep) —
 * plus the generated router's protectedProcedure (via resolveCallerUser →
 * isSuperAdmin). ALL must bypass org-scoping for the system caller, or they
 * drift: one bypasses while the other still scopes (the 2026-06-16 half-fix).
 * Centralising the detection here makes that drift impossible.
 *
 * MISSING IDENTITY IS NOT THE SYSTEM CALLER. A caller with no user id is
 * anonymous and must fail CLOSED — it is never granted the system caller's
 * cross-org access. Previously `!userId` was treated as the system caller, so
 * an anonymous caller (the gateway-forwarded fleet path carries no X-User-Id)
 * silently received full cross-org access — the multi-tenant fail-open this
 * predicate closes. Only the EXPLICIT "system" sentinel is the system caller;
 * a real per-org agent passes its own user id (never "system") and stays
 * org-scoped, preserving multi-tenant isolation for product surfaces.
 */

/** The sentinel user id presented by internal platform system actions. */
export const SYSTEM_USER_ID = "system";

/**
 * True ONLY for the explicit "system" sentinel user id — an internal platform
 * action authenticated via the loopback bearer. A missing/undefined user id is
 * NOT the system caller (anonymous → must fail closed). A real per-org user id
 * (never "system") stays org-scoped.
 */
export function isSystemCaller(userId: string | undefined): boolean {
	return userId === SYSTEM_USER_ID;
}
