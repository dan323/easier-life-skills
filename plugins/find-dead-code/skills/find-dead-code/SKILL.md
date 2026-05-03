---
name: find-dead-code
description: Find unused code — functions, classes, variables, imports, constants, types, and more. Use when the user asks to "find dead code", "find unused code", "clean up unused imports", "find unreachable code", or "find what can be deleted". Accounts for dependency injection frameworks (Spring, CDI, NestJS, Angular, etc.) to avoid false positives.
tools: Bash, Read, Glob, Grep
model: haiku
metadata:
   version: 1.0
---

# Find Dead Code

Identify code that is defined but never used: functions, classes, methods, variables, constants, types, imports, and exports. Reports candidates with file and line number. Accounts for patterns that make code appear unused but are actually invoked at runtime (dependency injection, reflection, serialization, entry points, decorators).

**This skill is read-only.** It produces a report. It does not delete or modify any file.

## Phase 1: Detect Languages and Tooling

```bash
# Identify languages present
find . -maxdepth 4 -not -path "*/.git/*" -not -path "*/node_modules/*" \
  -not -path "*/vendor/*" -not -path "*/.venv/*" \
  -name "*.java" -o -name "*.kt" -o -name "*.py" -o -name "*.js" \
  -o -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.go" \
  -o -name "*.rs" -o -name "*.cs" -o -name "*.rb" -o -name "*.php" \
  | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -10

# Check for installed static analysis tools
command -v deadcode rg eslint tsc pyflakes vulture jdeps 2>/dev/null
```

Detect the primary language(s) and check which dedicated tools are available. Use dedicated tools when available (they are more accurate than grep). Fall back to grep-based analysis when tools are absent. Run both in parallel when possible and merge results.

## Phase 2: Identify Safe Symbols (Never Flag These)

Before scanning for dead code, build a list of symbols that must never be reported, regardless of whether they appear to have no callers.

### Universal safe patterns

- **Entry points**: `main`, `Main`, `__main__`, `run`, `App`, `Application`, top-level script bodies.
- **Public API of a library**: any exported symbol in a package intended for external consumers. Infer from the presence of a `package.json` `"main"`/`"exports"` field, a `__init__.py` with `__all__`, a `pub` item in a crate, or a `public` method in a non-`internal` package.
- **Test helpers**: functions only called from test files are not dead — they serve the test suite. Exclude files matching `*_test.go`, `*.test.ts`, `*.spec.*`, `test_*.py`, `*Test.java`, etc.
- **Lifecycle callbacks**: `setUp`, `tearDown`, `beforeEach`, `afterEach`, `componentDidMount`, `ngOnInit`, `onCreate`, `onDestroy`, etc.
- **Serialisation targets**: any class/struct that is read from or written to JSON, XML, YAML, or a database ORM (fields may only be accessed via reflection).
- **Event handlers and callbacks registered by name**: handler functions passed as strings to frameworks.

### Framework-specific safe patterns — Dependency Injection

Flag any symbol annotated with (or matched by) the patterns below as **injection-managed** and exclude it from the dead code report.

#### Java / Kotlin — Spring

```
@Component, @Service, @Repository, @Controller, @RestController
@Bean, @Configuration, @Aspect
@Autowired, @Inject, @Value, @Qualifier
@EventListener, @Scheduled, @KafkaListener, @RabbitListener
@Entity, @MappedSuperclass, @Embeddable   ← JPA / Hibernate
@RequestMapping, @GetMapping, @PostMapping, @PutMapping,
@DeleteMapping, @PatchMapping             ← endpoint methods
```

```bash
grep -rn "@Component\|@Service\|@Repository\|@Controller\|@Bean\|@Autowired\|@Inject\|@Scheduled\|@EventListener\|@Entity\|@Mapping" \
  --include="*.java" --include="*.kt" .
```

#### Java / Kotlin — CDI (Jakarta EE)

```
@ApplicationScoped, @RequestScoped, @SessionScoped, @Dependent
@Named, @Produces, @Inject, @Observes
```

#### TypeScript / JavaScript — NestJS

```
@Injectable(), @Controller(), @Module()
@Get(), @Post(), @Put(), @Delete(), @Patch()
@Guard(), @Interceptor(), @Pipe(), @Middleware()
```

#### TypeScript / JavaScript — Angular

```
@Component(), @Directive(), @Pipe(), @Injectable()
@NgModule(), @Input(), @Output(), @HostListener()
```

#### Python — Flask / FastAPI / Django

```python
@app.route(...)        # Flask
@router.get(...)       # FastAPI
# Django: any class in views.py, models.py, admin.py, forms.py, serializers.py
# Django signals: receiver(signal)
```

#### C# — ASP.NET / Dependency Injection

```
[ApiController], [Route(...)], [HttpGet], [HttpPost]
[Service], [Inject]
Any class registered in Startup.cs / Program.cs via AddSingleton / AddScoped / AddTransient
```

#### Ruby — Rails

```ruby
# Any method in ApplicationController subclasses (routed actions)
# Any method in ActiveRecord models called by associations or callbacks
# before_action, after_action, around_action targets
# ActiveJob: perform method
```

If any DI framework is detected, add a section to the final report that lists the framework(s) found and the patterns used to exclude injection-managed code.

## Phase 3: Language-Specific Analysis

Run the appropriate strategy per detected language. For multi-language projects, run all relevant strategies.

---

### Python

**Preferred tool (if available):**

```bash
vulture . --min-confidence 60
```

**Grep fallback:**

```bash
# Collect all definitions
grep -rn "^\s*def \|^\s*class \|^\s*[A-Z_]\+\s*=" \
  --include="*.py" . > /tmp/py_defs.txt

# For each defined name, check if it appears elsewhere
# (subtract definition lines from total occurrences)
```

Key false-positive sources to exclude:
- `__init__`, `__str__`, `__repr__`, `__len__`, `__eq__`, and all other dunder methods.
- Any name listed in `__all__`.
- Pytest fixtures (functions decorated with `@pytest.fixture`).
- Click / Typer commands (`@cli.command()`, `@app.command()`).

---

### JavaScript / TypeScript

**Preferred tool (if available):**

```bash
# TypeScript: unused locals/parameters
tsc --noEmit --noUnusedLocals --noUnusedParameters 2>&1

# ESLint with no-unused-vars
npx eslint . --rule '{"no-unused-vars": "error"}' 2>&1
```

**Grep fallback — imports:**

```bash
# Find all named imports
grep -rn "^import {" --include="*.ts" --include="*.tsx" \
  --include="*.js" --include="*.jsx" .

# For each imported name, count usages outside the import line
```

**Grep fallback — exports:**

```bash
# Find all exported symbols
grep -rn "^export \(function\|class\|const\|let\|var\|type\|interface\|enum\)" \
  --include="*.ts" --include="*.tsx" .
```

Key false-positive sources to exclude:
- Re-exports (`export { X } from './y'`) — X may be used by consumers.
- Default exports (harder to trace by name).
- Anything referenced in `index.ts` / `index.js` barrel files.
- Types and interfaces used only in type positions (still useful for documentation).
- `declare` statements in `.d.ts` files.

---

### Java / Kotlin

**Preferred tool (if available):**

```bash
# IntelliJ inspections via CLI (if configured)
# Or: PMD unused code rules
pmd check -d src -R category/java/bestpractices.xml/UnusedPrivateMethod,\
category/java/bestpractices.xml/UnusedPrivateField,\
category/java/bestpractices.xml/UnusedFormalParameter 2>&1
```

**Grep fallback:**

```bash
# Private methods — safest to flag (not accessible outside the class)
grep -rn "private\s\+\(static\s\+\)\?\w\+\s\+\w\+\s*(" \
  --include="*.java" .

# Private fields
grep -rn "private\s\+\(static\s\+\)\?\(final\s\+\)\?\w\+\s\+\w\+\s*[;=]" \
  --include="*.java" .

# Unused imports
grep -rn "^import " --include="*.java" .
```

**Confidence tiers for Java:**
- **High confidence (safe to flag)**: `private` methods and fields with no references in the same file.
- **Medium confidence**: package-private (`default`) symbols not referenced in the same package.
- **Low confidence / do not flag without warning**: `public` or `protected` symbols — they may be used by subclasses, external modules, or reflection.

Always apply DI annotation exclusions (Phase 2) before flagging any Java/Kotlin symbol.

---

### Go

The Go compiler already rejects unused imports and unused local variables. Focus on:

```bash
# Exported functions/types never referenced outside their own package
# (requires knowing the full module graph — approximate with grep)

# Unexported functions not referenced in any file
grep -rn "^func [a-z]" --include="*.go" . | \
  while IFS=: read file line decl; do
    name=$(echo "$decl" | grep -oP '(?<=func )\w+')
    count=$(grep -rn "\b${name}\b" --include="*.go" . | grep -v "^${file}:${line}:" | wc -l)
    [ "$count" -eq 0 ] && echo "$file:$line: unused func $name"
  done
```

Exclude:
- Functions matching `Test*`, `Benchmark*`, `Example*` (Go test conventions).
- `init()` functions (called automatically).
- Methods implementing a named interface (determine from `interface` declarations).

**Preferred tool:**

```bash
go build ./... 2>&1 | grep "declared and not used"
# For more: deadcode tool (golang.org/x/tools/cmd/deadcode)
deadcode -test ./... 2>&1
```

---

### Rust

```bash
cargo check 2>&1 | grep "warning: unused"
cargo clippy 2>&1 | grep "dead_code\|unused"
```

Look for:
- `#[allow(dead_code)]` annotations — these suppress warnings and may indicate known dead code. List them explicitly.
- Items marked `pub` in a binary crate (not a library) that are never called.

---

### C# / .NET

**Preferred tool:**

```bash
dotnet build 2>&1 | grep "CS0168\|CS0169\|CS0219\|CS0649\|CS8019"
# CS0168: variable declared but never used
# CS0169: private field never used
# CS0219: variable assigned but value never used
# CS0649: field never assigned
# CS8019: unnecessary using directive
```

Exclude:
- Anything in DI registration (`services.Add*` in `Program.cs` / `Startup.cs`).
- Classes with `[Serializable]` or data contract attributes.
- ASP.NET controller actions (any `public` method in a class inheriting `ControllerBase`).

---

## Phase 4: Detect Reflection and Dynamic Dispatch Patterns

Before ranking findings, scan for patterns that invoke code by name at runtime. Any symbol reachable through these patterns must be flagged with a **reflection warning** rather than reported as dead.

### Reflection call patterns by language

#### Java / Kotlin

```bash
# Class.forName, getDeclaredMethod, getMethod, invoke, newInstance
grep -rn "Class\.forName\|getDeclaredMethod\|getMethod\b\|\.invoke(\|newInstance\(\)" \
  --include="*.java" --include="*.kt" .

# Spring's ApplicationContext.getBean — retrieves beans by name or type at runtime
grep -rn "getBean\b" --include="*.java" --include="*.kt" .

# Any string that matches a class or method name in the codebase
# e.g. "UserService" as a string literal near a reflection call
```

#### Python

```bash
# getattr, __import__, importlib, eval, exec
grep -rn "getattr\|__import__\|importlib\.import_module\|eval(\|exec(" \
  --include="*.py" .
```

Python `getattr(obj, name)` allows calling any method by string name. Any method on a class that is also passed through `getattr` in the same codebase is not safely removable.

#### JavaScript / TypeScript

```bash
# Bracket notation calls: obj["methodName"]() or obj[variable]()
grep -rn '\w\+\[["'"'"']\w' --include="*.ts" --include="*.tsx" \
  --include="*.js" --include="*.jsx" .

# require() with dynamic arguments
grep -rn "require([^'\"]\|import(" --include="*.ts" --include="*.js" .
```

#### C# / .NET

```bash
grep -rn "\.GetMethod\b\|\.GetProperty\b\|\.Invoke\b\|Activator\.CreateInstance\|Type\.GetType" \
  --include="*.cs" .
```

#### Ruby

```bash
# send, public_send, method, const_get
grep -rn "\.send(\|\.public_send(\|\.method(\|Object\.const_get\|Module\.const_get" \
  --include="*.rb" .
```

### What to do with reflection findings

1. **If reflection is found, but no specific string matches the candidate symbol's name** — keep the finding at its original confidence tier; note that reflection exists in the project but does not appear to target this symbol.

2. **If a string literal matching the candidate's name appears near a reflection call** — downgrade the finding to **Low confidence** and add:

   > ⚠ Reflection risk: `"symbolName"` appears as a string literal near a reflection/dynamic dispatch call at `file:line`. This method may be invoked at runtime without a direct code reference. Verify before removing.

3. **If broad reflection is used (e.g. `getattr(obj, user_input)`, `Class.forName(config.get(...))`)** — add a project-level warning at the top of the report:

   > ⚠ This project uses dynamic method dispatch (reflection / `getattr` / `send`). Any symbol could potentially be called at runtime by name. Treat all Medium and Low confidence findings with extra caution and prefer running integration tests after any removal.

## Phase 4b: Rank Candidates by Confidence

Assign each finding a confidence tier before reporting.

| Tier       | Meaning                                   | Examples                                                                                                 |
|------------|-------------------------------------------|----------------------------------------------------------------------------------------------------------|
| **High**   | Almost certainly unused; safe to delete   | `private` method with zero references in the same file; local variable assigned but never read           |
| **Medium** | Likely unused, but verify before deleting | Package-private / internal symbol; exported function in a non-library project                            |
| **Low**    | Possibly unused, but deletion is risky    | `public` class; method that could be called via reflection or serialisation; anything near a DI boundary |

Never report Low-confidence findings without an explicit warning that they may be false positives.

## Phase 5: Output Report



Group findings by file. For each finding include: file path, line number, symbol type, symbol name, confidence tier, and a one-line reason.

```
## Dead Code Report

### Summary
- High confidence:   12 findings
- Medium confidence:  5 findings
- Low confidence:     3 findings
- DI-excluded:        8 symbols (Spring @Service / @Component)

---

### High Confidence

src/utils/StringHelper.java:42
  [private method] `normalizeWhitespace` — no references found in this file

src/utils/StringHelper.java:67
  [private field] `DEFAULT_LOCALE` — assigned but never read

src/models/User.py:18
  [import] `from datetime import timedelta` — `timedelta` not used in this file

---

### Medium Confidence

src/services/ReportService.java:110
  [package-private method] `buildCsvRow` — no references found in this package
  ⚠ Could be called by a subclass or a future addition — verify before removing.

---

### Low Confidence

src/api/UserController.java:88
  [public method] `getUserLegacy` — no call sites found in this codebase
  ⚠ Public methods may be called by external consumers or via reflection.
  ⚠ This class is a Spring @RestController — endpoint methods are invoked by the framework.

---

### DI-Managed Symbols (excluded from dead code)

Detected frameworks: Spring Boot (@Component, @Service, @RestController)

The following 8 symbols were found but excluded because they carry DI annotations:
  - UserService (@Service) — src/services/UserService.java:12
  - OrderRepository (@Repository) — src/repositories/OrderRepository.java:8
  ... (full list omitted for brevity — run with --verbose to see all)
```

### If no dead code is found

```
## Dead Code Report

No unused symbols found.

DI-managed symbols excluded from analysis: 14 (Spring Boot)
Files scanned: 87
```

### Recommended next steps

Always close the report with:
- Which dedicated tools (vulture, tsc, deadcode, PMD, etc.) would give more accurate results if not already run.
- A reminder that High-confidence findings are safe to act on; Medium and Low should be reviewed manually.
- A note that the report is a snapshot — dead code can be introduced by future changes, so running this periodically (e.g. as a CI step) is recommended.
