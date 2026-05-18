# ADR 0011 — When to bundle multiple skills into one plugin vs. ship them as siblings

- **Status**: Accepted
- **Date**: 2026-05-14 (rule first applied), 2026-05-18 (criteria codified in writing)
- **Anchor commits**: `ac56d2f` (v1.25.1 — first application: `docs` + `code-audit` bundle plugins), `a9b9ac1` (most recent reapplication: merge `gh-project-sync` into `auto-board-task`)
- **Scope**: All plugins under `plugins/`; informs `scaffold` skill defaults

> Unlike ADR-0001 through ADR-0010, this ADR codifies a selection rule
> that was *applied* on 2026-05-14 (when the `docs` and `code-audit`
> bundle plugins were first created in `ac56d2f`) but never *written
> down* until 2026-05-18, when the same rule had to be invoked again
> to justify merging `gh-project-sync` into `auto-board-task` in
> `a9b9ac1`. The decision date is 2026-05-14 (when the pattern was
> first chosen); the ADR-written date is 2026-05-18. Future
> plugin-shape decisions should cite this ADR (or supersede it).

## Context

Plugins in this repo come in two shapes:

- **Atomic** — one skill per plugin, plugin name == skill name. The
  default and the majority (`brainstorm`, `find-skills`, `scaffold`,
  `task-agent`, `workflow`, …).
- **Bundle** — one plugin manifest, multiple sub-skills under
  `skills/`. Three current examples: `docs` (`changelog` +
  `document-project` + `explain-project`), `code-audit`
  (`find-dead-code` + `find-breaking-rest-api` + `improve-logging`),
  `auto-board-task` (`auto-board-task` + `gh-project-sync`).

The choice between the two isn't obvious — bundling has both real
upsides (shared install, lockstep versioning) and real costs
(reduced reuse, harder discovery for sub-skills). Without a written
rule, the same conversation recurs every time a new plugin's shape
is debated.

The recurring question is: *"these N skills feel related — should I
bundle them or ship them as sibling plugins?"*

## Decision

**Default to atomic. Bundle only when at least two of the three
criteria below hold.** A single criterion is insufficient — it's
the *combination* that justifies the loss of independent
installability.

1. **Shared internals.** The skills share non-trivial files —
   `references/`, `scripts/`, or `evals/` fixtures — that would have
   to be duplicated or symlinked across plugins if split. Pure
   topical relatedness ("they're both about documentation") is not
   shared internals; this criterion needs concrete files.
2. **Lockstep versioning.** A breaking change in one skill almost
   always implies coordinated changes in the others. Splitting them
   means bumping N `plugin.json` versions every release; bundling
   means one bump per coordinated release. If the skills have
   independent change cadences, this criterion does not apply.
3. **Always installed together.** Installing one skill without the
   others leaves the user with something half-useful in practice.
   "A user *could* find the others useful too" is not this criterion
   — this criterion is "a user has no reason to install one without
   the others, and installing them separately is friction without
   benefit".

**Independent of the criteria above, never bundle a skill that is
meaningfully useful standalone.** The cost — surfacing the wrong
public interface — is too high. Conversely, a skill that exists
*only* to support another skill in the same plugin is a strong
indicator that bundling is correct.

## Examples (how the rule applies in practice)

| Plugin | Shape | Why |
|---|---|---|
| `docs` | Bundle | Shared narrative-doc reference patterns (criterion 1); changes to one usually touch the others (criterion 2); users picking documentation tooling want the set (criterion 3). All three hold. |
| `code-audit` | Bundle | Same triad as `docs`, applied to static-analysis tooling. |
| `auto-board-task` | Bundle | `gh-project-sync` is never useful outside this plugin (criterion 3 in its strongest form — the "never bundle a useful-standalone skill" guard is *inverted* here). It's invoked twice by the workflow; it has no external use case. |
| `task-agent` | Atomic | One skill, but the skill *spawns* a sub-agent (`copilot-review-fixer`) that lives in the same plugin. The sub-agent is a runtime subroutine of the skill, not a separate skill — different question (see ADR for sub-agents if/when written). |
| `find-skills`, `brainstorm`, `workflow` | Atomic | Each is meaningfully useful standalone. No shared internals with anything else. Splitting buys composability and discoverability. |

## Consequences

- New plugin authors have a clear default: start atomic. Bundle only
  if you can name at least two of the three criteria above with
  specific files / changes / use cases.
- The `scaffold` skill should generate atomic plugins by default.
  Bundle plugins remain a hand-crafted exception, not a template.
- When a bundled skill *would have been* useful standalone but is
  bundled anyway (the `gh-project-sync` case), the ADR for that
  specific decision should document why — the public-interface
  cost is real and worth recording per case.
- Reviewing the criteria periodically against the existing bundle
  plugins is worthwhile. If `docs` ever loses its shared internals
  (e.g., the `changelog` skill diverges entirely from
  `document-project`), criterion 1 stops applying and the bundle
  should be reconsidered.

## Notes

This ADR was written 4 days after the rule was first applied — the
criteria were articulated explicitly only in the conversation that
led to `a9b9ac1`, not at the time of the original `docs`/`code-audit`
decision (`ac56d2f`). The rule was *implicit* in those earlier
plugin shapes; it's *explicit* now. If the criteria turn out to
mis-classify a future case, the right response is to supersede this
ADR rather than silently apply a different rule.

The "sub-skill spawned by another skill in the same plugin" case
(e.g., `task-agent`'s `copilot-review-fixer`) is *not* covered by
this ADR — that's about agent composition, not plugin shape. A
future ADR may codify it; for now, treat each case on its merits.
