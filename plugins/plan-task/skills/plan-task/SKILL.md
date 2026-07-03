---
name: plan-task
description: >
  Generate design doc and acceptance doc for user review; then break down into specs after approval.
  Supports progress tracking, cross-task dashboard, resume from breakpoint, and mark spec done.
  Trigger: plan-task, 任务规划, 进度, progress, 继续, resume, 完成
user_invocable: true
---

Take a development task description and produce planning documents, then track implementation progress across specs and tasks.

## Input

The user provides input after invoking `/plan-task`. Determine the intent:

- **Progress query** — input matches: "进度", "progress", "总览", "status", "dashboard", or asks about task status
  → go to **Phase A: Progress Query**
- **Mark progress** — input matches: "完成 spec-XX", "done spec-XX", "开始 spec-XX", "start spec-XX", or explicitly asks to update a spec's status
  → go to **Phase B: Update Progress**
- **Resume** — input matches: "继续", "resume", "接着做", or references an existing task by name/slug
  → go to **Phase C: Resume Task**
- **New task** — input is a task description
  → go to **Phase 1: Design & Acceptance**
- **No input** — ask the user to describe the task or check progress

---

## Phase A: Progress Query (short path)

Use this path when the user wants to check progress, not create a new task.

### A.1 Gather progress data

1. Try to read `plan/OVERVIEW.md`
2. If it does not exist, scan for `plan/*/progress.md` files using:
   ```bash
   find plan -name "progress.md" -maxdepth 2 2>/dev/null
   ```
3. If no progress files exist at all, report: "No tracked tasks found. Use `/plan-task <task description>` to create one."

### A.2 Show overview

Display the overview table from `plan/OVERVIEW.md` (or reconstruct it from individual progress files).

### A.3 Drill into a specific task

Use AskUserQuestion to ask if the user wants to see details for a specific task. If yes:

1. Read the corresponding `plan/<task-slug>/progress.md`
2. Show the per-spec status table
3. If any spec is marked `in_progress`, show which one is active

**End here — do not enter Phase 1.**

---

## Phase B: Update Progress (short path)

Use this path when the user wants to mark a spec as started or completed.

### B.1 Identify the target

1. Parse the user's input to extract: task slug (if given) and spec identifier (e.g. "spec-02")
2. If only one task exists in `plan/`, use it. If multiple exist and the user didn't specify, use AskUserQuestion to disambiguate.
3. Read `plan/<task-slug>/progress.md` to verify the spec exists and its current status.

### B.2 Validate the transition

- `pending → in_progress`: allowed
- `in_progress → completed`: allowed
- `pending → completed`: allowed (skip in_progress for small specs)
- `completed → *`: reject, tell user the spec is already done
- Attempting to start a spec whose dependencies (from spec doc) are not yet `completed`: warn the user, proceed only if they confirm

### B.3 Apply the update

Follow Phase 3 rules:
1. Update `plan/<task-slug>/progress.md` — change status column and date
2. Update the summary line (`进度: M/N completed`)
3. Update `plan/OVERVIEW.md` — update the completed count, progress bar, and date
4. If all specs are now `completed`, set task status to `completed` in progress.md header

### B.4 Confirm

Display the updated progress table to the user.

**End here.**

---

## Phase C: Resume Task (short path)

Use this path when the user wants to continue working on an existing task from a previous session.

### C.1 Locate the task

1. If the user specified a task name/slug, look for `plan/<slug>/`
2. Otherwise, scan `plan/*/progress.md` for tasks with status `in_progress`. If multiple, use AskUserQuestion to pick one.
3. If no in-progress tasks found, show the OVERVIEW and ask which task to resume.

### C.2 Determine the resumption point

Read the task directory and classify its state:

| State | Evidence | Action |
|-------|----------|--------|
| Phase 1 incomplete | `design.md` or `acceptance.md` missing | Inform user, offer to regenerate Phase 1 docs |
| Phase 1 done, Phase 2 not started | `design.md` + `acceptance.md` exist, no `spec-*.md` files | Ask user if the design is approved, then enter Phase 2 Step 6 |
| Phase 2 done, tracking not initialized | `spec-*.md` files exist, no `progress.md` | Run Phase 2 Step 8 to create tracking files |
| Implementation in progress | `progress.md` exists with some specs pending/in_progress | Show progress table, identify the next actionable spec (first `pending` whose dependencies are met, or current `in_progress`), ask user how to proceed |
| All done | All specs `completed` | Inform user the task is fully completed |

### C.3 Present context and next action

- Show a brief summary: task title, current phase, what was last completed
- Suggest the concrete next step (e.g. "spec-03 is next, ready to start?")
- Wait for user direction before proceeding

**End here — the user decides what to do next.**

---

## Phase 1: Design & Acceptance (generate → wait for review)

### 1. Understand the task

- Read relevant source files and existing docs to understand the current state
- If the task scope is ambiguous, use AskUserQuestion to clarify before proceeding

### 2. Determine the plan directory

- Create `plan/<task-slug>/` at the project root (e.g. `plan/add-export-feature/`)
- `<task-slug>` should be a short kebab-case name derived from the task description

### 3. Generate the overview design doc

Write `plan/<task-slug>/design.md`:

```
# <任务标题>

## 背景与目标
Why this change is needed; what problem it solves.

## 现状分析
Relevant current code/architecture (file paths, key functions).

## 方案设计
The proposed approach — data flow, key decisions, trade-offs considered.
Include diagrams (ASCII) if they clarify the architecture.

## 影响范围
Which modules/files will be modified or created.

## 风险与降级
Known risks and mitigation / fallback strategies.
```

### 4. Generate the acceptance doc

Write `plan/<task-slug>/acceptance.md`:

```
# 验收标准

## 功能验收
- [ ] Checklist of user-visible behaviors that must work
- [ ] Each item maps to expected spec areas

## 技术验收
- [ ] Compilation checks (cargo check, tsc --noEmit)
- [ ] Test suites pass
- [ ] No regressions in existing features

## 验收流程
Step-by-step walkthrough for the reviewer to validate the full feature end-to-end.
```

### 5. Stop and wait for user review

- List the two files created with a one-line summary of each
- Ask the user to review the design and acceptance criteria
- Do NOT proceed to Phase 2 until the user explicitly approves (e.g. "没问题", "approved", "继续")
- If the user requests changes, update the docs and ask for review again

---

## Phase 2: Spec Breakdown (only after Phase 1 is approved)

### 6. Generate spec documents

Split the task into discrete implementation units. For each unit, write `plan/<task-slug>/spec-NN-<name>.md`:

```
# Spec NN: <标题>

## 目标
What this spec delivers.

## 改动详情
- Files to modify/create
- Key logic changes (with enough detail to implement)

## 人工验证（required for functional changes）
Step-by-step instructions the user can follow to manually verify this spec works:
1. What to do (e.g. "open settings page", "run command X")
2. What to observe (e.g. "model list appears", "error message shows Y")
3. Edge cases to test

## 依赖
Which other specs must be completed first (if any).
```

Rules for specs:
- Each spec should be independently verifiable
- Order specs by dependency (earlier specs are prerequisites for later ones)
- If a spec involves ONLY internal refactoring with no user-visible change, the "人工验证" section can state "no functional change — verify via `cargo check` / `npx tsc --noEmit` / tests"
- If a spec involves functional/UI changes, "人工验证" is MANDATORY and must describe concrete user actions and expected results

### 7. Present specs for review

- List all spec files with a one-line summary of each
- Ask the user to review before proceeding to implementation
- Do NOT start coding until the user approves the specs

### 8. Initialize progress tracking

After specs are approved, create tracking files:

**a) Create `plan/<task-slug>/progress.md`:**

```markdown
# 任务进度: <任务标题>

创建时间: YYYY-MM-DD
状态: in_progress

| # | Spec | 状态 | 更新时间 |
|---|------|------|----------|
| 01 | spec-01-<name> | pending | YYYY-MM-DD |
| 02 | spec-02-<name> | pending | YYYY-MM-DD |
| ... | ... | ... | ... |

进度: 0/N completed
```

**b) Update `plan/OVERVIEW.md`:**

Read `plan/OVERVIEW.md`. If it does not exist, create it with:

```markdown
# 任务总览

| 任务 | 目录 | Specs | 完成 | 进度 | 更新时间 |
|------|------|-------|------|------|----------|
```

Then check if a row with the same `<task-slug>` already exists in the table:
- **If exists**: update that row in place (reset counts to reflect current specs)
- **If not**: append a new row

Row format:

```
| <任务标题> | <task-slug> | N | 0 | ░░░░░ 0% | YYYY-MM-DD |
```

---

## Phase 3: Progress Management

This phase defines the rules for updating progress as specs are implemented. These rules apply **whenever specs are being worked on**, not just during the initial `/plan-task` invocation.

### Spec lifecycle

Each spec transitions through these states:

```
pending → in_progress → completed
```

### When to update progress

Update tracking files at these moments:

1. **Starting a spec**: mark it `in_progress` in `progress.md`
2. **Completing a spec**: mark it `completed` in `progress.md`, update the summary line and `OVERVIEW.md`
3. **All specs completed**: set the task status to `completed` in `progress.md` header, update `OVERVIEW.md`

### How to update

**`progress.md`** — edit the table row for the spec:
- Change the status column (`pending` → `in_progress` → `completed`)
- Update the date column to today
- Update the summary line at the bottom: `进度: M/N completed`

**`plan/OVERVIEW.md`** — edit the row for the task:
- Update the "完成" column count
- Update the progress bar and percentage
- Update the date column

### Progress bar rendering (5 cells)

```
  0% → ░░░░░   0%
 20% → █░░░░  20%
 40% → ██░░░  40%
 60% → ███░░  60%
 80% → ████░  80%
100% → █████ 100%
```

Round to the nearest 20% threshold. For example: 1/3 (33%) → `██░░░ 33%`, 2/3 (67%) → ███░░ 67%.

---

## Document conventions

- Document titles and content in Chinese; code identifiers, file paths, and CLI commands in English
- Keep docs concise — focus on decisions and verification, not exhaustive prose
- Reference existing code by file path and function name where relevant
