/**
 * @system tool-executor
 * @status handwritten
 * @edit edit directly
 *
 * The coding layer executed in-process: the pure decisions (containment,
 * slicing, exact edit) and one round trip on a real temporary workspace —
 * write, read, edit, list, search — each result read back from disk, never
 * inferred from a return value.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyExactEdit, containedAbs, executeCodingLocally, isCodingCommand, sliceLines } from "./coding-local.ts";

describe("containment is lexical", () => {
	test("a relative path stays inside the root", () => {
		expect(containedAbs("/ws", "repo/src/a.ts")).toBe("/ws/repo/src/a.ts");
	});
	test("dot-dot that escapes is refused, whether or not it exists", () => {
		expect(containedAbs("/ws", "../etc/passwd")).toBeNull();
		expect(containedAbs("/ws", "repo/../../etc/passwd")).toBeNull();
	});
	test("dot-dot that stays inside resolves", () => {
		expect(containedAbs("/ws", "repo/src/../lib/b.ts")).toBe("/ws/repo/lib/b.ts");
	});
	test("an absolute path outside the root is refused", () => {
		expect(containedAbs("/ws", "/etc/passwd")).toBeNull();
	});
	test("the root itself is contained", () => {
		expect(containedAbs("/ws/", "/ws")).toBe("/ws");
	});
});

describe("read slicing", () => {
	test("offset is 1-based and limit bounds the slice", () => {
		const { text, total, truncated } = sliceLines("a\nb\nc\nd\n", 2, 2);
		expect(text).toBe("b\nc");
		expect(total).toBe(4);
		expect(truncated).toBe(true);
	});
	test("an offset past the end yields nothing and is not truncated", () => {
		expect(sliceLines("a\nb", 9, 5)).toEqual({ text: "", total: 2, truncated: false });
	});
});

describe("exact edit", () => {
	test("a unique match is replaced once", () => {
		expect(applyExactEdit("x = 1; y = 2;", "y = 2", "y = 3")).toEqual({ ok: true, updated: "x = 1; y = 3;" });
	});
	test("no match and multiple matches both refuse, naming the count", () => {
		expect(applyExactEdit("a", "z", "q")).toEqual({ ok: false, error: "edit refused: 'old_string' does not occur in the file" });
		const twice = applyExactEdit("a a", "a", "b");
		expect(twice.ok).toBe(false);
		if (!twice.ok) expect(twice.error).toContain("occurs 2 times");
	});
	test("an empty old_string refuses", () => {
		expect(applyExactEdit("a", "", "b").ok).toBe(false);
	});
});

describe("the coding commands are the three bus names", () => {
	test("workspace_file, codemod and scala_tools_exec execute here; spawn_agent_tab does not", () => {
		expect(isCodingCommand("workspace_file")).toBe(true);
		expect(isCodingCommand("codemod")).toBe(true);
		expect(isCodingCommand("scala_tools_exec")).toBe(true);
		expect(isCodingCommand("spawn_agent_tab")).toBe(false);
	});
});

describe("a round trip on a real workspace", () => {
	let root = "";
	let previous: string | undefined;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "coding-local-"));
		previous = process.env.SCALA_WORKSPACE_ROOT;
		process.env.SCALA_WORKSPACE_ROOT = root;
	});
	afterEach(() => {
		if (previous === undefined) delete process.env.SCALA_WORKSPACE_ROOT;
		else process.env.SCALA_WORKSPACE_ROOT = previous;
		rmSync(root, { recursive: true, force: true });
	});

	test("write, read, edit, list and search agree with the disk", () => {
		const written = executeCodingLocally("workspace_file", { op: "write", path: "repo/src/a.ts", content: "const a = 1;\nconst b = 2;\n" });
		expect(written.ok).toBe(true);
		expect(readFileSync(join(root, "repo/src/a.ts"), "utf8")).toBe("const a = 1;\nconst b = 2;\n");

		const read = executeCodingLocally("workspace_file", { op: "read", path: "repo/src/a.ts", offset: 2, limit: 1 });
		expect(read).toEqual({ ok: true, result: { path: "repo/src/a.ts", content: "const b = 2;", lineCount: 2, offset: 2, truncated: false } });

		const edited = executeCodingLocally("workspace_file", { op: "edit", path: "repo/src/a.ts", old_string: "const b = 2;", new_string: "const b = 3;" });
		expect(edited.ok).toBe(true);
		expect(readFileSync(join(root, "repo/src/a.ts"), "utf8")).toBe("const a = 1;\nconst b = 3;\n");

		const listed = executeCodingLocally("workspace_file", { op: "list", glob: "*.ts" });
		expect(listed).toEqual({ ok: true, result: { fileCount: 1, truncated: false, files: ["repo/src/a.ts"] } });

		const found = executeCodingLocally("codemod", { op: "pattern_search", pattern: "const b", scope: ["repo"] });
		expect(found.ok).toBe(true);
		if (found.ok) expect((found.result as { matches: Array<{ file: string; line: number; text: string }> }).matches).toEqual([{ file: "repo/src/a.ts", line: 2, text: "const b = 3;" }]);

		const replaced = executeCodingLocally("codemod", { op: "pattern_replace", scope: ["repo"], pattern: "const (\\w) =", replacement: "let $1 =" });
		expect(replaced).toEqual({ ok: true, result: { op: "pattern_replace", dryRun: false, filesChanged: 1, files: [{ file: "repo/src/a.ts" }] } });
		expect(readFileSync(join(root, "repo/src/a.ts"), "utf8")).toBe("let a = 1;\nlet b = 3;\n");
	});

	test("a path outside the workspace is refused and nothing is written", () => {
		const out = executeCodingLocally("workspace_file", { op: "write", path: "../escape.txt", content: "x" });
		expect(out).toEqual({ ok: false, error: "write refused: '../escape.txt' resolves outside the workspace root" });
	});

	test("an unowned workspace refuses rather than routing elsewhere", () => {
		process.env.SCALA_WORKSPACE_ROOT = "/proc/1/root-not-writable";
		const out = executeCodingLocally("workspace_file", { op: "read", path: "x" });
		expect(out.ok).toBe(false);
		if (!out.ok) expect(out.error).toContain("cannot write");
	});
});
