/** AI tools an entity is known to work with. */
export type AiTool = 'claude' | 'copilot' | 'other';

/**
 * Compatibility by entity kind. SKILL.md follows the open Agent Skills format and
 * MCP is an open protocol, so both run in Claude Code, GitHub Copilot and other
 * agents. Agents, commands and hooks use Claude Code's own file formats.
 */
export const COMPATIBILITY: Record<'skill' | 'agent' | 'command' | 'hook' | 'mcpServer', AiTool[]> = {
  skill:     ['claude', 'copilot', 'other'],
  mcpServer: ['claude', 'copilot', 'other'],
  agent:     ['claude'],
  command:   ['claude'],
  hook:      ['claude'],
};
