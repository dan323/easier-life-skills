# Scaffold Examples

This directory contains the **expected output** of a known scaffold
invocation. It exists so:

1. Evals can diff a real scaffold run against a stable reference.
2. Contributors can see at a glance what a freshly scaffolded plugin
   looks like before any TODOs are filled in.

It is **not** itself a real plugin — the build script ignores anything
under `plugins/scaffold/examples/` because it doesn't sit at
`plugins/<name>/` and has no `.claude-plugin/plugin.json` of its own.

## `scaffolded-output/`

The result of running:

```text
scaffold name=index-audit description="Audit database indexes" category=code-quality
```

Tree:

```
scaffolded-output/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── index-audit/
        ├── SKILL.md
        └── evals/
            └── evals.json
```

To compare a real run against this reference:

```bash
diff -r /tmp/eval-scaffold-0/plugins/index-audit \
        plugins/scaffold/examples/scaffolded-output
```
