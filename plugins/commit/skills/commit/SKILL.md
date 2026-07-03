---
name: commit
description: Analyze git changes and generate a conventional commit message
user_invocable: true
---

Analyze the current git changes and generate a commit message for the user to review.

Steps:

1. Run `git status` to see all changed and untracked files. If there are no changes, inform the user and stop.

2. Run `git diff --staged` to see staged changes. If nothing is staged, run `git diff` to see unstaged changes and also list untracked files.

3. Analyze all changes and draft a commit message following conventional commit style:
   - Format: `type(scope): description`
   - Types: feat, fix, chore, docs, refactor, test, style, perf
   - Scope: the module or area affected
   - Description: concise, in English, focus on "why" not "what"
   - Subject line: ideally ≤50 chars and never >72 chars
   - Body is optional — add a brief one-line description only for complex changes
   - Do NOT add bullet points, trailing summaries, or "BREAKING CHANGE" footer unless the user explicitly asks
   - If multiple logical changes are mixed together, suggest splitting the commit instead of writing a long message
   - Always append a `Co-authored-by` trailer to declare the AI model used. Identify your model name (e.g. Opus 4.6, Sonnet 4) and format as:
     ```
     Co-authored-by: Claude (<model>) <noreply@anthropic.com>
     ```
     Separate the trailer from the subject (or body) with a blank line. Example:
     ```
     feat(auth): add JWT token validation

     Co-authored-by: Claude (Opus 4.6) <noreply@anthropic.com>
     ```

4. Present the commit message to the user using AskUserQuestion with two options:
   - "Looks good, commit it" — proceed to commit with the generated message
   - "Let me adjust" — let the user provide their own message

5. Based on the user's choice:
   - If approved: stage the relevant files (prefer specific files over `git add -A`) and create the commit
   - If the user provides an adjusted message: use their message instead

6. Show the final commit hash and summary after committing.

Important:
- Do NOT stage `.DS_Store`, `.env`, or other files that should be ignored.
- Do NOT push to remote. Only commit locally.
