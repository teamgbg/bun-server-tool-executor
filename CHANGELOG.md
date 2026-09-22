# @teamgbg/tool-executor

## 4.1.72

### Patch Changes

- 3c7bf26: feat(logger): downgrade expected protocol-probe 4xx to INFO

## 4.1.71

### Patch Changes

- 822c964: feat(worker-pool): stack-free saturation errors + window-aggregated logging + respondAllowOnPoolError wrapper

## 4.1.70

### Patch Changes

- 8382d22: feat(executor-dispatch): in-process worker-thread dispatcher backed by @teamgbg/worker-pool

## 4.1.69

### Patch Changes

- 9ba3e3f: feat(@teamgbg/worker-pool): unified multi-CPU dispatch primitive

## 4.1.61

### Patch Changes

- 4b732bf: fix: add untracked sse-client package + bootstrap CHANGELOG

## 4.1.45

### Patch Changes

- d1844ad: chore: version bump

## 4.1.44

### Patch Changes

- f5d3dfe: feat(master-switch): add write-master-switch-cache export

## 4.1.43

### Patch Changes

- 46e3551: chore: version bump

## 4.1.40

### Patch Changes

- 49947dd: fix(tool-generator): classify fleet_* tables as public scope

## 4.1.22

### Patch Changes

- 18c13da: refactor(orpc,tool-executor): route secrets through configure() — no process.env

## 4.1.10

### Patch Changes

- aa91291: refactor(tool-executor): remove ExecutorConfig union and legacy loose type

## 4.1.9

### Patch Changes

- 523d26a: chore: version bump

## 4.1.8

### Patch Changes

- 03248a8: chore: version bump

## 4.1.7

### Patch Changes

- 78f9919: tool-executor: auto-passthrough args for non-CRUD ORPC procedures

## 4.1.6

### Patch Changes

- f75188a: chore: version bump

## 4.1.5

### Patch Changes

- 4881a78: chore: version bump

## 4.1.4

### Patch Changes

- 6bb5e0e: chore: version bump

## 4.1.3

### Patch Changes

- a8186dd: chore: version bump

## 4.1.1

### Patch Changes

- 4348df2: refactor(tool-executor): remove internal executor and handler registry

## 4.1.0

### Minor Changes

- 6b7ed53: Add `passthrough_args: true` flag on `mcp_tool` row `executor_config` to skip CRUD-shaped arg reshaping. The default orpc-executor path is built for Prisma findMany/update args (it constructs `where`, strips unknown keys, adds scope filters); applying it to fn-namespace procedures like `guards.list({filter})` or `guards.resume({slug})` silently strips the arbitrary input args. When the row sets `passthrough_args=true`, prepareArgs returns cleanArgs unchanged and buildFinalArgsByMethod returns them as-is — the orpc procedure handler receives whatever the MCP caller sent.

## 4.0.17

### Patch Changes

- 27a257f: chore(deps): drop @teamgbg/orpc from dependencies after configure() injection

  Source no longer imports @teamgbg/orpc; deps regenerate without it. Closes the tool-executor → orpc no-horizontal-deps violation.

## 4.0.16

### Patch Changes

- fix(tool-executor): inject getServerClient instead of importing @teamgbg/orpc directly

  tool-executor (tier 1 primitive) was importing `getServerClient` from
  `@teamgbg/orpc/server-client-registry` — a horizontal sibling import per
  `vertical-dependency-only`. Per `configured-primitives`, foundational
  utilities accept upstream deps via `configure()`.

  Adds InjectedServerClientProvider to tool-executor/configure with a
  no-op default that throws if invoked before injection. mcp-tool-runtime
  (tier 2, allowed to bridge orpc + tool-executor) injects orpc's
  getServerClient at boot via a lazy `require` so the resolver edge stays
  cold until first tool dispatch.

  Closes the tool-executor → orpc horizontal dep.

## 4.0.15

### Patch Changes

- Add `subprocess` executor backend to the shared @teamgbg/tool-executor dispatcher. First of the three new declarative backends needed to retire the `internal` executor (along with planned `puck-patch` and `file-system`). Covers any mcp_tool whose op is "run a shell command and parse the output" — guard_run, codemod, and future tools-that-shell-out.

  Row contract:

  - `executor_key: "subprocess"`
  - `executor_config.subprocess = { argv: string[], cwd?, timeout_ms?, env?, parse? = "raw"|"json"|"lines", args_to_argv? = "append"|"flag-pairs" }`

  `@teamgbg/db` mcp-tool schema's `executor_key` picklist extended with `"subprocess"` so registry rows pointing at this backend pass validation. Backwards compatible (existing four values still allowed).

## 4.0.5

### Patch Changes

- b6ec035: resolveProcedureFromAction now prepends the tool's model name when the procedureMap value lacks a dot. The generated ai_tools rows store procedureMap as `{findFirst: "findFirst", ...}` (bare method names) but executeOrpcProcedure requires `model.method`. Use `config.model` (or `args.model` if explicit) to construct the full procedure when missing. Same defensive shape as the scopeType fallback — works with the existing rows, emits no warning since the bare-method form is the generator's current output not a regression.

## 4.0.4

### Patch Changes

- a4742c1: Dispatch infers scopeType from input_schema when executor_config.scopeType is missing, instead of throwing. Falls back to the same heuristic the tool-generator uses (organisation_id field → org, user_id → user, neither → public). Unblocks the 195 currently-stored ORPC ai_tools rows that pre-date the scopeType-emitting generator. Emits a warning when the fallback triggers so the row can be regenerated to remove the fallback.

## 4.0.0

### Patch Changes

- Updated dependencies [5a4e469]
  - @teamgbg/db@1.3.0

## 3.0.3

### Patch Changes

- 8d7ff6b: Move both from utilities → primitives tier (git mv only — package source unchanged). Both packages had only primitive-tier @teamgbg deps (db, logger, orpc, http, os) — they were misplaced in utilities. Demotion to primitives makes mcp-tool-runtime → these become utilities → primitives = downward = legal. Removes 2 horizontal-deps violations.

## 3.0.0

### Patch Changes

- Updated dependencies [3734132]
  - @teamgbg/orpc@2.3.0
  - @teamgbg/os@1.1.1

## 2.0.0

### Patch Changes

- Updated dependencies [d992587]
  - @teamgbg/db@1.2.0
  - @teamgbg/orpc@2.2.0

## 1.0.86

### Patch Changes

- Migrate server packages to proper tiers, split state-machine, rewrite fixa DB fixers for Prisma
- Updated dependencies
  - @teamgbg/orpc@2.1.89
  - @teamgbg/db@1.1.106

## 1.0.74

### Patch Changes

- Updated dependencies [67873b0]
  - @teamgbg/logger@1.1.54
  - @teamgbg/orpc@2.1.74

## 1.0.73

### Patch Changes

- Updated dependencies [2fab6a2]
  - @teamgbg/db@1.1.81
  - @teamgbg/orpc@2.1.73

## 1.0.72

### Patch Changes

- Updated dependencies [807b08a]
  - @teamgbg/db@1.1.80
  - @teamgbg/orpc@2.1.72
