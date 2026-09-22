/**
 * @system codegen
 * @status generated
 * @edit change the module's exports, then re-run codegen. Hand-edits are overwritten.
 *
 * The configured-primitive contract for this package, derived from the module's
 * OWN exported surface rather than from a registry row — the row does not
 * describe the code, and routing this through one would make a local testing
 * concern depend on a deployed service.
 */

import { expect, test } from "bun:test";
import { configure, getDecryptSecretConfig, getLogger, getScalaDevKey } from "../configure.ts";

// DECLARED FIRST ON PURPOSE: configure() state is module-level and never
// unsets, so the before-injection behaviour can only be observed before any
// case below has injected anything.
test("an accessor reports absence before configure()", () => {
	// Either shape is a correct answer to "nothing was injected": a loud throw
	// or an explicit undefined. What is NOT acceptable is a plausible value,
	// which is what a silently-defaulting accessor would return.
	let reported: unknown;
	try {
		reported = getScalaDevKey();
	} catch {
		reported = undefined;
	}
	expect(reported).toBeUndefined();
});

test("getDecryptSecretConfig reads back what configure() injected", () => {
	// The probe value is a sentinel whose only job is to be distinguishable, so
	// its TYPE is erased on both sides — `as never` going in (as it always was)
	// and on the assertion coming back. Without the second cast the emitted test
	// cannot typecheck: `toBe` is typed against the accessor's declared return,
	// so a sentinel of any other shape is rejected. This failed in every package
	// carrying the generated file.
	const injected = { probe: "decryptSecretConfig" };
	configure({ decryptSecretConfig: injected } as never);
	expect(getDecryptSecretConfig()).toBe(injected as never);
});

test("a second configure() replaces what getDecryptSecretConfig returns", () => {
	// A boot re-run must REPLACE rather than accumulate, or a stale value
	// survives behind the current one and the accessor reports the wrong
	// injection with nothing failing.
	const first = { probe: "decryptSecretConfig_first" };
	const second = { probe: "decryptSecretConfig_second" };
	configure({ decryptSecretConfig: first } as never);
	configure({ decryptSecretConfig: second } as never);
	expect(getDecryptSecretConfig()).toBe(second as never);
	expect(getDecryptSecretConfig()).not.toBe(first as never);
});

test("getLogger() keeps one object identity across configure() calls", () => {
	const captured = getLogger();
	configure({ logger: captured } as never);
	expect(getLogger()).toBe(captured);
});

test("a reference captured BEFORE configure() observes the injected logger", () => {
	// The half identity alone cannot prove: the stable object must DELEGATE to
	// whatever was injected, or a pre-configure capture keeps talking to the
	// no-op forever with nothing failing.
	const captured = getLogger() as unknown as Record<string, (...args: never[]) => unknown>;
	const seen: string[] = [];
	configure({
		logger: {
			ctx: ((...args: never[]) => {
				seen.push("ctx");
				return undefined;
			}) as never,
		debug: (() => undefined) as never,
		error: (() => undefined) as never,
		info: (() => undefined) as never,
		msg: (() => undefined) as never,
		warn: (() => undefined) as never,
		},
	} as never);
	captured["ctx"]?.();
	expect(seen).toContain("ctx");
});

test("getScalaDevKey reads back what configure() injected", () => {
	// The probe value is a sentinel whose only job is to be distinguishable, so
	// its TYPE is erased on both sides — `as never` going in (as it always was)
	// and on the assertion coming back. Without the second cast the emitted test
	// cannot typecheck: `toBe` is typed against the accessor's declared return,
	// so a sentinel of any other shape is rejected. This failed in every package
	// carrying the generated file.
	const injected = { probe: "scalaDevKey" };
	configure({ scalaDevKey: injected } as never);
	expect(getScalaDevKey()).toBe(injected as never);
});

test("a second configure() replaces what getScalaDevKey returns", () => {
	// A boot re-run must REPLACE rather than accumulate, or a stale value
	// survives behind the current one and the accessor reports the wrong
	// injection with nothing failing.
	const first = { probe: "scalaDevKey_first" };
	const second = { probe: "scalaDevKey_second" };
	configure({ scalaDevKey: first } as never);
	configure({ scalaDevKey: second } as never);
	expect(getScalaDevKey()).toBe(second as never);
	expect(getScalaDevKey()).not.toBe(first as never);
});
