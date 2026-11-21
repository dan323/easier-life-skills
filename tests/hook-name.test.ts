import { describe, expect, it } from 'vitest';
import { hookNameFromCommand } from '../scripts/lib/fetch-marketplace.ts';

describe('hookNameFromCommand', () => {
  it('strips quotes from a quoted command', () => {
    expect(hookNameFromCommand('"${CLAUDE_PLUGIN_ROOT}/hooks/setup-shims.sh"')).toBe('setup-shims');
    expect(hookNameFromCommand('python3 "${CLAUDE_PLUGIN_ROOT}/hooks/skill_router.py"')).toBe('skill-router');
    expect(hookNameFromCommand("bash '/x/run.sh'")).toBe('run');
  });
  it('handles unquoted commands', () => {
    expect(hookNameFromCommand('${CLAUDE_PLUGIN_ROOT}/hooks/pre_check.py')).toBe('pre-check');
  });
});
