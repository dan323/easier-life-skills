# @dan323/easier-life-skills

CLI installer for the [easier-life-skills](https://github.com/dan323/easier-life-skills) Claude Code marketplace.

## Usage

No install needed — run directly with `npx`:

```bash
# List all available skills and bundles
npx @dan323/easier-life-skills --list

# Install a single skill
npx @dan323/easier-life-skills --skill changelog

# Install a bundle
npx @dan323/easier-life-skills --bundle backend-developer

# Preview without writing files
npx @dan323/easier-life-skills --bundle backend-developer --dry-run

# Skip confirmation prompt
npx @dan323/easier-life-skills --skill changelog --yes
```

## Bundles

| Bundle                   | Skills                                                             |
|--------------------------|--------------------------------------------------------------------|
| `backend-developer`      | find-breaking-rest-api, find-dead-code, improve-logging, changelog |
| `open-source-maintainer` | changelog, document-project, brainstorm, find-skills               |
| `code-quality`           | find-dead-code, improve-logging, find-breaking-rest-api            |
| `full-stack`             | all skills                                                         |

## Requirements

- Node.js 18+
- [Claude Code](https://claude.ai/code) installed

## After Installing

Reload Claude Code, then activate skills with:
```
/plugin install changelog@easier-life-skills
```
