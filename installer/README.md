# @dan323/easier-life-skills

CLI installer for the [easier-life-skills](https://github.com/dan323/easier-life-skills) Claude Code marketplace.

## How it works

Every install goes through Claude Code's `claude plugin marketplace add` + `claude plugin install` so the plugin lands at `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` and is registered in `~/.claude/plugins/installed_plugins.json`. From that moment on, `claude plugin list`, `claude plugin update`, and `claude plugin uninstall` all see and operate on it — no parallel install path, no bespoke registry.

The installer routes per source repo:

- **Source repo has `.claude-plugin/marketplace.json`** → `claude plugin marketplace add <owner>/<repo>` (if not already registered) + `claude plugin install <pluginName>@<repo>`.
- **Source repo is plugin-only** (no marketplace.json — e.g. `mattpocock/skills`) → the installer synthesises a per-plugin shim marketplace at `~/.config/easier-life-skills/shims/<pluginName>/.claude-plugin/marketplace.json` whose single plugin entry uses Claude Code's `source: { source: "url", url: "https://github.com/<owner>/<repo>" }` mechanism. The shim is registered via `claude plugin marketplace add <shim-path>`, then `claude plugin install <pluginName>@<pluginName>` pulls the upstream repo through Claude Code's normal install path. The shim marketplace is named after the plugin (so it never collides with the upstream marketplace names) and is the same single file no matter how many times it's installed.

The npx side handles three things on top of those `claude plugin` calls:

- Fetching the marketplace's `skills_index.json` so `--list` and `--search` work as fast offline discovery.
- Caching the marketplace registration list at the start of each run, so already-registered marketplaces are skipped silently.
- De-duping plugin installs per session, so a bundle that draws 8 skills from one plugin only emits one `claude plugin install`.

## Usage

No install needed — run directly with `npx`:

```bash
# Discovery (does not require claude on $PATH)
npx @dan323/easier-life-skills --list
npx @dan323/easier-life-skills --search logging

# Install (delegates to: claude plugin marketplace add + claude plugin install)
npx @dan323/easier-life-skills --skill changelog
npx @dan323/easier-life-skills --bundle backend-developer

# Update all plugins installed from this marketplace
#   (delegates to: claude plugin list --json + claude plugin update)
npx @dan323/easier-life-skills --update

# Update a single installed plugin
npx @dan323/easier-life-skills --update changelog

# Preview the claude commands without running them
npx @dan323/easier-life-skills --bundle backend-developer --dry-run

# Skip confirmation prompt
npx @dan323/easier-life-skills --skill changelog --yes
```

## What each flag does

| Flag                     | Delegates to                                                                                                       |
|--------------------------|--------------------------------------------------------------------------------------------------------------------|
| `--list`                 | No claude calls (reads `skills_index.json` only).                                                                  |
| `--search <query>`       | No claude calls.                                                                                                   |
| `--skill <name>`         | If the skill's source has marketplace.json: `claude plugin marketplace add <owner>/<repo>` (if missing) + `claude plugin install <pluginName>@<repo>`. If plugin-only: writes a shim marketplace.json under `~/.config/easier-life-skills/shims/<pluginName>/`, registers it via `claude plugin marketplace add <shim-path>`, then `claude plugin install <pluginName>@<pluginName>`. |
| `--bundle <id>`          | Same as `--skill` but looped over every skill in the bundle. Marketplace registrations and plugin installs are cached per session (8 skills from one plugin → one install). Shim marketplaces are written / registered once per plugin-only repo. |
| `--update`               | `claude plugin list --json` to find plugins from any of the marketplaces this index knows about (real upstream marketplaces *plus* the synthetic shim marketplaces this installer registered), then `claude plugin update <pluginName>@<marketplace>` for each. |
| `--update <name>`        | Same, but only one plugin (errors with exit 1 if `<name>` isn't installed from one of the marketplaces this index covers). |
| `--dry-run`              | Prints the claude commands and shim writes that *would* run, doesn't execute them.                                  |
| `--yes`                  | Skips the confirmation prompt before any install/update.                                                           |

## Bundles

Run `npx @dan323/easier-life-skills --list` to see the up-to-date set. Highlights:

| Bundle                   | Mix of sources                                                                |
|--------------------------|-------------------------------------------------------------------------------|
| `backend-developer`      | dan323/easier-life-skills only                                                |
| `open-source-maintainer` | dan323/easier-life-skills only                                                |
| `tdd-practitioner`       | mattpocock/skills (plugin-only, cloned) + obra/superpowers + anthropics/skills |
| `planning-and-execution` | dan323/easier-life-skills + obra/superpowers                                  |
| `skill-author`           | dan323/easier-life-skills + anthropics/skills + mattpocock/skills + obra/superpowers |
| `frontend-designer`      | anthropics/skills only                                                        |

## Requirements

- Node.js 18+
- [Claude Code](https://claude.ai/code) — the `claude` CLI must be on `$PATH` for `--skill`, `--bundle`, and `--update`. `--list` and `--search` work without it.

## After Installing

Restart Claude Code to pick up the newly-installed (or updated) plugin. Whether the install went through a real upstream marketplace or a shim marketplace, the plugin is registered in `~/.claude/plugins/installed_plugins.json` by the time `npx` returns and `claude plugin list` shows it like any other.

To uninstall: `claude plugin uninstall <pluginName>@<marketplace>` works for both paths. The shim marketplace files under `~/.config/easier-life-skills/shims/<plugin>/` are safe to leave in place (they're tiny and idempotent) — re-installing the same plugin reuses the existing shim.
