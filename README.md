# Claude Code Skills

A collection of reusable [Claude Code](https://claude.ai/code) custom skills.

## Skills

| Skill | Description |
|:------|:------------|
| [setup-worklog](skills/setup-worklog/) | Deploy a worklog system to any project. Auto-records session activity so the next session can pick up where you left off. |
| [commit](skills/commit/) | Analyze git changes and generate a conventional commit message for review before committing. |

## Installation

Copy the skill directory into your Claude Code skills folder:

```bash
# Install a single skill (e.g. setup-worklog)
cp -r skills/setup-worklog ~/.claude/skills/

# Or install all skills at once
cp -r skills/* ~/.claude/skills/
```

Then invoke it in Claude Code:

```
/setup-worklog
/commit
```

> **Note:** If `~/.claude/skills/` does not exist yet, create it first with `mkdir -p ~/.claude/skills/`. After creating the top-level directory for the first time, restart Claude Code for it to be detected.

## Contributing

To add a new skill, create a directory under `skills/` with a `SKILL.md` file:

```
skills/
└── your-skill-name/
    └── SKILL.md
```

See existing skills for the frontmatter format and structure conventions.

## License

MIT
