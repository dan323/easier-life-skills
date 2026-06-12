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

    # Get working directory from hook context.
    # Claude Code provides the project directory as "cwd" in the hook payload.
    working_directory = data.get("cwd", os.getcwd())
    memplan_dir = os.path.join(working_directory, ".memplan")

    # Skip if memplan not initialized
    if not os.path.isdir(memplan_dir):
        return 0

    # Use session_id from the hook payload to detect new sessions.
    # Store the last-seen session_id in a lightweight marker so the hook
    # fires exactly once per session even across multiple tool calls.
    session_id = data.get("session_id", "")
    session_id_marker = os.path.join(memplan_dir, ".session_id")

    last_session_id = ""
    try:
        with open(session_id_marker, encoding="utf-8") as f:
            last_session_id = f.read().strip()
    except OSError:
        pass  # File absent on first run — treat as new session

    # Skip if already handled this session
    if session_id and session_id == last_session_id:
        return 0

    # First tool call of this session - invoke memplan/start logic
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
    inbox_ok = False
    try:
        result = subprocess.run(
            ["node", cli_path, "inbox", working_directory],
            capture_output=True,
            text=True,
            cwd=working_directory,
            timeout=5
        )
        # Only surface inbox output when ops were actually applied — printing
        # "inbox: 0 ops applied" would inject useless tokens into every session.
        stdout = result.stdout.rstrip() if result.stdout else ""
        if result.returncode == 0 and stdout and not stdout.startswith("inbox: 0 ops applied"):
            print(stdout)
        inbox_ok = result.returncode == 0
    except Exception:
        pass  # Inbox processing is optional

    # Only record the session_id after the full orientation (inbox processing)
    # has completed. This prevents memplan/update-mem from treating partial
    # hook runs as proof that memplan/start orientation happened.
    if inbox_ok and session_id:
        try:
            with open(session_id_marker, "w", encoding="utf-8") as f:
                f.write(session_id + "\n")
        except Exception:
            pass  # Session marker write failure is non-fatal

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
