---
name: find-skills
description: >
  Analyze the active repository and find Claude Code skills from known marketplaces
  that would be useful for this project. Use when the user asks "what skills are useful
  for this project?", "find skills for my repo", "what plugins should I install?",
  "are there any skills for this?", or "recommend skills". Optionally searches online
  if the user explicitly includes "online" or "search the web" in their request.
tools: Bash, Read, Glob, Grep, WebSearch
---

# Find Skills

Analyze the active repository, then find and recommend Claude Code skills from known
marketplaces that would be valuable for this project.

**This skill is read-only.** It produces a recommendation report. It does not install
anything or modify any file.

---

## Phase 1: Determine Search Mode

Check the user's prompt for an explicit instruction to search online.
Search online **only** if the prompt contains one of:
- "online"
- "search the web"
- "search online"
- "web search"
- "internet"

Default is **offline only** — local marketplace catalogs and known marketplace URLs only.

---

## Phase 2: Understand the Repository

Gather enough context to judge skill relevance. Run all of these in parallel:

```bash
# Project identity
cat README.md 2>/dev/null | head -60 || true
cat package.json 2>/dev/null || cat pyproject.toml 2>/dev/null || \
  cat Cargo.toml 2>/dev/null || cat go.mod 2>/dev/null || \
  cat pom.xml 2>/dev/null || cat build.gradle.kts 2>/dev/null || \
  cat build.gradle 2>/dev/null || true

# Languages present
find . -maxdepth 4 \
  -not -path "*/.git/*" -not -path "*/node_modules/*" \
  -not -path "*/vendor/*" -not -path "*/.venv/*" -not -path "*/dist/*" \
  \( -name "*.java" -o -name "*.kt" -o -name "*.py" -o -name "*.js" \
     -o -name "*.ts" -o -name "*.tsx" -o -name "*.go" -o -name "*.rs" \
     -o -name "*.cs" -o -name "*.rb" -o -name "*.php" \) \
  | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -10

# Framework signals
grep -rl "spring\|django\|fastapi\|flask\|express\|nestjs\|rails\|laravel\|gin\|axum" \
  --include="*.json" --include="*.toml" --include="*.gradle" --include="*.xml" \
  . 2>/dev/null | head -10 || true

# REST API signals
grep -rl "@RestController\|@Router\|app\.route\|router\.\(get\|post\|put\|delete\)\|@Controller\|@RequestMapping\|FastAPI\|express()" \
  --include="*.java" --include="*.kt" --include="*.py" --include="*.ts" \
  --include="*.js" . 2>/dev/null | head -5 || true

# CI/CD and automation signals
ls -la .github/workflows/ 2>/dev/null || true
ls -la .gitlab-ci.yml Jenkinsfile Makefile 2>/dev/null || true

# Git history activity
git log --oneline -20 2>/dev/null || true

# Existing installed skills / plugins
cat ~/.claude/settings.json 2>/dev/null | grep -A5 '"skills"\|"plugins"' || true
ls ~/.claude/plugins/ 2>/dev/null || true

# CHANGELOG presence
ls -la CHANGELOG.md CHANGELOG.rst changelog.md 2>/dev/null || true

# Docs presence
ls -la README.md docs/ 2>/dev/null || true

# Logging patterns
grep -rl "log\.\(info\|debug\|error\|warn\)\|logger\.\|logging\." \
  --include="*.java" --include="*.kt" --include="*.py" --include="*.ts" \
  --include="*.js" --include="*.go" . 2>/dev/null | wc -l || echo "0"
```

Build an internal profile of the project:
- Primary language(s)
- Framework(s) detected
- Whether it has REST APIs
- Whether it has CI/CD
- Whether CHANGELOG.md exists
- Whether docs exist and are complete
- Logging coverage (rough count)
- Project size and complexity
- **Project purpose and domain** — infer from the README, package description, folder names,
  and file content what the project *does*. Examples: "a CLI tool for managing deployments",
  "a machine learning pipeline for image classification", "an e-commerce backend", "a developer
  tool for code analysis". This is distinct from the tech stack and must be stated explicitly
  in your internal profile. It determines which non-technical skills (e.g. brainstorming,
  documentation, changelog generation) are relevant, and can surface skills whose value comes
  from the project's *purpose* rather than its implementation details.

---

## Phase 3: Load Known Marketplaces

Always check these known marketplace catalogs (fetch the catalog, do not install):

### Marketplace 1 — easier-life-skills (dan323)

This is the primary known marketplace. Read its catalog:

```bash
# Check if it is installed locally
cat ~/.claude/plugins/easier-life-skills/.claude-plugin/marketplace.json 2>/dev/null || true
```

If not found locally, use the WebFetch tool to fetch the raw catalog from:
`https://raw.githubusercontent.com/dan323/easier-life-skills/master/.claude-plugin/marketplace.json`

The catalog lists every available plugin with its name, description, category, and keywords.
Use it to build the candidate pool.

### Local marketplace index

```bash
# Check if there are other marketplaces registered locally
cat ~/.claude/settings.json 2>/dev/null | grep -A20 '"marketplaces"\|"pluginSources"' || true
find ~/.claude/plugins -name "marketplace.json" 2>/dev/null | head -10 || true
```

Load any additional marketplace catalogs found.

---

## Phase 4: Online Search (only if explicitly requested)

**Skip this phase entirely if the user did NOT explicitly request an online search.**

If online search is requested, use WebSearch to find additional Claude Code skill marketplaces
and individual skills relevant to the project's domain:

Search queries to run (adapt to the project's detected domain):
- `"claude code" skill plugin marketplace {primary_language}`
- `"claude code" skill plugin {framework_name}` (for each detected framework)
- `site:github.com "claude-plugin" "SKILL.md" {domain_keyword}`

For each GitHub repository found:
- Check for a `.claude-plugin/marketplace.json` or individual `SKILL.md` files
- Extract skill name, description, and install instructions
- Add to the candidate pool

---

## Phase 5: Match Skills to the Project

For each skill in the candidate pool, score its relevance to this project.
A skill is **relevant** if it solves a real problem this project has *right now*,
not hypothetically.

### Scoring heuristics

#### Technical signals

| Condition                                                                                        | Boost     |
|--------------------------------------------------------------------------------------------------|-----------|
| Project has no CHANGELOG and skill generates one                                                 | High      |
| Project has REST APIs and skill finds breaking changes                                           | High      |
| Project has no docs / minimal README and skill creates docs                                      | High      |
| Project has significant logging gaps and skill audits logging                                    | High      |
| Project has CI/automated tasks and skill automates agent tasks                                   | Medium    |
| Project has dead code indicators (large old codebase, private methods) and skill finds dead code | Medium    |
| Skill's keywords overlap with detected frameworks/languages                                      | Low boost |

#### Purpose and domain signals

Match skills based on what the project *is for*, not just how it is built.
Read each skill's catalog description as a value proposition and ask: does this deliver
value to someone working on *this kind of project*?

| Condition                                                                                                  | Boost                         |
|------------------------------------------------------------------------------------------------------------|-------------------------------|
| Project is a developer tool / SDK / library — consumers need clear docs                                    | High for documentation skills |
| Project is in active development with unclear direction or early stage — brainstorming is high value       | High for brainstorm skill     |
| Project is a public-facing product with versioned releases — changelog matters for external consumers      | High for changelog skill      |
| Project is a data pipeline / ML / batch processing system — observability and logging quality are critical | High for logging skills       |
| Project is a large, long-lived codebase with multiple contributors — dead code accumulates faster          | Higher for dead-code skills   |
| Skill's description explicitly addresses the project's domain (e.g. "REST API" skill for a REST service)   | Medium–High                   |
| Skill solves a workflow problem the project's maintainers would face given its stated purpose              | Medium                        |

### Irrelevance signals (exclude or rank last)

- Skill already installed (found in `~/.claude/plugins`)
- Skill addresses a domain not present in this repo (e.g. REST-breaking-changes skill for a CLI with no HTTP layer)
- Skill's purpose is fully covered by an already-installed skill

---

## Phase 6: Output Report

Always produce the report in the format below, sorted by relevance (most relevant first).
Show at most **7 skills**. If fewer than 3 are genuinely relevant, say so honestly rather
than padding with low-relevance suggestions.

```
## Skill Recommendations for {project name}

{One sentence describing the project, for context.}

---

### Recommended Skills

#### 1. {skill-name}  ·  {marketplace-name}  ·  Relevance: High / Medium / Low

**What it does**: {One sentence from the catalog description.}

**Why it fits this project**: {Specific reason grounded in what was observed in the repo.
  May reference technical signals ("your project has 18 REST endpoints but no CHANGELOG.md")
  OR purpose/domain signals ("as a public SDK, consumers depend on versioned release notes").
  Never generic — "Could be useful for API projects" is not acceptable.}

**Install**:
\`\`\`
/plugin marketplace add {marketplace-owner}/{marketplace-name}
/plugin install {skill-name}@{marketplace-name}
\`\`\`

---

#### 2. ...

(repeat for each recommended skill)

---

### Skills Checked but Not Recommended

| Skill | Reason skipped |
|---|---|
| {skill-name} | {One-line reason — e.g. "Already installed", "No REST APIs detected", "Docs already complete"} |

---

### Marketplaces Searched

- easier-life-skills (dan323) — {N} skills checked
{- any additional marketplaces found}
{- Online search: {N} results checked}  ← only if online mode was used

---

_To install any skill above, copy the install commands. Skills are read-only analysis tools
unless their description says otherwise._
```

### If no skills are relevant

```
## Skill Recommendations for {project name}

No skills from the checked marketplaces are a strong fit for this project right now.

**Checked marketplaces**: easier-life-skills (dan323) — {N} skills reviewed

**Reason**: {Brief explanation — e.g. "All available skills target domains not present in
this repo (REST APIs, logging, documentation), and your project is already well-covered
in those areas."}

Consider running `/find-skills online` to search for additional skill marketplaces.
```
