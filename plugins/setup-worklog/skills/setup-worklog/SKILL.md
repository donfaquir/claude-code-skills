---
name: setup-worklog
description: 在当前项目部署 worklog 工作日志系统。建 worklog/ 目录 + SessionStart hook + CLAUDE.md 约束，让 Claude 每次 session 自动留下执行轨迹，方便次日续接。
user_invocable: true
---

在当前项目部署一套 worklog 工作日志系统，分三部分：

1. `worklog/` 目录（每日一份 md，记录每个 session 做了什么）
2. `.claude/settings.json` 的 SessionStart hook（自动写入 session 头）
3. `.claude/CLAUDE.md` 的 worklog 约束（让 Claude 在关键节点主动 append）

整个流程必须 idempotent — 重复运行不破坏已有内容。

## Step 1: 探查项目结构

并行执行：
- `ls -la .claude/ 2>/dev/null` — 看是否有 settings.json / CLAUDE.md
- `ls CLAUDE.md 2>/dev/null` — 看项目根是否有 CLAUDE.md

根据结果决定：
- **CLAUDE.md 位置**: 优先 `.claude/CLAUDE.md`；其次项目根 `CLAUDE.md`；都没有就在 `.claude/CLAUDE.md` 新建

若任何路径有歧义，用 AskUserQuestion 让用户选。

## Step 2: 创建 worklog 目录并配置 gitignore

```bash
mkdir -p worklog
```

在项目根 `.gitignore` 中追加 `worklog/`（**先检查是否已包含，已有则跳过**）：

```bash
grep -qxF 'worklog/' .gitignore 2>/dev/null || echo 'worklog/' >> .gitignore
```

若 `.gitignore` 不存在，上述命令会自动创建。

## Step 3: 配置 SessionStart hook

读取 `.claude/settings.json`（若不存在则视为 `{}`）。

**关键合并规则**：
- 如果 `hooks.SessionStart` 已有任何条目，检查其 command 是否包含 `worklog` 字样
  - 若已有 worklog hook → 跳过本步，告诉用户「已存在，跳过」
  - 若有别的 SessionStart hook → **append** 一条，不要覆盖
- 如果整个 `hooks.SessionStart` 不存在 → 新增

要 append/写入的 hook 条目：

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "mkdir -p \"$CLAUDE_PROJECT_DIR/worklog\" && jq -r --arg ts \"$(date '+%Y-%m-%d %H:%M:%S')\" --arg br \"$(cd \"$CLAUDE_PROJECT_DIR\" && git branch --show-current 2>/dev/null || echo none)\" '\"\\n## \\($ts) · session:\\(.session_id[0:8]) · branch:\\($br)\\n\"' >> \"$CLAUDE_PROJECT_DIR/worklog/$(date '+%Y-%m-%d').md\""
    }
  ]
}
```

把这个对象 push 到 `hooks.SessionStart` 数组。用 Edit 工具精确合并，不要 Write 整个文件覆盖（会丢已有 permissions 等）。

**合并后必须校验**：

```bash
jq -e '.hooks.SessionStart[] | .hooks[] | select(.type == "command") | .command' .claude/settings.json
```

退出码 0 + 打印命令 = 成功。

**端到端验证 hook 命令本身可跑**：

```bash
CMD=$(jq -r '.hooks.SessionStart[].hooks[] | select(.command | contains("worklog")) | .command' .claude/settings.json | head -1)
echo '{"session_id":"verifytest12345","source":"startup"}' | env CLAUDE_PROJECT_DIR="$PWD" bash -c "$CMD"
cat "worklog/$(date '+%Y-%m-%d').md"
rm -f "worklog/$(date '+%Y-%m-%d').md"
```

应输出一行 `## YYYY-MM-DD HH:MM:SS · session:verifyte · branch:xxx`。

## Step 4: 注入 CLAUDE.md 约束

读取目标 CLAUDE.md（Step 1 决定的位置）。

**关键合并规则**：
- grep 文件是否已含 `## Worklog 工作日志习惯` 标题
  - 若已含 → 跳过本步
  - 若未含 → 用 Edit 在文件末尾 append 下面的片段

要 append 的片段：

```markdown

## Worklog 工作日志习惯

每个 Claude session 必须维护 `worklog/YYYY-MM-DD.md`，让用户次日打开就能续接工作。

### Session 启动时（第一次回应用户之前）

必读最近一份 worklog 获取上下文：
1. 先读 `worklog/<今天>.md`；如不存在或为空,读 `ls -1t worklog/*.md | head -2` 找最近 1-2 天的文件
2. 重点看最近 session 段落里的「下一步」字段,作为接续点
3. SessionStart hook 已自动在当日 worklog 写入本 session 的段落头(`## 时间 · session:xxx · branch:xxx`),无需手写

### 工作进行中（关键节点主动 append）

以下时机必须在当前 session 段落下 append 一段记录到当日 worklog：
- 一个 `TaskCreate` 任务被标记 completed 时
- 做出重要架构/技术决策时
- 遇到无法自行解决的阻塞（需要用户决策、外部依赖）时
- Session 即将结束、要交接给用户时

### Append 格式

\`\`\`markdown
### HH:MM <一行总结，10 字内>
- **做了什么**: 简述动作和涉及的文件
- **为什么**: 动机、约束、上下文（用户次日看时能复原决策）
- **下一步**: 明确的接续动作，让下个 session 知道从哪里开始
\`\`\`

「下一步」是核心字段——次日新 session 启动后会优先读它来决定接什么。
```

若 CLAUDE.md 文件不存在，Write 一个新文件，内容只含该片段（去掉最前面的空行）。

## Step 5: 总结报告

向用户报告以下内容（中文）：
1. 实际创建/合并了哪些文件（用列表，写绝对路径）
2. 哪些步骤被跳过（已存在）
3. **重要提示**：新建/修改 `.claude/settings.json` 后，hook 监听器要重新加载才能在本 session 生效：
   - 让用户输入 `/hooks` 打开菜单（自动 reload）
   - 或重启 Claude Code
   - 下次 session 启动时 worklog 应自动产生段落头

## 边界情况

- **不是 git 仓库**: hook 命令里 `git branch --show-current` 会失败，但有 `|| echo none` 兜底，仍可工作
- **没装 jq**: 测试 `command -v jq`，若缺失则告诉用户先 `brew install jq` 再重跑 skill
- **项目用其他文档语言（英文）**: CLAUDE.md 片段保持中文（用户偏好），与现有约定一致
- **用户拒绝 git ignore worklog**: 询问用户是否真的想把每日 worklog 提交进 git；如愿意，跳过往 `.gitignore` 追加
