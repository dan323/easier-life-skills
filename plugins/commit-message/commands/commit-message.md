---
description: Generate a conventional commit message (feat/fix/chore…) from the staged diff — prints it or copies it to the clipboard; never commits
argument-hint: [--copy] [--scope <name>] [--issue <n>]
allowed-tools: Bash(git:*), Bash(clip:*), Bash(pbcopy:*), Bash(xclip:*), Bash(wl-copy:*)
category: productivity
---

# /commit-message

Write a [Conventional Commits](https://www.conventionalcommits.org/) message for
the changes currently staged in git. This command only reads the repository: it
never stages, commits, amends or otherwise modifies it.

Arguments passed by the user: `$ARGUMENTS`

- `--copy` copies the message to the system clipboard in addition to printing it.
- `--scope <name>` forces the scope instead of inferring one.
- `--issue <n>` adds a `Fixes #<n>` footer.

## 1. Read the staged changes

```bash
git rev-parse --is-inside-work-tree
git diff --cached --stat
git diff --cached
git log -n 10 --format=%s
```

- Not a git repo → stop and say so.
- Nothing staged → stop and tell the user to `git add` first. If there are unstaged changes, mention that they exist, but do not stage them and do not describe them.
- A very large diff (thousands of lines): rely on `--stat` plus the most significant hunks; skip lockfiles, generated files and vendored code when describing intent.

The recent subjects show the repository's own habits (scope names, casing,
issue-reference style). Follow them where they do not conflict with the format below.

## 2. Pick the type

Choose exactly one, by the *primary intent* of the whole staged change:

| Type | Use for |
|------|---------|
| `feat` | new user-visible capability |
| `fix` | bug fix |
| `docs` | documentation only |
| `refactor` | restructuring with no behaviour change |
| `perf` | performance improvement |
| `test` | adding or fixing tests only |
| `build` / `ci` | build system, dependencies / CI configuration |
| `chore` | maintenance that fits nothing above |
| `style` | formatting only |

Mixed changes: pick the dominant one. If the diff clearly contains several
unrelated changes, still write one message for it, then add one line after it
suggesting the user split the commit (and into which parts).

## 3. Write the message

```
<type>(<scope>): <subject>

<body>

<footer>
```

- **Scope** — optional; the package, plugin or module touched (from `--scope`, else the recent history's style, else the common top-level directory). Omit it when the change spans unrelated areas.
- **Subject** — imperative mood, lower-case start, no trailing period, at most 72 characters including the prefix.
- **Body** — only when the *why* is not obvious from the subject: wrap at ~72 columns, explain motivation and notable trade-offs, not a file-by-file list. Omit for trivial changes.
- **Footer** — `BREAKING CHANGE: <what and migration>` (and `!` after the type/scope) when the diff removes or changes public behaviour incompatibly; `Fixes #<n>` when `--issue` was given.

Describe only what the staged diff shows. Do not invent motivation, issue
numbers or scopes. **Never put secrets in the message**: if the diff appears to
add a token, key or password, say so in a warning instead of quoting it.

## 4. Output

Print the message alone in a fenced code block so it can be copied as-is, then
at most one short note (split suggestion or secret warning).

With `--copy`, pipe the message to the first available clipboard tool — `clip`
(Windows), `pbcopy` (macOS), `wl-copy` or `xclip -selection clipboard` (Linux) —
and confirm. If none exists, say so and just print it. Pass the message through a
heredoc or stdin; never interpolate it into a shell command line.
