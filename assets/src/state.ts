import type { Plugin, Skill, Agent, McpServer, Bundle } from './types.ts';

export interface AppState {
  plugins:          Plugin[];
  skills:           Skill[];
  agents:           Agent[];
  mcpServers:       McpServer[];
  bundles:          Bundle[];
  query:            string;
  activeCategories: Set<string>;
  view:             string;
}

export const state: AppState = {
  plugins:          [],
  skills:           [],
  agents:           [],
  mcpServers:       [],
  bundles:          [],
  query:            '',
  activeCategories: new Set(),
  view:             'plugins',
};
