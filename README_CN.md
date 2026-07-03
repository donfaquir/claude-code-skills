# Claude Code Skills

一组实用的 [Claude Code](https://claude.ai/code) 插件，提升日常开发工作流效率。

[English](README.md)

## 插件列表

| 插件 | 说明 |
|:-----|:-----|
| [setup-worklog](plugins/setup-worklog/) | 一键部署工作日志系统。自动记录每个 session 的执行轨迹，第二天打开直接续接。 |
| [commit](plugins/commit/) | 分析 git 变更，自动生成 conventional commit 格式的提交信息，确认后再提交。 |
| [plan-task](plugins/plan-task/) | 根据任务描述生成设计文档和验收标准，审批通过后拆分为可执行的实现规格。 |
| [design-review-board](plugins/design-review-board/) | 多角色评审委员会——6 个角色（架构师、SRE、安全、DBA、QA、产品）并行评审设计方案，多轮自动收敛。 |

## 安装

### 通过插件市场安装（推荐）

在 Claude Code 中添加本仓库为插件市场：

```
/plugin marketplace add donfaquir/claude-code-skills
```

然后安装你需要的插件：

```
/plugin install setup-worklog@claude-code-skills
/plugin install commit@claude-code-skills
/plugin install plan-task@claude-code-skills
/plugin install design-review-board@claude-code-skills
```

### 手动安装

```bash
git clone https://github.com/donfaquir/claude-code-skills.git
cp -r claude-code-skills/plugins/setup-worklog ~/.claude/skills/
cp -r claude-code-skills/plugins/commit ~/.claude/skills/
cp -r claude-code-skills/plugins/plan-task ~/.claude/skills/
cp -r claude-code-skills/plugins/design-review-board ~/.claude/skills/
```

> **注意：** 如果 `~/.claude/skills/` 目录不存在，先执行 `mkdir -p ~/.claude/skills/` 创建，然后重启 Claude Code。

## 使用

安装完成后，在 Claude Code 中输入对应命令即可调用：

```
/setup-worklog
/commit
/plan-task
/design-review-board
```

### setup-worklog

在项目中部署一套轻量的工作日志系统。核心解决的问题是 **Claude Code 跨 session 的上下文断裂**——每次新 session 都不知道上次做到哪了。

部署后，系统会：

1. **自动记录**：每个 session 启动时，通过 Hook 自动在当天的日志文件中写入段落头（时间、session ID、分支名）
2. **主动追加**：Claude 在完成任务、做出关键决策、遇到阻塞时，自动追加一段日志
3. **自动续接**：下一个 session 启动时，自动读取最近的日志，从「下一步」字段接续工作

日志格式：

```markdown
## 2026-06-15 09:30:00 · session:a1b2c3d4 · branch:feature/auth

### 09:35 完成 JWT 中间件
- **做了什么**: 新增 src/middleware/auth.ts，实现 token 校验
- **为什么**: 旧认证方案不满足合规要求
- **下一步**: 编写集成测试，覆盖 token 过期场景
```

### commit

读取暂存或未暂存的 git 变更，自动生成 conventional commit 格式的提交信息：

```
type(scope): description
```

生成后会让你确认或修改，确认后才执行提交。不会自动 push，只做本地 commit。

### plan-task

把一个开发任务拆解为结构化的规划文档，分两个阶段进行：

**阶段一**：生成设计文档（`design.md`）和验收标准（`acceptance.md`），等待你审阅确认。

**阶段二**（审批通过后）：将任务拆分为多个独立的实现规格（`spec-NN-xxx.md`），每个 spec 包含：
- 目标和改动详情
- 人工验证步骤（功能变更必须提供具体的操作和预期结果）
- 依赖关系（哪些 spec 需要先完成）

所有文档输出到 `plan/<task-slug>/` 目录，方便版本管理和团队评审。

### design-review-board

模拟一个 6 人评审委员会，在编码前对设计方案进行充分审视。6 个独立角色（架构师、SRE、安全工程师、DBA、QA、产品）并行评审，按严重度（Critical / High / Medium / Low）归类问题，方案经过多轮"评审→修改"自动收敛（最少 2 轮，最多 3 轮），直到所有 Critical 和 High 问题解决。最终输出终版设计文档和完整的评审记录。

**设计动机**：曾因方案仅从开发者视角评审，导致"服务器重启后内存状态丢失"这类运维不可接受的缺陷在实现后才被发现。多角色评审可在设计阶段拦截此类问题。

## 项目结构

```
claude-code-skills/
├── .claude-plugin/
│   └── marketplace.json           # 市场索引
├── plugins/
│   ├── setup-worklog/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json        # 插件元数据
│   │   └── skills/
│   │       └── setup-worklog/
│   │           └── SKILL.md       # 技能定义
│   ├── commit/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   └── skills/
│   │       └── commit/
│   │           └── SKILL.md
│   ├── plan-task/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   └── skills/
│   │       └── plan-task/
│   │           └── SKILL.md
│   └── design-review-board/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       └── skills/
│           └── design-review-board/
│               └── SKILL.md
└── README.md
```

## 贡献

添加新插件时，在 `plugins/` 下按以下结构创建目录：

```
plugins/
└── your-plugin-name/
    ├── .claude-plugin/
    │   └── plugin.json
    └── skills/
        └── your-skill-name/
            └── SKILL.md
```

然后在 `.claude-plugin/marketplace.json` 中添加对应条目即可。

## 许可证

MIT
