#!/usr/bin/env python3

"""
memplan PostToolUse hook — tracks Write/Edit tool calls automatically.

Reads hook context from stdin (JSON), filters for Write/Edit operations,
and updates code-map.mem and hot.mem via memplan-cli.js. This keeps
memplan's file tracking in sync automatically without requiring manual
memplan/act invocations after every file change.
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def get_plugin_root() -> str:
    """
    Get the CLAUDE_PLUGIN_ROOT for the memplan plugin.

    Returns the value of CLAUDE_PLUGIN_ROOT environment variable,
    or attempts to find the plugin root by walking up from this script.
    """
    plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT")
    if plugin_root:
        return plugin_root

    # Fallback: this script is at hooks/memplan-post-tooluse.py,
    # so plugin root is two levels up
    return str(Path(__file__).parent.parent)


def update_code_map(plugin_root: str, working_dir: str, file_path: str, tool_name: str) -> None:
    """
    Update code-map.mem with the modified file using memplan-cli.js.

    Args:
        plugin_root: Path to the memplan plugin root
        working_dir: Working directory containing .memplan/
        file_path: Path to the file that was modified
        tool_name: Name of the tool (Write or Edit)
    """
    cli_path = os.path.join(plugin_root, "bin", "memplan-cli.js")
    if not os.path.isfile(cli_path):
        return

    date_stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Determine purpose based on tool: "created" for Write, "modified" for Edit
    purpose = "created" if tool_name == "Write" else "modified"

    # Make file path relative to working directory for cleaner storage
    try:
        rel_path = os.path.relpath(file_path, working_dir)
    except ValueError:
        # File is on a different drive on Windows, use absolute path
        rel_path = file_path

    # Append to code-map.mem
    # Format: +file:path=<path>,purpose=<purpose>,touched=~<DATE>
    value = f"path={rel_path},purpose={purpose},touched=~{date_stamp}"

    try:
        subprocess.run(
            ["node", cli_path, "append", working_dir, "memory/code-map.mem", "file", value],
            check=False,
            capture_output=True,
            timeout=5,
        )
    except Exception:
        pass


def update_hot_files(plugin_root: str, working_dir: str, file_path: str) -> None:
    """
    Update hot.mem with the recently modified file using memplan-cli.js.

    Reads current hot files, adds the new file, keeps the 5 most recent.

    Args:
        plugin_root: Path to the memplan plugin root
        working_dir: Working directory containing .memplan/
        file_path: Path to the file that was modified
    """
    cli_path = os.path.join(plugin_root, "bin", "memplan-cli.js")
    if not os.path.isfile(cli_path):
        return

    hot_mem_path = os.path.join(working_dir, ".memplan", "memory", "hot.mem")

    # Read current hot files
    hot_files = []
    if os.path.isfile(hot_mem_path):
        try:
            with open(hot_mem_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("hot-files:"):
                        hot_files_str = line.split(":", 1)[1].strip()
                        if hot_files_str:
                            hot_files = [f.strip() for f in hot_files_str.split("|")]
                        break
        except Exception:
            pass

    # Make file path relative to working directory
    try:
        rel_path = os.path.relpath(file_path, working_dir)
    except ValueError:
        rel_path = file_path

    # Add new file to front of list (most recent first)
    if rel_path in hot_files:
        hot_files.remove(rel_path)
    hot_files.insert(0, rel_path)

    # Keep only 5 most recent
    hot_files = hot_files[:5]

    # Write back to hot.mem
    hot_files_value = "|".join(hot_files)
    date_stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    try:
        subprocess.run(
            ["node", cli_path, "set", working_dir, "memory/hot.mem", "hot-files", hot_files_value],
            check=False,
            capture_output=True,
            timeout=5,
        )
        subprocess.run(
            ["node", cli_path, "set", working_dir, "memory/hot.mem", "last-updated", f"~{date_stamp}"],
            check=False,
            capture_output=True,
            timeout=5,
        )
    except Exception:
        pass


def main() -> int:
    """
    Main hook entry point.

    Reads PostToolUse context from stdin, checks if the tool is Write or Edit,
    and if so, updates code-map.mem and hot.mem automatically.

    Returns:
        0 on success or benign skip
    """
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0

    if not isinstance(data, dict):
        return 0

    # Extract tool name and parameters from hook context
    tool_name = data.get("tool_name", "")
    tool_params = data.get("tool_parameters", {})
    working_dir = data.get("working_directory", os.getcwd())

    # Only process Write and Edit tool calls
    if tool_name not in ("Write", "Edit"):
        return 0

    # Extract file path from tool parameters
    file_path = tool_params.get("file_path", "")
    if not file_path:
        return 0

    # Check if .memplan/ exists (memplan-enabled project)
    memplan_dir = os.path.join(working_dir, ".memplan")
    if not os.path.isdir(memplan_dir):
        return 0

    # Get plugin root for memplan-cli.js
    plugin_root = get_plugin_root()

    # Update memplan tracking files
    update_code_map(plugin_root, working_dir, file_path, tool_name)
    update_hot_files(plugin_root, working_dir, file_path)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
