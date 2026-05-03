---
name: find-breaking-rest-api
description: >
  Analyze git history and report breaking changes in REST APIs. Use when the user asks to
  "find breaking API changes", "check for breaking REST changes", "what endpoints did I break",
  "is this a breaking change", "compare API versions", "what changed in the API", or anything
  about REST endpoint compatibility. Works for Flask, FastAPI, Express, Spring Boot, and
  OpenAPI/Swagger specs. Handles multi-file routers, shared request/response schemas, auth
  changes, and path prefix changes. Reads git history — no external tools required.
  TRIGGER this skill whenever the user mentions REST APIs, endpoints, routes, or API versioning
  alongside words like "breaking", "changed", "removed", "compatible", or "diff".
tools: Bash, Read, Glob, Grep
model: sonnet
metadata:
  version: 3.0
---

# Find Breaking REST API Changes

Compare the REST API surface between two git revisions and produce a structured, actionable report. A breaking change is any change that requires existing API clients to update their code.

**This skill is read-only.** It produces a report. It does not modify any file.

---

## Investigation

### 1. Determine the comparison range

If the user didn't specify refs, use the most recent semver tag vs HEAD. If there are no tags, use HEAD~1 vs HEAD. Tell the user which range you're comparing before proceeding.

```bash
BASE=$(git tag --sort=-version:refname | grep -E '^v?[0-9]+\.[0-9]+' | head -1)
[ -z "$BASE" ] && BASE="HEAD~1"
git diff --name-only "$BASE" HEAD
```

### 2. Find and compare the API surface

Get the list of changed files. Then:

- **If route/controller files changed**: read them at BASE and HEAD, extract all routes with their full paths (prefix + route path). Compare method, path, request schema, response schema, auth requirements.
- **If only schema/model/DTO files changed**: find all route files that *use* those schemas — even if those route files are *not* in the diff — and determine which endpoints are affected. This cross-file tracing is essential: a schema change with zero changed route files can still break every endpoint that uses it.
- **Both may apply**: a commit can change both schemas and routes simultaneously.

Always trace prefixes: Flask `url_prefix`, FastAPI router prefixes, Spring `@RequestMapping` at the class level, Express `app.use('/prefix', router)`. The full public path is what clients call.

### 3. Classify each change

**Breaking changes** — require client updates:

| Change                                                       | Client impact                           |
|--------------------------------------------------------------|-----------------------------------------|
| Endpoint removed                                             | 404 or 405                              |
| Path changed                                                 | 404 on old path                         |
| HTTP method changed                                          | 405                                     |
| Required request field added                                 | 400 if not sent                         |
| Optional request field made required                         | 400 if not sent                         |
| Response field removed                                       | `undefined`/null on client              |
| Response field type changed incompatibly                     | Parse error on client                   |
| Auth added to previously open endpoint                       | 401/403                                 |
| Auth scheme changed                                          | 401 with old credentials                |
| Status code changed                                          | Client branching on status codes breaks |
| Shared schema: response field removed / required field added | All endpoints using schema are affected |

**Non-breaking changes** — safe to ship:

- New endpoint added
- New optional request field added
- New optional response field added
- Auth removed from endpoint (clients with credentials still work)
- Internal implementation change (no contract change)

**Edge cases** — flag with a note:
- Path parameter renamed (`/:id` → `/:userId`): non-breaking for URL construction, but note it
- Required field made optional: non-breaking for clients that send it; flag as behavioral change
- Redirect added (301/302): low risk if clients follow redirects

**Severity** — assign to each breaking change:
- **HIGH**: endpoint removed, auth added to open endpoint, required field added to request
- **MEDIUM**: response field removed, response type changed, path changed, status code changed
- **LOW**: optional field made required when most clients already send it, path param renamed

---

## Report Format

Always use this exact structure. Every section is required (write "None" if empty).

```
## Breaking REST API Change Report

Comparing: {BASE} → HEAD  |  {date}
Route files changed: {N}  |  Shared schemas changed: {N}  |  Files traced (unchanged): {list or 0}

---

### Summary

| Endpoint | Change | Severity | Client action |
|----------|--------|----------|---------------|
| POST /api/orders | Required field added: `sourceChannel` | HIGH | Send `sourceChannel` in all POST /api/orders requests |
| GET /api/users/:id | Response field removed: `phone` | MEDIUM | Remove reads of `.phone` from response handling |
| DELETE /api/v1/users/:id | Endpoint removed | HIGH | Migrate to DELETE /api/v2/users/:id |

Total breaking: {N}  |  Total non-breaking: {N}

---

### Breaking Changes

#### {Endpoint or schema name}  [{severity}]

{file:line}
- **What changed**: {specific field/path/method that changed}
- **Why it breaks clients**: {concrete impact — 400, 404, null, parse error, etc.}
- **Client action required**: {exact step — "add field X to request body", "update path from X to Y", "handle null for field Z"}
{If discovered via shared schema in unchanged file: "Discovered via shared schema `SchemaName` in `file.py` — this route file was not in the diff"}

---

### Non-Breaking Changes

- {brief description}

---

### Recommended next steps

- {specific action tailored to what was found — not generic advice}
```

### Example breaking change entry

```
#### POST /api/orders, POST /api/admin/orders  [HIGH]

src/main/java/com/example/dto/CreateOrderRequest.java:34
- **What changed**: Required field `sourceChannel` added (`@NotBlank`)
- **Why it breaks clients**: Clients not sending `sourceChannel` will receive HTTP 400
- **Client action required**: Add `sourceChannel` (non-empty string) to all POST /api/orders and POST /api/admin/orders request bodies
Discovered via shared DTO `CreateOrderRequest` in `OrderController.java` and `AdminOrderController.java` — neither controller file was in the diff
```

### If no breaking changes found

```
## Breaking REST API Change Report

Comparing: {BASE} → HEAD  |  {date}
Route files changed: {N}  |  Shared schemas changed: {N}

No breaking REST API changes detected.

Non-breaking changes: {list}

All changes are backward-compatible with {BASE}.
```

### If no REST API surface was affected

```
## Breaking REST API Change Report

Comparing: HEAD~1 → HEAD

No REST API surface was affected by these changes.
Changed files: {list — tests, README, internal utilities, etc.}
```
