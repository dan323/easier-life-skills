# GitHub Projects (v2) Quick Reference

Notes specific to ProjectV2 boards that the `gh-project-sync` skill relies on.
The full GitHub docs are at <https://docs.github.com/en/issues/planning-and-tracking-with-projects>.

## Auth

The `gh` CLI must be authenticated with the `project` and `read:project` scopes:

```bash
gh auth status
gh auth refresh -s project,read:project
```

## Identifiers

A ProjectV2 board has three different ids that matter:

| Id               | Looks like              | Used by                                                          |
|------------------|-------------------------|------------------------------------------------------------------|
| Project node id  | `PVT_kwHO…`             | `gh project item-edit --project-id …`                            |
| Project field id | `PVTSSF_lAHO…`          | `gh project item-edit --field-id …`                              |
| Field option id  | `47fc9ee4` (8-char hex) | `gh project item-edit --single-select-option-id …`               |
| Project item id  | `PVTI_lAHO…`            | Identifies one *card* on the board — what `external_ref` stores  |
| Draft content id | `DI_…`                  | Needed by GraphQL to edit a draft's body, distinct from `PVTI_…` |

The skill resolves the first three once per run via:

```bash
gh project field-list <number> --owner <owner> --format json
```

…then matches the `Status` field by name (case-insensitive) and each
column ("Todo", "In Progress", "Done", "Won't Do") by option name.

## Listing items

```bash
gh project item-list <number> --owner <owner> --limit 1000 --format json
```

Each entry includes:
- `id` — the `PVTI_…` (the *project item* id, NOT the draft's `DI_…`)
- `title`, `body`
- `content` — `{ type: "Issue" | "PullRequest" | "DraftIssue", number, repository, … }`
- field values inline as `status`, `assignees`, `labels`, etc.

The `status` value is the option *name* (e.g. `"Todo"`), not the id.

## Moving a card to a status

```bash
gh project item-edit \
  --project-id <PVT_…> \
  --id <PVTI_…> \
  --field-id <PVTSSF_… for Status> \
  --single-select-option-id <option id for "Done">
```

This works for both linked issues and draft items.

## Editing a draft body

`gh project item-edit` only edits *field values*, not a draft's body or
title. To append text to a draft body, the skill uses GraphQL:

```bash
gh api graphql -f query='
  query($id: ID!) {
    node(id: $id) { ... on ProjectV2Item { content { ... on DraftIssue { id body } } } }
  }' -F id="$PVTI"
```

…then mutates with `updateProjectV2DraftIssue`:

```bash
gh api graphql -f query='
  mutation($id: ID!, $body: String!) {
    updateProjectV2DraftIssue(input: {draftIssueId: $id, body: $body}) {
      draftIssue { id }
    }
  }' -F id="$DI" -F body="$NEW_BODY"
```

For linked issues / PRs, post a comment instead:

```bash
gh issue comment <number> --repo <owner/repo> --body "..."
```

## Status column vocabulary

The skill assumes the standard `Backlog / Todo / In Progress / Done / Won't Do`
columns. If a project uses different names, pass them with
`todo_column=…`, `in_review_column=…`, `done_column=…`,
`wont_do_column=…` arguments — these are matched case-insensitively
against the option names.

Note that the skill **never moves a card to `Done`**. A `task-agent`
completion only means a PR is open for human review, so the forward
motion the skill performs is `Todo → In Progress` (configurable via
`in_review_column=`). `Done` is exclusively a human action; the
skill's only interaction with the `Done` column is reading it
(presence there = drop the entry from yml).
