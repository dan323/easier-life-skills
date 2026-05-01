/* state.js — shared mutable state for the catalog */

export const state = {
  plugins:          [],   // all loaded plugins across all repos
  skills:           [],   // all loaded skills across all repos
  agents:           [],   // all loaded agents across all repos
  mcpServers:       [],   // all loaded MCP servers across all repos
  bundles:          [],   // all loaded bundles across all repos
  query:            '',
  activeCategories: new Set(),
  view:             'plugins',   // 'plugins' | 'skills' | 'agents' | 'mcpServers' | 'bundles'
};
