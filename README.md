# Claude Code Skills

A collection of practical [Claude Code](https://claude.ai/code) plugins for daily development workflows.

[中文文档](README_CN.md)

## Plugins

| Plugin | Description |
|:-------|:------------|
| [setup-worklog](plugins/setup-worklog/) | Deploy a worklog system to any project. Auto-records session activity so the next session can pick up where you left off. |
| [commit](plugins/commit/) | Analyze git changes and generate a conventional commit message for review before committing. |
| [plan-task](plugins/plan-task/) | Generate a design doc and acceptance criteria, then break down into implementation specs after approval. |

## Installation

### Via Plugin Marketplace (Recommended)

Add this repo as a marketplace in Claude Code:

```
/plugin marketplace add donfaquir/claude-code-skills
```

Then install the plugin you want:

```
/plugin install setup-worklog@claude-code-skills
/plugin install commit@claude-code-skills
/plugin install plan-task@claude-code-skills
```

### Manual Installation

```bash
git clone https://github.com/donfaquir/claude-code-skills.git
cp -r claude-code-skills/plugins/setup-worklog ~/.claude/skills/
cp -r claude-code-skills/plugins/commit ~/.claude/skills/
cp -r claude-code-skills/plugins/plan-task ~/.claude/skills/
```

> **Note:** If `~/.claude/skills/` does not exist yet, create it first with `mkdir -p ~/.claude/skills/` and restart Claude Code.

## Usage

After installation, invoke in Claude Code:

```
/setup-worklog
/commit
/plan-task
```

### setup-worklog

Deploys a lightweight worklog system to your project. Each Claude Code session automatically records what was done, key decisions, and next steps — so the next session can pick up right where you left off.

### commit

Reads your staged/unstaged git changes, drafts a conventional commit message (`type(scope): description`), and lets you review before committing. No more staring at a blank commit message.

### plan-task

Takes a task description and produces structured planning documents in two phases. Phase 1 generates a design doc and acceptance criteria for your review. Phase 2 (after approval) breaks the task down into discrete, dependency-ordered implementation specs — each with manual verification steps.

## Project Structure

```
claude-code-skills/
├── .claude-plugin/
│   └── marketplace.json           # Marketplace index
├── plugins/
│   ├── setup-worklog/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json        # Plugin metadata
│   │   └── skills/
│   │       └── setup-worklog/
│   │           └── SKILL.md       # Skill definition
│   ├── commit/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   └── skills/
│   │       └── commit/
│   │           └── SKILL.md
│   └── plan-task/
│       ├── .claude-plugin/
│       │   └── plugin.json
│       └── skills/
│           └── plan-task/
│               └── SKILL.md
└── README.md
```

## Contributing

To add a new plugin, create a directory under `plugins/` following this structure:

```
plugins/
└── your-plugin-name/
    ├── .claude-plugin/
    │   └── plugin.json
    └── skills/
        └── your-skill-name/
            └── SKILL.md
```

Then add an entry to `.claude-plugin/marketplace.json`.

## License

MIT
