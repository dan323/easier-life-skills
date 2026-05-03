import type { Plugin, Skill, Agent, McpServer, Command, Bundle } from './types.ts';

export interface AppState {
  plugins:          Plugin[];
  skills:           Skill[];
  agents:           Agent[];
  mcpServers:       McpServer[];
  commands:         Command[];
  bundles:          Bundle[];
  query:            string;
  activeCategories: Set<string>;
  activeRepos:      Set<string>;
  view:             string;
}

export const state: AppState = {
  plugins:          [],
  skills:           [],
  agents:           [],
  mcpServers:       [],
  commands:         [],
  bundles:          [],
  query:            '',
  activeCategories: new Set(),
  activeRepos:      new Set(),
  view:             'plugins',
};
