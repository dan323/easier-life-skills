---
description: Create a GitHub issue from the current conversation — title, description and labels inferred from what was discussed (wraps gh issue create)
argument-hint: [focus hint] [--repo owner/name] [--yes]
allowed-tools: Bash(gh:*), Bash(git:*)
category: automation
---

# /new-issue

Turn what was discussed in this conversation into a well-formed GitHub issue and
create it with `gh issue create`.

Arguments passed by the user: `$ARGUMENTS`

- Free text in the arguments is a hint about what the issue should focus on. It wins
  over your own reading of the conversation when the two disagree.
- `--repo owner/name` targets that repository instead of the current one.
- `--yes` skips the confirmation step (step 5).

In the commands below, `${REPO:+--repo "$REPO"}` stands for `--repo <owner/name>`
when `--repo` was given and for nothing otherwise; substitute it accordingly.
Shell-quote every value you substitute (title, labels, search words, repo) with
single quotes, escaping any embedded single quote as `'''`, so backticks, `$(...)`
and double quotes in them cannot be interpreted by the shell.

## 1. Check the environment

Run these and stop with a clear message if one fails:

```bash
gh auth status
gh repo view ${REPO:+"$REPO"} --json nameWithOwner,hasIssuesEnabled -q '.nameWithOwner + " " + (.hasIssuesEnabled|tostring)'
```

- `gh` missing or not logged in → tell the user to install it / run `gh auth login`. Do not fall back to the REST API with a hand-made token.
- Not inside a git repo and no `--repo` given → ask which repository to use.
- `hasIssuesEnabled` is `false` → stop; the repository does not accept issues.

## 2. Distil the conversation

Read the conversation so far (not the repository) and decide what the issue is
about. If the conversation covers several unrelated topics, pick the one the
argument hint points to; with no hint, pick the most recent unresolved one and
mention the others in your summary to the user, without filing them.

Classify the issue as one of `bug`, `enhancement`, `documentation`, `question`
or `task`, and draft:

- **Title** — one imperative or descriptive line, at most ~72 characters, no
  trailing period, no `[Bug]`-style prefix (labels carry the type).
- **Body** — Markdown, only with sections that have real content:
  - *Summary* — two or three sentences.
  - *Context* — what was being done when it came up.
  - For a bug: *Steps to reproduce*, *Expected*, *Actual* (quote error output in
    fenced code blocks, trimmed to the relevant lines).
  - For an enhancement: *Proposal* and *Acceptance criteria* as a checklist.
  - *References* — files as `path/to/file.ts:42`, commits, PRs or links that were
    mentioned.

Write only what the conversation supports. Do not invent reproduction steps,
versions or file paths. If something important is unknown, say so in the body
("Version: not determined") rather than guessing.

**Never copy secrets into the issue.** Strip tokens, passwords, API keys, private
URLs with credentials, and personal data (emails, home-directory user names) from
anything you quote. Issues on public repositories are public.

## 3. Infer labels from the repository's own label set

```bash
gh label list ${REPO:+--repo "$REPO"} --limit 200 --json name,description
```

Choose labels **only from that list** — never create labels. Map the issue type
to the closest existing label (`bug`, `enhancement`/`feature`, `documentation`/`docs`,
`question`), and add area labels when one clearly matches what was discussed (for
example an `installer` label when the issue is about the installer). Prefer 1–3
labels. If nothing fits, use no label.

## 4. Check for duplicates

```bash
gh issue list ${REPO:+--repo "$REPO"} --state open --search "<2-4 key words from the title>" --limit 10 --json number,title,url
```

If an open issue already covers the same problem, show it to the user and ask
whether to comment on it instead (`gh issue comment <issue-url> --body-file -`,
using the duplicate's full URL so it cannot resolve to a same-numbered issue in
another repository),
create a new issue anyway, or cancel. Do not create a duplicate silently — this
also applies with `--yes`.

## 5. Confirm

Unless `--yes` was given, show the target repository, title, labels and body, and
ask the user to confirm or edit. Apply any edits they ask for before creating.

## 6. Create the issue

Write the body to a temporary file so Markdown, quotes and backticks survive the
shell unchanged, then create the issue. Use a heredoc delimiter that does not
occur as a line in the body (the random-looking one below; pick another if the
body contains it), otherwise the body would end early and the rest would run as
shell commands:

```bash
BODY_FILE="$(mktemp)"
cat > "$BODY_FILE" <<'ISSUE_BODY_7f3a9c'
<body>
ISSUE_BODY_7f3a9c
gh issue create ${REPO:+--repo "$REPO"} --title '<title>' --body-file "$BODY_FILE" --label '<label1>' --label '<label2>'
STATUS=$?
```

Omit `--label` entirely when no labels were chosen. If the command fails because
of a label (for example it was deleted in the meantime), retry once with the same
`$BODY_FILE` and without that label, and tell the user. Only after the creation
(or the retry) has finished, run `rm -f "$BODY_FILE"` and report failure if
`STATUS` was non-zero and the retry did not succeed.

## 7. Report

Reply with the issue URL printed by `gh issue create`, the title and the labels
applied. Nothing else in the repository is changed by this command.
