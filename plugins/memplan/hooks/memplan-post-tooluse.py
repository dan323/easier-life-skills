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


def escape_memscript(text: str) -> str:
    """
    Escape MemScript special characters in text values.

    Per memscript-v1.md:93-100, `,`, `|`, `=` are structural characters
    that must be escaped when they appear in text values to avoid corrupting
    the entry format.

    Args:
        text: Text that may contain special characters

    Returns:
        Text with special characters escaped
    """
    return text.replace('\\', '\\\\').replace(',', '\\,').replace('|', '\\|').replace('=', '\\=')


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
        # File is on a different drive on Windows, skip it
        return

    # Skip files outside the project directory
    if rel_path.startswith(".."):
        return

    # Escape special MemScript characters in the path
    rel_path_escaped = escape_memscript(rel_path)

    # Append to code-map.mem
    # Format: +file:path=<path>,purpose=<purpose>,touched=~<DATE>
    value = f"path={rel_path_escaped},purpose={purpose},touched=~{date_stamp}"

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
    Update hot.mem with the recently modified file using memplan-cli.js hot-bump.

    Uses the hot-bump command for atomic LRU-style updates that avoid race conditions.

    Args:
        plugin_root: Path to the memplan plugin root
        working_dir: Working directory containing .memplan/
        file_path: Path to the file that was modified
    """
    cli_path = os.path.join(plugin_root, "bin", "memplan-cli.js")
    if not os.path.isfile(cli_path):
        return

    # Make file path relative to working directory
    try:
        rel_path = os.path.relpath(file_path, working_dir)
    except ValueError:
        # File is on a different drive on Windows, skip it
        return

    # Skip files outside the project directory
    if rel_path.startswith(".."):
        return

    # Escape special MemScript characters in the path
    rel_path_escaped = escape_memscript(rel_path)

    # Use hot-bump command for atomic update
    try:
        subprocess.run(
            ["node", cli_path, "hot-bump", working_dir, rel_path_escaped],
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
    # Claude Code PostToolUse hook uses 'tool_input' and 'cwd', not 'tool_parameters' and 'working_directory'
    tool_name = data.get("tool_name", "")
    tool_input = data.get("tool_input", {})
    working_dir = data.get("cwd", os.getcwd())

    # Only process Write and Edit tool calls
    if tool_name not in ("Write", "Edit"):
        return 0

    # Extract file path from tool input
    file_path = tool_input.get("file_path", "")
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
