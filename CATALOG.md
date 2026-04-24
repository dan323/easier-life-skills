# easier-life-skills — Skill Catalog

> 7 skills · Last updated: 2026-04-24

Install the marketplace: `/plugin marketplace add dan323/easier-life-skills`

---

## By Category

### Automation (1)

| Skill                                                         | What it does                                                               | Read-only | Install                                         |
|---------------------------------------------------------------|----------------------------------------------------------------------------|-----------|-------------------------------------------------|
| [`task-agent`](plugins/task-agent/skills/task-agent/SKILL.md) | Read tasks from agent-tasks.yml, implement each via an agent, and open PRs |           | `/plugin install task-agent@easier-life-skills` |

### Code Quality (3)

| Skill                                                                                             | What it does                                                            | Read-only | Install                                                     |
|---------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|-----------|-------------------------------------------------------------|
| [`find-breaking-rest-api`](plugins/find-breaking-rest-api/skills/find-breaking-rest-api/SKILL.md) | Find breaking changes in REST APIs by analyzing git history             | ✓         | `/plugin install find-breaking-rest-api@easier-life-skills` |
| [`find-dead-code`](plugins/find-dead-code/skills/find-dead-code/SKILL.md)                         | Find unused functions, classes, variables, and imports across languages | ✓         | `/plugin install find-dead-code@easier-life-skills`         |
| [`improve-logging`](plugins/improve-logging/skills/improve-logging/SKILL.md)                      | Audit logging quality and produce prioritized fix recommendations       | ✓         | `/plugin install improve-logging@easier-life-skills`        |

### Documentation (2)

| Skill                                                                           | What it does                                                            | Read-only | Install                                               |
|---------------------------------------------------------------------------------|-------------------------------------------------------------------------|-----------|-------------------------------------------------------|
| [`changelog`](plugins/changelog/skills/changelog/SKILL.md)                      | Generate or update CHANGELOG.md from git history                        |           | `/plugin install changelog@easier-life-skills`        |
| [`document-project`](plugins/document-project/skills/document-project/SKILL.md) | Create or improve project documentation with README and /docs structure |           | `/plugin install document-project@easier-life-skills` |

### Productivity (1)

| Skill                                                         | What it does                                                            | Read-only | Install                                         |
|---------------------------------------------------------------|-------------------------------------------------------------------------|-----------|-------------------------------------------------|
| [`brainstorm`](plugins/brainstorm/skills/brainstorm/SKILL.md) | Suggest the 5 most valuable next features or improvements for a project | ✓         | `/plugin install brainstorm@easier-life-skills` |

---

## By Bundle

### Backend Developer

_API compatibility, code hygiene, observability, and release docs_

```
/plugin install find-breaking-rest-api@easier-life-skills
/plugin install find-dead-code@easier-life-skills
/plugin install improve-logging@easier-life-skills
/plugin install changelog@easier-life-skills
```

### Open Source Maintainer

_Docs, release notes, roadmap decisions, and skill discovery_

```
/plugin install changelog@easier-life-skills
/plugin install document-project@easier-life-skills
/plugin install brainstorm@easier-life-skills
/plugin install find-skills@easier-life-skills
```

### Code Quality Reviewer

_Read-only analysis skills for code review and CI gating_

```
/plugin install find-dead-code@easier-life-skills
/plugin install improve-logging@easier-life-skills
/plugin install find-breaking-rest-api@easier-life-skills
```

### Full Stack

_All skills — for solo developers and small teams_

```
/plugin install brainstorm@easier-life-skills
/plugin install changelog@easier-life-skills
/plugin install document-project@easier-life-skills
/plugin install find-breaking-rest-api@easier-life-skills
/plugin install find-dead-code@easier-life-skills
/plugin install find-skills@easier-life-skills
/plugin install improve-logging@easier-life-skills
/plugin install task-agent@easier-life-skills
```
