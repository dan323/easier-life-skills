---
name: brainstorm
description: >
  Read the project and suggest the 5 most valuable features or improvements the developer
  could build next. Use when the user asks "what should I build next?", "brainstorm ideas
  for this project", "what features are missing?", "how can I improve this?", "what's worth
  adding?", "give me ideas", or anything about deciding what to work on next. Also use when
  the user seems stuck or is asking for direction on their project.
  TRIGGER this skill whenever the user asks for ideas, suggestions, or "what next" guidance
  about their own codebase — even if they don't say "brainstorm" explicitly.
tools: Bash, Read, Glob, Grep
model: haiku
---

# Brainstorm: Top 5 Ideas for This Project

Read the project, then produce five specific, high-value ideas ranked by impact.
The goal is to surface ideas the developer couldn't easily generate themselves —
insights that come from reading the whole codebase at once and thinking hard about
what it could become, not just what it's missing.

**This skill is read-only.** It produces a report. It does not modify any file.

---

## Investigation

### 1. Understand the project

```bash
cat README.md 2>/dev/null || cat readme.md 2>/dev/null || true
ls -la
cat package.json 2>/dev/null || cat pyproject.toml 2>/dev/null || \
  cat Cargo.toml 2>/dev/null || cat go.mod 2>/dev/null || \
  cat pom.xml 2>/dev/null || cat build.gradle 2>/dev/null || \
  cat build.gradle.kts 2>/dev/null || true
git log --oneline -20 2>/dev/null || true
```

### 2. Read the source

Read the actual code — the core logic, main entry points, and anything that stands out.
You're looking for what the project does, how it does it, and what it leaves undone.

```bash
git ls-files 2>/dev/null || find . -type f \
  ! -path '*/.git/*' ! -path '*/node_modules/*' ! -path '*/__pycache__/*' \
  ! -path '*/dist/*' ! -path '*/build/*' | head -60

grep -rn "TODO\|FIXME\|HACK\|XXX" \
  --include="*.ts" --include="*.js" --include="*.py" --include="*.go" \
  --include="*.rs" --include="*.java" --include="*.kt" --include="*.md" \
  . 2>/dev/null | grep -v "node_modules\|\.git\|dist\|build" | head -30
```

### 3. Think before writing

Work through **three separate lenses**, then combine and rank:

**Technical lens** — what's broken or inefficient?
- What is the most painful limitation a user hits today?
- What's half-done or clearly heading somewhere in the git history?
- What patterns repeat that suggest an unfinished abstraction?

**Product lens** — what would make this more valuable?
- Who actually uses this? What do they want to do that they currently can't?
- What do comparable tools or products in this domain offer that this one doesn't?
- What would unlock a new type of user, or make existing users come back more often?

**Imagination lens** — what would surprise the developer?
- Set the code aside entirely for a moment. If you were a product manager pitching
  this project's roadmap, what would you propose? What's the *obvious next thing*
  from a user's perspective that the code gives no hint of yet?
- This lens must produce at least one idea. The best brainstorms include something
  the developer hadn't thought of — not just what the TODOs already request.

**The Feature / Improvement distinction matters:**
- **Feature** = a new capability the product doesn't have and hasn't planned. Completing
  a TODO comment or implementing a stubbed function is an *Improvement*, not a Feature —
  the developer already decided to do it. A Feature is something additive that wasn't on
  the roadmap.
- **Improvement** = making something that exists work better, faster, or more correctly.

Aim for at least **2 genuine Features** (capabilities not hinted at anywhere in the code)
and **2–3 Improvements**. A pure list of fixes or TODO-completions is not a useful
brainstorm — the developer can find those themselves.

Rank by **value/effort ratio**: a quick win with high impact beats a technically impressive
idea that would take months.

---

## Report Format

```
## Brainstorm: 5 Ideas for {project name}

{One sentence describing what the project is, for context.}

---

### 1. {Title}  ·  {Effort: hours / days / weeks}  ·  {Type: Feature / Improvement}

**What**: {One or two sentences. Specific, not generic — not "add error handling" but
           "replace Optional.get() in BookService with orElseThrow so unknown IDs return
           404 instead of a Java stack trace."}

**Why it matters**: {Concrete impact — for Features: who benefits and what becomes
                     possible; for Improvements: what breaks or degrades today and
                     what gets better.}

**Where to start**: {The specific file, function, or class to touch first. One
                     actionable first step grounded in the actual codebase.}

---

### 2. ...

(repeat for all 5)

---

### Honourable mentions

{2–3 additional ideas in a single sentence each, if there were more worth noting.
 Omit this section if nothing else stands out.}
```

Keep ideas **specific to this project**. Generic advice ("add CI", "write more tests",
"improve documentation") should only appear if there is a concrete, project-specific
reason it belongs in the top 5.
