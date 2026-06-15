---
name: plan-task
description: Generate design doc and acceptance doc for user review; then break down into specs after approval
user_invocable: true
---

Take a development task description and produce planning documents in two phases: first design + acceptance for review, then spec breakdown after approval.

## Input

The user provides a task description after invoking `/plan-task`. If no description is given, ask the user to describe the task.

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

## Document conventions

- Document titles and content in Chinese; code identifiers, file paths, and CLI commands in English
- Keep docs concise — focus on decisions and verification, not exhaustive prose
- Reference existing code by file path and function name where relevant
