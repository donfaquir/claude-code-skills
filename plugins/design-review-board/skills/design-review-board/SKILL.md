---
name: design-review-board
description: >
  Multi-role design review board. 3-6 roles (Architect, SRE, Security, DBA, QA, Product) selected
  by content analysis, review in parallel with adversarial verification and auto-converging rounds.
  Trigger: design review board, multi-role review
user_invocable: true
---

# Multi-Role Design Review Board

## When to use

When you need to design a technical proposal and want to catch architecture-level defects before coding. This skill simulates 3-6 independent review roles to systematically expose blind spots that a single perspective would miss.

**Typical triggers**:
- User asks to design a new feature or architectural change
- User asks for a multi-role review of an existing design document
- User mentions "design review board" or "multi-role review"

**Design motivation**: a past incident where a proposal reviewed only from the developer's perspective led to an operationally unacceptable defect ("in-memory state lost on server restart") discovered only after implementation. Multi-role review catches such issues at the design stage.

**Flow overview**:

```
Phase 0  Input guard               [BLOCKING: require design goal before proceeding]
Phase 1  Input & estimate          [USER GATE: confirm to proceed]
Phase 2  Context gathering         (auto)
Phase 3  Role selection            [USER GATE: confirm roles]
Phase 4+5  Review round            (Workflow: parallel review + dedup + verify)
Phase 6  Revise & converge         [USER GATE: confirm revisions]
Phase 7  Final output
```

---

## Phase 0: Input Guard

**BLOCKING — execute this before anything else.**

Check whether the user has provided a clear design goal. A valid input is one of:
- A task description explaining what to design (e.g. "design a caching layer for the API")
- A path to an existing design document to review
- A reference to a specific feature, system, or change

If the user invoked this skill without any design goal (e.g. just `/design-review-board` with no context), **do NOT proceed**. Instead, use AskUserQuestion to ask:

```
This skill requires a design goal to review. Please provide one of:

Option A: Describe what you want to design (e.g. "design a user authentication system")
Option B: Provide a path to an existing design document to review
```

Do NOT explore the codebase, do NOT generate documents, do NOT select roles until the user has provided a clear design goal. Repeat this gate if the user's response is still too vague to act on.

---

## Phase 1: Input & Cost Estimate

### 1.1 Determine input mode

Based on the user's input from Phase 0:
- **Option A**: User provided a task description -> generate initial proposal
- **Option B**: User provided an existing design document path -> skip to review

### 1.2 Option A — generate initial proposal

1. Explore the codebase to understand current state and constraints (shallow — deeper context gathering happens in Phase 2)
2. Write the design document to `plan/<task-slug>/design.md`:

```markdown
# <Task title>

## Background & goals
Why this change is needed; what problem it solves.

## Current-state analysis
Relevant existing code / architecture (file paths, key functions).

## Proposed design
The proposed approach — data flow, key decisions, trade-offs.
Include diagrams (ASCII) to clarify the structure.

## Data model
If persistence is involved: table structures, indexes, migration plan.

## Interface design
If APIs / interfaces change: endpoints, request / response formats.

## Impact scope
Which modules / files need modification or creation.

## Deployment & operations
Deployment steps, rollback plan, monitoring / alerting.

## Risks & degradation
Known risks and mitigation / fallback strategies.
```

3. Present the initial proposal with a cost estimate:

```
Design proposal generated: plan/<task-slug>/design.md

Review board estimate:
- Roles: 3-6 (determined after context analysis)
- Rounds: 1-3
- Expected agent calls: ~8-24

Please review the proposal. Reply "start review" to proceed, or request changes.
```

### 1.3 Option B — read existing document

Read the design document at the user-specified path. If the path does not exist, report and ask again. Present content summary and the same cost estimate, then wait for user confirmation.

**User gate**: Blocking. User must explicitly confirm ("start review", "confirmed", "OK") before proceeding. If user requests changes, update the document and ask again.

---

## Phase 2: Context Gathering

Build a **codebase context brief** that gets injected into every review agent's prompt. This is what separates grounded review from generic commentary.

### 2.1 Detect tech stack

Run in parallel:

```bash
# Identify language / framework
ls package.json Cargo.toml go.mod pom.xml build.gradle requirements.txt pyproject.toml *.csproj 2>/dev/null

# Extract key dependencies (example for Node.js; adapt per detected stack)
head -50 package.json 2>/dev/null || head -30 pom.xml 2>/dev/null || head -30 go.mod 2>/dev/null

# Infrastructure hints
find . -maxdepth 3 \( -name "docker-compose*.yml" -o -name "Dockerfile" -o -name "*.k8s.yml" -o -name "helmfile.yaml" \) 2>/dev/null | head -5
```

### 2.2 Extract design-relevant code

Parse the design document for references to files, modules, functions, table names, and API endpoints. For each reference:
- Read the file (first 100 lines if large) to extract interfaces, class/function signatures
- For database designs: look for migration files, schema definitions (e.g. `prisma/schema.prisma`, `**/migrations/*.sql`, ORM model files)
- For API designs: look for route definitions, OpenAPI specs

**Cap total extracted context at ~200 lines** to keep agent prompts manageable.

### 2.3 Assemble the context brief

```markdown
## Codebase Context

### Tech Stack
- Language: TypeScript
- Framework: Express.js + Prisma ORM
- Database: PostgreSQL
- Infrastructure: Docker Compose

### Relevant Existing Code

#### src/models/user.ts (interface)
export interface User { id: string; email: string; ... }

#### src/routes/auth.ts (route signatures)
router.post('/login', ...); router.post('/register', ...);

### Existing Database Schema
model User { id String @id; email String @unique; ... }
```

**Failure handling**: If exploration commands fail (e.g. no recognizable project files), continue with an empty context brief. Log: "No codebase context available — review will be based on document text only."

---

## Phase 3: Role Selection

Determine which roles are relevant based on the design document's content, rather than always launching all 6.

### 3.1 Signal-based selection

| Signal in design document | Role to include |
|---|---|
| Database tables, migrations, SQL, ORM models, data storage | DBA |
| API endpoints, authentication, authorization, user input | Security |
| Deployment, scaling, state management, caching, monitoring | SRE |
| Test strategy, complex conditional logic, error handling | QA |

**Always included** (every design has structure and purpose):
- Architect
- Product

**Minimum 3 roles, maximum 6.**

### 3.2 Present to user

```
Selected review roles (4 of 6):
  [x] Architect — module structure and design patterns
  [x] SRE — design mentions stateful service and deployment
  [x] Security — API endpoints with authentication
  [x] Product — user-facing workflow change
  [ ] DBA — no database changes detected
  [ ] QA — no complex logic / test strategy section

Add or remove roles? (Enter to confirm)
```

**User gate**: Blocking. User confirms or adjusts role selection.

**If uncertain**: Default to including the role (err toward more coverage, not less).

---

## Phase 4+5: Review Round

### Preferred — Workflow orchestration

If the **Workflow tool** is available in this session, use it (this skill invocation is your authorization):

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/review-round.js",
  args: {
    designDoc: <full text of design.md>,
    contextBrief: <context brief from Phase 2>,
    roles: <array of selected role names, e.g. ["Architect", "SRE", "Security", "Product"]>,
    round: <current round number, starting at 1>,
    previousFindings: <findings array from previous round, or [] for round 1>,
    changes: <content of "## Changes in Round N-1" section, or "" for round 1>
  }
})
```

It runs one review agent per selected role in parallel (schema-validated output), deduplicates
across roles, then adversarially verifies every Critical/High finding — so false positives die
before the user sees them. Tell the user the estimate before launching: N review agents +
up to M verification agents.

### Fallback — direct subagent

If the Workflow tool is NOT available (older Claude Code builds), fall back to direct subagent
orchestration:

1. For each selected role, launch an Agent in parallel with the role's prompt (see role definitions
   below), the codebase context brief, and the full design document. Request JSON output in a
   ` ```json ` code fence following the review schema.

2. Parse each agent's output. If JSON is malformed, attempt free-text extraction by looking for
   severity markers (Critical / High / Medium / Low) and bullet-point structure. If that also
   fails, mark the role as `FAILED`.

3. Deduplicate: if two findings share the same `affected_component` and `severity`, keep the one
   with the more specific recommendation and merge source roles.

4. For each Critical / High finding, spawn a verification agent to challenge it. The verifier
   evaluates whether the symptom is present, the impact is realistic, and the severity is
   appropriate. Apply verdicts (confirmed / downgraded / dismissed).

**Failure handling**:
- Single agent fails: continue with remaining agents. Note gap in summary.
- More than 50% of agents fail: abort. Report: "Review aborted: X of Y agents failed. Please retry."

### Fallback role definitions

Only needed when the Workflow tool is unavailable (the workflow script contains its own copy).

- **Architect**: Abstraction quality, extensibility, module coupling, design-pattern choice, complexity
- **SRE**: Data durability, multi-instance consistency, failover, observability, deployment safety, capacity. Special attention to state tied to process lifetime.
- **Security**: AuthN/AuthZ, input validation/injection, data protection, OWASP Top 10, dependency security, least privilege
- **DBA**: Data model, index design, query performance, transaction boundaries, data migration, data consistency
- **QA**: Testability, boundary conditions, fault injection, regression risk, verification strategy, test-data construction
- **Product**: Problem fit, user impact, backward compatibility, delivery cadence/MVP, cost-benefit

### Handle the result

The workflow returns (or the fallback produces the equivalent):

```json
{
  "error": false,
  "round": 1,
  "findings": [...],
  "dismissed": [...],
  "failedRoles": [],
  "stats": { "critical": 1, "high": 2, "medium": 3, "low": 1 }
}
```

- If `error` is true: report the `errorMessage` to the user and offer to retry.
- If `failedRoles` is non-empty: note in the summary which domains may have gaps.

### Generate review summary

Using the `findings` and `dismissed` arrays, produce the consolidated summary table (in Chinese):

```markdown
## 第 N 轮评审摘要

| # | 严重度 | 来源角色 | 问题标题 | 验证结果 | 处理状态 |
|---|--------|---------|----------|----------|----------|
| 1 | Critical | SRE | 重启后状态丢失 | confirmed | 待修改 |
| 2 | High | DBA, Architect | 缺少唯一索引 | downgraded → Medium | — |
| 3 | Medium | Security | 日志可能泄露 token | — | 建议改进 |
```

For findings with `_sourceRoles` containing multiple roles, label as "multi-role consensus".
For findings with `_originalSeverity`, show the downgrade (e.g. "downgraded: High → Medium").
Below the table, list dismissed findings (if any) with `_dismissReason`.

---

## Phase 6: Revision & Convergence

### 6.1 Present findings and proposed revisions

Show the user:

1. The review summary table from Phase 4+5
2. A bullet list of proposed revisions for each confirmed Critical / High issue:

```
Proposed revisions:
- [C-1] Add Redis persistence for session state (Section: Proposed Design)
- [H-3] Add rate limiting to /api/auth (Section: Interface Design)

Apply these revisions? Options:
- "confirm" — apply all
- "dismiss C-1" — mark as risk accepted
- Provide specific modification instructions
```

**User gate**: Blocking. The user can:
- Confirm all revisions
- Dismiss specific findings (recorded as "risk accepted by user" in review record)
- Request different revisions than those proposed

### 6.2 Apply revisions

After user confirmation:
1. Update `design.md` **in place** — modify the relevant sections
2. Append a `## Changes in Round N` section at the end of `design.md`:

```markdown
## Changes in Round N

- [C-1] SRE: session state moved from in-memory Map to Redis (Section: Proposed Design)
- [H-3] Security: added rate limiting middleware to auth endpoints (Section: Interface Design)
```

### 6.3 Convergence logic

Using the workflow result's `stats`:

```
if stats.critical + stats.high == 0:
    → Phase 7 (review passed)
elif current_round >= 3:
    → Phase 7 (mark unresolved High as "residual risk")
else:
    → next round (Phase 4+5)
```

**No forced minimum rounds.** If Round 1 produces zero Critical / High findings, go directly to Phase 7.

### 6.4 Role re-selection for next round

For Round 2+, do NOT simply "re-engage roles that raised issues." Instead:

1. Analyze which **domains** the revisions touch:

| Revision touches... | Re-engage role |
|---|---|
| Database schema, queries, indexes | DBA |
| API endpoints, auth, input handling | Security |
| Deployment, infrastructure, state storage | SRE |
| Module structure, interfaces, patterns | Architect |
| Test strategy, edge cases | QA |
| User flow, business logic | Product |

2. Always re-engage roles that had **unresolved** Critical / High findings
3. The union of (1) and (2) forms the role set for the next round

Then return to Phase 4+5 with:
- `round` = current_round + 1
- `previousFindings` = current round's `findings` array
- `changes` = the `## Changes in Round N` section just written
- Updated `roles` array

Auto-proceed — user can interrupt if needed.

---

## Phase 7: Final Output

### 7.1 Write final design document

Write the revised `design.md` to `plan/<task-slug>/design.md` (or user-specified path). Remove the `## Changes in Round N` sections from the final version — they belong in the review record.

### 7.2 Write review record

Write `plan/<task-slug>/review-record.md` (always a separate file):

```markdown
# 评审记录

## 评审配置
- 评审角色：[list of roles used]
- 评审轮次：N
- 收敛条件：所有角色无 Critical / High 问题

## 第 1 轮评审（YYYY-MM-DD）

[review summary table]

## 第 1→2 轮修改说明

[changes list]

## 第 2 轮评审（YYYY-MM-DD）

[review summary table]

## 被驳回的发现

| # | 原严重度 | 来源 | 标题 | 驳回理由 |
|---|---------|------|------|----------|
| 1 | High | DBA | ... | 验证 Agent: design already handles this via... |
| 2 | Critical | SRE | ... | 用户标记: risk accepted |

## 评审结论
- [x] 所有 Critical 问题已解决
- [x] 所有 High 问题已解决或标记为遗留风险
- 遗留风险：（if any）
```

### 7.3 Report to user

```
Review [passed / conditionally passed]:
- Rounds: N
- Findings: X Critical, Y High, Z Medium, W Low
- Resolved: ...
- Dismissed (false positive): ...
- Residual risks: (if any)

Output files:
- plan/<task-slug>/design.md (final design)
- plan/<task-slug>/review-record.md (full review trail)
```

---

## Edge Cases

1. **No codebase (design-only review)**: Phase 2 returns an empty context brief. Agents review based on document text only. Note in summary: "No codebase context — review based on document text only."

2. **Very large design document (>500 lines)**: Warn the user that agent context may be constrained. Suggest splitting into focused sections.

3. **All agents return zero findings in Round 1**: Skip directly to Phase 7. Do not force a second round.

4. **User dismisses all Critical findings**: Record as "risk accepted by user" in review record. Proceed as if resolved.

5. **Single agent fails**: Continue with remaining agents. Note the gap in the summary.

6. **Majority of agents fail (>50%)**: Abort. Report: "Review aborted: X of Y agents failed. Please retry."

7. **Design document references systems not in the codebase**: Context gathering won't find relevant code. Agents should flag when they lack code context for specific claims.

8. **Workflow tool unavailable**: Fall back to direct subagent approach (see Phase 4+5 fallback). The review still works but without schema-validated output or deterministic dedup.

---

## Guidelines

1. **Every Agent must review independently** — prompts emphasize "do not assume other roles will cover issues you leave unmentioned"
2. **This skill only produces documents, never writes code**
3. **Respect user judgment on Medium / Low issues** — only Critical / High block convergence
4. **Codebase context matters** — Phase 2 is not optional; even a partial context brief produces better reviews than none
5. **Adversarial verification prevents wasted effort** — do not skip verification when Critical / High findings exist
6. **Document language** — design documents and review comments in Chinese; code identifiers, file paths, severity labels in English
