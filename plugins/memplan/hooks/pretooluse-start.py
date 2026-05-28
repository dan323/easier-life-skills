#!/usr/bin/env python3

import json
import os
import sys
import subprocess

def main() -> int:
    """
    PreToolUse hook for memplan plugin.

    Triggers memplan/start on the first tool call of a session by checking
    if .memplan/.session exists. If absent and .memplan/ is initialized,
    runs the memplan/start skill logic.
    """
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0

    if not isinstance(data, dict):
        return 0

    # Get working directory from hook context
    working_directory = data.get("working_directory", os.getcwd())
    memplan_dir = os.path.join(working_directory, ".memplan")
    session_marker = os.path.join(memplan_dir, ".session")

    # Skip if memplan not initialized
    if not os.path.isdir(memplan_dir):
        return 0

    # Skip if session marker already exists (not first tool call)
    if os.path.exists(session_marker):
        return 0

    # First tool call of session - invoke memplan/start logic
    # The hook cannot directly invoke the skill, but can replicate its core logic
    # or use the CLI to achieve the same effect.

    # Get the plugin root for CLI access
    plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT")
    if not plugin_root:
        # Fallback: try to find memplan-cli.js relative to this script
        plugin_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    cli_path = os.path.join(plugin_root, "bin", "memplan-cli.js")
    if not os.path.isfile(cli_path):
        return 0

    # Phase 1: Process inbox (if needed)
    try:
        result = subprocess.run(
            ["node", cli_path, "inbox", working_directory],
            capture_output=True,
            text=True,
            cwd=working_directory,
            timeout=5
        )
        # inbox output is printed by the CLI itself
        if result.returncode == 0 and result.stdout:
            print(result.stdout.rstrip())
    except Exception:
        pass  # Inbox processing is optional

    # Phase 5: Write session marker
    # Create the session marker to indicate orientation happened
    try:
        from datetime import datetime, timezone
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
        with open(session_marker, "w", encoding="utf-8") as f:
            f.write(timestamp + "\n")
    except Exception:
        pass  # Session marker write failure is non-fatal

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
