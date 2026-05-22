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
command -v npm yarn pnpm cargo cargo-audit cargo-outdated pip pip3 pip-audit safety poetry pipenv bundle bundle-audit bundler-audit gem go govulncheck mvn gradle composer local-php-security-checker 2>/dev/null
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

Parse the audit output according to the tool's actual format:
- `npm audit --json` and `pnpm audit --json` emit a single JSON document.
- `yarn audit --json` in Yarn v1 emits newline-delimited JSON (NDJSON): each line is a separate JSON event, not one top-level JSON document. Parse it line by line (or aggregate the per-line JSON objects first), then extract vulnerability information from the relevant audit/advisory events.

For each vulnerability, record:
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

Run the audit against each discovered manifest — do **not** run against the interpreter environment, as that reflects globally installed packages rather than project dependencies:

```bash
# pip-audit against each requirements*.txt found in Phase 1
pip-audit -r <requirements.txt> --format json 2>/dev/null

# pip-audit for Pipfile.lock / pyproject.toml / poetry.lock:
# run in the directory containing the manifest (pip-audit auto-detects these formats)
# e.g. cd <manifest-dir> && pip-audit --format json 2>/dev/null

# safety (legacy) — run against each requirements file
safety check -r <requirements.txt> --json 2>/dev/null
```

Parse JSON output. Record package, installed version, vulnerability ID (CVE or PYSEC), and description.

**Fallback** — parse `requirements*.txt`, `Pipfile.lock`, or `poetry.lock` directly to enumerate declared packages and their pinned versions. Note that no vulnerability check could be performed and list all packages for manual review. Do **not** use `pip list` — it reflects the interpreter environment rather than the project manifests.

### Ruby (bundler)

**Tool available** (`bundler-audit`):

```bash
bundle-audit check --format json 2>/dev/null || bundle audit check 2>/dev/null
```

**Fallback** — parse `Gemfile.lock` for gem names and versions and list them for manual review.

### Go (go modules)

**Tool available** (`govulncheck`):

Run with module writes disabled to prevent `go.sum`/`go.mod` from being modified:

```bash
GOFLAGS=-mod=readonly govulncheck ./... 2>/dev/null
```

If the repo is not tidy (missing sums), `govulncheck` may fail with `-mod=readonly`. In that case, fall back to parsing `go.mod` and `go.sum` directly — do **not** run `go mod tidy` or any command that mutates project files.

**Fallback** — parse `go.sum` or `go.mod` for module paths and versions and list them for manual review. Attempt to detect available updates read-only:

```bash
GOFLAGS=-mod=readonly go list -m -u all 2>/dev/null
```

### Java (Maven / Gradle)

**Tool available**:

The OWASP dependency-check plugin writes its report and NVD data cache to `target/` or `build/` by default, violating this skill's read-only guarantee. Redirect all output to a temporary directory and clean it up afterwards:

```bash
_DC_TMP=$(mktemp -d)

# Maven OWASP dependency-check plugin (if wrapper present)
./mvnw dependency-check:check -DfailBuildOnCVSS=0 \
  -Dodc.reports.dir="$_DC_TMP/reports" \
  -DdataDirectory="$_DC_TMP/nvdcache" \
  -Dformat=JSON 2>/dev/null \
  || mvn dependency-check:check -DfailBuildOnCVSS=0 \
  -Dodc.reports.dir="$_DC_TMP/reports" \
  -DdataDirectory="$_DC_TMP/nvdcache" \
  -Dformat=JSON 2>/dev/null

# Gradle (if wrapper present)
./gradlew dependencyCheckAnalyze \
  -PdependencyCheck.outputDirectory="$_DC_TMP/reports" \
  -PdependencyCheck.dataDirectory="$_DC_TMP/nvdcache" 2>/dev/null \
  || gradle dependencyCheckAnalyze \
  -PdependencyCheck.outputDirectory="$_DC_TMP/reports" \
  -PdependencyCheck.dataDirectory="$_DC_TMP/nvdcache" 2>/dev/null

# Parse JSON report from $_DC_TMP/reports/ then remove the temp dir
rm -rf "$_DC_TMP"
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

Python outdated detection without an installed environment is unreliable: `pip list --outdated` reflects the interpreter environment, not the project manifests, and will produce false results in arbitrary repos where dependencies are not installed.

Instead, use manifest-based detection:

1. Parse pinned versions from each discovered `requirements*.txt`, `Pipfile.lock`, or `pyproject.toml` (poetry).
2. If `pip-audit` supports version comparison for the discovered manifest, check its output for packages where `latest_version` differs from the pinned version:
   ```bash
   pip-audit -r <requirements.txt> --format json 2>/dev/null
   ```
3. If no tool can determine latest versions without an installed environment, list the pinned versions from the manifests in the report and explicitly note that outdated checks for Python could not be performed without an active environment.

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
