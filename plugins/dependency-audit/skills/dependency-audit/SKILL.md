---
name: dependency-audit
description: >
  Scan all dependencies for outdated versions and known security vulnerabilities.
  Uses npm audit / pip-audit / cargo audit / bundler-audit with grep-based fallbacks
  when dedicated tools are unavailable. Produces a prioritised, read-only report.
  Use when the user asks to "audit dependencies", "check for vulnerabilities",
  "find outdated packages", "run a dependency audit", "check npm audit",
  "scan for CVEs in dependencies", or anything about dependency security or freshness.
tools: Bash, PowerShell, Read, Glob, Grep, TaskCreate, TaskUpdate
model: sonnet
---

# Dependency Audit

Scan every dependency manifest in the current project for:
1. **Known security vulnerabilities** — CVE / advisory database hits reported by the ecosystem's native audit tool.
2. **Outdated versions** — packages where a newer stable release exists.

Produce a single, prioritised, read-only report. Never modify `package.json`, `Cargo.toml`, lock files, or any other project file.

**This skill is read-only.** It reports findings. It does not install, upgrade, or patch anything.

---

## Task Tracking

Before doing any work, call `TaskCreate` for each phase below. Call `TaskUpdate` (status `in_progress`) when you begin a phase and `TaskUpdate` (status `completed`) when you finish it.

- Detect ecosystems and manifests
- Run vulnerability audits
- Check for outdated packages
- Consolidate and rank findings
- Write report

---

## Phase 1 — Detect Ecosystems and Manifests

Search the project root (and up to 3 levels deep) for known dependency manifests:

```bash
find . -maxdepth 3 \
  -not -path "*/.git/*" \
  -not -path "*/node_modules/*" \
  -not -path "*/.venv/*" \
  -not -path "*/vendor/*" \
  \( \
    -name "package.json" \
    -o -name "Cargo.toml" \
    -o -name "requirements*.txt" \
    -o -name "pyproject.toml" \
    -o -name "Pipfile" \
    -o -name "Gemfile" \
    -o -name "go.mod" \
    -o -name "pom.xml" \
    -o -name "build.gradle" \
    -o -name "build.gradle.kts" \
    -o -name "composer.json" \
  \) | sort
```

For each manifest found, identify:
- **Ecosystem**: Node.js / Rust / Python / Ruby / Go / Java (Maven or Gradle) / PHP
- **Package manager**: npm / yarn / pnpm / cargo / pip / poetry / pipenv / bundler / go modules / maven / gradle / composer
- **Lock file present?**: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `poetry.lock`, `Pipfile.lock`, `Gemfile.lock`, `go.sum`

Skip `package.json` files found inside `node_modules/`.

Check which audit tools are installed:

```bash
command -v npm yarn pnpm cargo pip pip3 pip-audit poetry pipenv bundle gem go mvn gradle composer 2>/dev/null
```

---

## Phase 2 — Run Vulnerability Audits

For each detected ecosystem, run its native audit tool if available. Fall back to advisory-database grep when the tool is absent. Run ecosystems in parallel where possible.

### Node.js (npm / yarn / pnpm)

**Tool available** — run inside each directory containing a `package.json`:

```bash
# npm
npm audit --json 2>/dev/null

# yarn v1
yarn audit --json 2>/dev/null

# pnpm
pnpm audit --json 2>/dev/null
```

Parse the JSON output. For each vulnerability, record:
- Package name
- Installed version
- Severity (`critical` / `high` / `moderate` / `low` / `info`)
- CVE or advisory ID (if present)
- One-line description

**Fallback (no npm/yarn/pnpm)** — read `package-lock.json` or `yarn.lock`, extract package names and versions, then check against the [npm advisory API](https://registry.npmjs.org/-/npm/v1/security/advisories/bulk) using `curl` if available. If `curl` is unavailable, note that no vulnerability check could be performed and list all direct dependencies with their pinned versions for manual review.

### Rust (cargo)

**Tool available**:

```bash
cargo audit --json 2>/dev/null
```

Parse `vulnerabilities.list[]` from the JSON output. Record package, version, RUSTSEC ID, and title.

**Fallback** — parse `Cargo.lock` for package names and versions. Cross-reference with the RustSec advisory database RSS feed via `curl https://rustsec.org/feed.xml` if network access is available; otherwise list all crate versions for manual review.

### Python (pip / poetry / pipenv)

**Tool available** (`pip-audit` preferred, then `safety`):

```bash
# pip-audit
pip-audit --format json 2>/dev/null

# safety (legacy)
safety check --json 2>/dev/null
```

Parse JSON output. Record package, installed version, vulnerability ID (CVE or PYSEC), and description.

**Fallback** — use `pip list --format json` (or parse `requirements*.txt` / `Pipfile.lock` / `poetry.lock`) to enumerate installed packages. Note that no vulnerability check could be performed and list all packages for manual review.

### Ruby (bundler)

**Tool available** (`bundler-audit`):

```bash
bundle-audit check --format json 2>/dev/null || bundle audit check 2>/dev/null
```

**Fallback** — parse `Gemfile.lock` for gem names and versions and list them for manual review.

### Go (go modules)

**Tool available** (`govulncheck`):

```bash
govulncheck ./... 2>/dev/null
```

**Fallback** — parse `go.sum` or `go.mod` for module paths and versions. Attempt `go list -m -u all 2>/dev/null` to detect available updates.

### Java (Maven / Gradle)

**Tool available**:

```bash
# Maven OWASP dependency-check plugin (if wrapper present)
./mvnw dependency-check:check -DfailBuildOnCVSS=0 2>/dev/null \
  || mvn dependency-check:check -DfailBuildOnCVSS=0 2>/dev/null

# Gradle (if wrapper present)
./gradlew dependencyCheckAnalyze 2>/dev/null \
  || gradle dependencyCheckAnalyze 2>/dev/null
```

**Fallback** — parse `pom.xml` or `build.gradle` for declared dependency coordinates and list them for manual review.

### PHP (Composer)

**Tool available** (`local-php-security-checker` or `composer audit`):

```bash
composer audit --format json 2>/dev/null \
  || local-php-security-checker 2>/dev/null
```

**Fallback** — parse `composer.lock` for package names and versions and list them for manual review.

---

## Phase 3 — Check for Outdated Packages

For each ecosystem where an "outdated" check is cheap and non-destructive, run it.

### Node.js

```bash
npm outdated --json 2>/dev/null
# or
yarn outdated --json 2>/dev/null
```

Record: package, current, wanted (latest compatible per semver), latest.

### Rust

```bash
cargo outdated --format json 2>/dev/null
```

If `cargo-outdated` is not installed, skip — do not attempt to install it.

### Python

```bash
pip list --outdated --format json 2>/dev/null
```

### Ruby

```bash
bundle outdated --parseable 2>/dev/null
```

### Go

```bash
go list -m -u all 2>/dev/null
```

Parse lines with `[v...]` indicating available updates.

### Java / PHP

Skip outdated checks — these ecosystems do not have a cheap single-command equivalent. Note the omission in the report.

---

## Phase 4 — Consolidate and Rank Findings

Merge vulnerability and outdated results across all ecosystems.

### Severity ranking (high to low)

1. **Critical** — CVSS ≥ 9.0 or tool-reported `critical`
2. **High** — CVSS 7.0–8.9 or tool-reported `high`
3. **Moderate / Medium** — CVSS 4.0–6.9
4. **Low** — CVSS < 4.0
5. **Outdated (no CVE)** — newer version available but no known vulnerability

Deduplicate: if the same package appears in both vulnerability and outdated lists, merge into one entry (mark it as both vulnerable AND outdated).

---

## Phase 5 — Write Report

Print the report to stdout in Markdown. Do **not** write any files.

```
# Dependency Audit Report

**Date:** YYYY-MM-DD
**Project:** <root directory name or package.json#name>
**Ecosystems scanned:** <list>
**Tools used:** <list of tools that were available; note fallbacks>

---

## Summary

| Severity  | Count |
|-----------|-------|
| Critical  | N     |
| High      | N     |
| Moderate  | N     |
| Low       | N     |
| Outdated  | N     |
| **Total** | N     |

---

## Vulnerabilities

### Critical

#### <package-name> <version> (<ecosystem>)
- **Advisory:** <CVE-YYYY-XXXX or RUSTSEC-YYYY-XXXX or GHSA-...>
- **Description:** <one-line summary>
- **Fix:** Upgrade to <fixed version> (or: no fix available as of <date>)

... (repeat for each critical finding) ...

### High
... (same format) ...

### Moderate / Low
... (same format) ...

---

## Outdated Packages (no known vulnerability)

| Ecosystem | Package | Current | Latest | Notes |
|-----------|---------|---------|--------|-------|
| Node.js   | lodash  | 4.17.19 | 4.17.21 | patch — safe to upgrade |
| ...       | ...     | ...     | ...    | ...   |

---

## Fallbacks and Limitations

List any ecosystem where the dedicated audit tool was unavailable and what fallback (if any) was used. If no check could be performed, say so explicitly.

---

## Recommended Actions

1. **Immediate (Critical/High):** <specific upgrades>
2. **Scheduled (Moderate/Outdated):** <specific upgrades>
3. **Manual review:** <any packages where the fallback path was used and results are uncertain>
```

If no vulnerabilities are found, say so clearly and list the ecosystems that were scanned cleanly.

---

## Rules

- **Read-only.** Never run `npm install`, `cargo update`, `pip install`, `bundle update`, or any command that modifies the project or its lock files.
- **Graceful degradation.** If a tool is missing, use the fallback and document it. Never abort the skill because one tool is absent.
- **Monorepo-aware.** Scan every manifest found in Phase 1 — not just the root.
- **No false positives from dev-only packages.** If the audit tool distinguishes `devDependencies` from production dependencies, note which findings affect production vs. dev-only packages.
- **Idempotent.** Running the skill twice produces the same report (assuming no upstream changes).
